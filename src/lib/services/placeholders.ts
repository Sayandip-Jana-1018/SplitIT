import { randomBytes } from 'node:crypto';
import { createAuditLog } from '@/lib/auditLog';
import { prisma } from '@/lib/db';
import { pushToPhones } from '@/lib/notifications';
import type { GroupOutcome } from './groups';

/**
 * Friends who aren't on SplitIT yet (docs/mobile/ROADMAP.md, Phase 6 step 1), for the website and
 * the phone alike.
 *
 * A placeholder is an ordinary User row with a name and no email or password: expenses, splits,
 * settlements and balances work for them unchanged, and they can never sign in. Any member of a
 * group can add one by name. Each has a claim link of their own; whoever opens it and signs in
 * becomes them: every membership, expense paid, split and settlement moves to that account in one
 * transaction, and the placeholder is gone (so the link works once). Already in the group, the two
 * are merged: a split on the same expense is added together, and a payment between the two of
 * them is dropped, which moves nobody else's balance.
 */

const NAME_MAX = 60;

function newClaimToken(): string {
    return randomBytes(24).toString('base64url');
}

/** Where a claim link leads: the website's claim page, which works with or without the app. */
export function claimUrl(origin: string, token: string): string {
    return `${origin.replace(/\/$/, '')}/claim/${token}`;
}

async function memberOf(userId: string, groupId: string) {
    return prisma.groupMember.findFirst({ where: { groupId, userId, group: { deletedAt: null } }, select: { id: true } });
}

/** Adds someone by name. Any member may; the name is what the group will see until they claim it. */
export async function addPlaceholder(actor: { id: string }, groupId: string, rawName: string): Promise<GroupOutcome<{ userId: string; name: string; claimToken: string }>> {
    const name = rawName.trim().replace(/\s+/g, ' ');
    if (name.length === 0 || name.length > NAME_MAX) return { ok: false, status: 400, error: `A name of 1 to ${NAME_MAX} characters, please.`, code: 'invalid_name' };
    if (!(await memberOf(actor.id, groupId))) return { ok: false, status: 404, error: 'Group not found', code: 'not_found' };

    const claimToken = newClaimToken();
    const user = await prisma.user.create({
        data: { name, placeholder: true, claimToken, placeholderById: actor.id, memberships: { create: { groupId, role: 'member' } } },
    });
    await createAuditLog({ userId: actor.id, action: 'create', entityType: 'group_member', entityId: user.id, details: { groupId, name, placeholder: true } });
    return { ok: true, value: { userId: user.id, name, claimToken } };
}

/** A placeholder's claim link, for a member of one of their groups to send; `renew` replaces it (sent to the wrong person). */
export async function placeholderLink(actor: { id: string }, groupId: string, userId: string, { renew }: { renew: boolean }): Promise<GroupOutcome<{ claimToken: string }>> {
    if (!(await memberOf(actor.id, groupId))) return { ok: false, status: 404, error: 'Group not found', code: 'not_found' };
    const target = await prisma.user.findFirst({ where: { id: userId, placeholder: true, memberships: { some: { groupId } } }, select: { claimToken: true } });
    if (!target) return { ok: false, status: 404, error: 'They have already joined SplitIT.', code: 'not_placeholder' };
    if (target.claimToken && !renew) return { ok: true, value: { claimToken: target.claimToken } };
    const claimToken = newClaimToken();
    await prisma.user.update({ where: { id: userId }, data: { claimToken } });
    return { ok: true, value: { claimToken } };
}

/** What a claim link opens: who you'd become, and in which groups. */
export async function previewClaim(token: string, userId?: string): Promise<GroupOutcome<{ name: string; groups: { id: string; name: string; emoji: string }[]; alreadyIn: string[] }>> {
    const placeholder = await prisma.user.findFirst({
        where: { claimToken: token, placeholder: true },
        select: { name: true, memberships: { where: { group: { deletedAt: null } }, select: { group: { select: { id: true, name: true, emoji: true } } } } },
    });
    if (!placeholder) return { ok: false, status: 404, error: 'This link has been used or replaced. Ask your friend for a new one.', code: 'invalid_claim' };
    const groups = placeholder.memberships.map((membership) => membership.group);
    const alreadyIn = userId
        ? (await prisma.groupMember.findMany({ where: { userId, groupId: { in: groups.map((group) => group.id) } }, select: { groupId: true } })).map((row) => row.groupId)
        : [];
    return { ok: true, value: { name: placeholder.name ?? 'Your friend', groups, alreadyIn } };
}

/**
 * Becomes the placeholder: everything theirs moves to `user`, in one transaction. A link opened by
 * two people at once is claimed by one; the other is told it's used.
 */
export async function claimPlaceholder(user: { id: string; name: string | null }, token: string): Promise<GroupOutcome<{ groupIds: string[]; name: string }>> {
    const outcome = await prisma.$transaction(async (tx) => {
        const placeholder = await tx.user.findFirst({ where: { claimToken: token, placeholder: true }, select: { id: true, name: true } });
        if (!placeholder) return null;
        // Taking the token locks the row: a second, simultaneous claim waits, then finds it gone.
        const taken = await tx.user.updateMany({ where: { id: placeholder.id, claimToken: token }, data: { claimToken: null } });
        if (taken.count === 0) return null;
        return mergeInto(tx, placeholder, user.id);
    });
    if (!outcome) return { ok: false, status: 404, error: 'This link has been used or replaced. Ask your friend for a new one.', code: 'invalid_claim' };

    await createAuditLog({ userId: user.id, action: 'update', entityType: 'group_member', entityId: outcome.placeholderId, details: { claimedPlaceholder: outcome.name, groupIds: outcome.groupIds } });
    const others = await prisma.groupMember.findMany({
        where: { groupId: { in: outcome.groupIds }, userId: { not: user.id }, user: { placeholder: false } },
        select: { userId: true, group: { select: { id: true, name: true } } },
    });
    if (others.length > 0) {
        const who = user.name || outcome.name;
        const rows = others.map((member) => ({
            userId: member.userId,
            actorId: user.id,
            type: 'member_joined',
            title: 'A friend joined SplitIT',
            body: `${who} is now on SplitIT as ${outcome.name} in "${member.group.name}"`,
            link: `/groups/${member.group.id}`,
        }));
        await prisma.notification.createMany({ data: rows });
        pushToPhones(rows);
    }
    return { ok: true, value: { groupIds: outcome.groupIds, name: outcome.name } };
}

type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

async function mergeInto(tx: Tx, placeholder: { id: string; name: string | null }, userId: string) {
    const from = placeholder.id;
    if (from === userId) throw new Error('A placeholder cannot claim itself');

    // Memberships: theirs becomes yours; in a group you're already in, theirs just goes.
    const memberships = await tx.groupMember.findMany({ where: { userId: from }, select: { id: true, groupId: true } });
    const mine = new Set((await tx.groupMember.findMany({ where: { userId, groupId: { in: memberships.map((row) => row.groupId) } }, select: { groupId: true } })).map((row) => row.groupId));
    for (const membership of memberships) {
        if (mine.has(membership.groupId)) await tx.groupMember.delete({ where: { id: membership.id } });
        else await tx.groupMember.update({ where: { id: membership.id }, data: { userId } });
    }

    await tx.transaction.updateMany({ where: { payerId: from }, data: { payerId: userId } });

    // Splits: on an expense you both share, the two shares add up to one.
    const theirs = await tx.splitItem.findMany({ where: { userId: from }, select: { id: true, transactionId: true, amount: true } });
    const yours = new Map((await tx.splitItem.findMany({ where: { userId, transactionId: { in: theirs.map((split) => split.transactionId) } }, select: { id: true, transactionId: true } })).map((split) => [split.transactionId, split.id]));
    for (const split of theirs) {
        const existing = yours.get(split.transactionId);
        if (existing) {
            await tx.splitItem.update({ where: { id: existing }, data: { amount: { increment: split.amount } } });
            await tx.splitItem.delete({ where: { id: split.id } });
        } else {
            await tx.splitItem.update({ where: { id: split.id }, data: { userId } });
        }
    }

    // Settlements: a payment between the two of you was money moving inside one person, so it goes.
    await tx.settlement.updateMany({ where: { fromId: from }, data: { fromId: userId } });
    await tx.settlement.updateMany({ where: { toId: from }, data: { toId: userId } });
    await tx.settlement.updateMany({ where: { fromId: userId, toId: userId, deletedAt: null }, data: { deletedAt: new Date() } });

    await tx.groupMessage.updateMany({ where: { senderId: from }, data: { senderId: userId } });
    await tx.groupInvitation.updateMany({ where: { inviteeId: from }, data: { inviteeId: userId } });
    await tx.groupInvitation.updateMany({ where: { inviterId: from }, data: { inviterId: userId } });
    await tx.contact.updateMany({ where: { linkedUserId: from }, data: { linkedUserId: userId } });
    await tx.notification.updateMany({ where: { actorId: from }, data: { actorId: userId } });
    // What was sent to the placeholder (nobody could read it) goes with them.
    await tx.user.delete({ where: { id: from } });

    return { placeholderId: from, name: placeholder.name ?? 'Your friend', groupIds: memberships.map((row) => row.groupId) };
}
