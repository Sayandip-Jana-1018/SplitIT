import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '@/lib/db';
import { balanceOf, loadGroupLedger } from '@/lib/ledger';
import { addPlaceholder, claimPlaceholder, placeholderLink, previewClaim } from '@/lib/services/placeholders';
import { emptyDatabase, expense, groupOf, person } from './fixtures';

// Friends who aren't on SplitIT yet (Phase 6 step 1), on a real Postgres: a placeholder is in
// expenses and balances like anyone, and claiming one moves all of it to a real account without
// moving anybody else's balance.

beforeEach(emptyDatabase);
afterAll(() => prisma.$disconnect());

async function balances(groupId: string, ids: string[]) {
    const ledger = await loadGroupLedger(groupId);
    if (!ledger) throw new Error('no ledger');
    return Object.fromEntries(ids.map((id) => [id, balanceOf(ledger, id)]));
}

async function placeholderIn(groupId: string, actor: { id: string }, name: string) {
    const added = await addPlaceholder(actor, groupId, name);
    if (!added.ok) throw new Error(added.error);
    return added.value;
}

describe('placeholders', () => {
    it('are added by name by a member, and nobody else', async () => {
        const [alice, stranger] = [await person('Alice'), await person('Stranger')];
        const { group } = await groupOf(alice, []);
        expect((await addPlaceholder(stranger, group.id, 'Ravi')).ok).toBe(false);
        expect((await addPlaceholder(alice, group.id, '   ')).ok).toBe(false);
        const ravi = await placeholderIn(group.id, alice, '  Ravi   Menon ');
        expect(ravi.name).toBe('Ravi Menon');
        const row = await prisma.user.findUniqueOrThrow({ where: { id: ravi.userId } });
        expect(row).toMatchObject({ placeholder: true, email: null, password: null, placeholderById: alice.id });
    });

    it('move everything to whoever claims them, and nobody else’s balance moves', async () => {
        const [alice, bob, ravi] = [await person('Alice'), await person('Bob'), await person('Ravi')];
        const { group, trip } = await groupOf(alice, [bob]);
        const placeholder = await placeholderIn(group.id, alice, 'Ravi');
        const p = { id: placeholder.userId };
        await expense(trip.id, alice, 90_000, [alice, bob, p]);
        await expense(trip.id, p, 60_000, [alice, p]);
        await prisma.settlement.create({ data: { tripId: trip.id, fromId: bob.id, toId: p.id, amount: 10_000, status: 'completed' } });
        const before = await balances(group.id, [alice.id, bob.id, p.id]);

        const claimed = await claimPlaceholder(ravi, placeholder.claimToken);
        expect(claimed).toEqual({ ok: true, value: { groupIds: [group.id], name: 'Ravi' } });

        const after = await balances(group.id, [alice.id, bob.id, ravi.id]);
        expect(after).toEqual({ [alice.id]: before[alice.id], [bob.id]: before[bob.id], [ravi.id]: before[p.id] });
        expect(await prisma.user.findUnique({ where: { id: p.id } })).toBeNull();
        expect(await prisma.groupMember.count({ where: { groupId: group.id, userId: ravi.id } })).toBe(1);
        expect(await prisma.transaction.count({ where: { payerId: ravi.id } })).toBe(1);
        // The others are told.
        expect(await prisma.notification.count({ where: { actorId: ravi.id, type: 'member_joined' } })).toBe(2);
    });

    it('merge with someone already in the group: shared splits add up, payments between the two go', async () => {
        const [alice, ravi] = [await person('Alice'), await person('Ravi')];
        const { group, trip } = await groupOf(alice, [ravi]);
        const placeholder = await placeholderIn(group.id, alice, 'Ravi (old)');
        const p = { id: placeholder.userId };
        const shared = await expense(trip.id, alice, 90_000, [alice, ravi, p]);
        await prisma.settlement.create({ data: { tripId: trip.id, fromId: p.id, toId: ravi.id, amount: 5_000, status: 'completed' } });
        const before = await balances(group.id, [alice.id, ravi.id, p.id]);

        expect((await claimPlaceholder(ravi, placeholder.claimToken)).ok).toBe(true);

        const after = await balances(group.id, [alice.id, ravi.id]);
        expect(after[alice.id]).toBe(before[alice.id]);
        expect(after[ravi.id]).toBe(before[ravi.id] + before[p.id]);
        const splits = await prisma.splitItem.findMany({ where: { transactionId: shared.id }, orderBy: { amount: 'asc' } });
        expect(splits.map((split) => split.amount)).toEqual([30_000, 60_000]);
        expect(await prisma.settlement.count({ where: { fromId: ravi.id, toId: ravi.id, deletedAt: null } })).toBe(0);
        expect(await prisma.groupMember.count({ where: { groupId: group.id } })).toBe(2);
    });

    it('have links that work once, can be replaced, and are claimed by one of two people at once', async () => {
        const [alice, ravi, eve] = [await person('Alice'), await person('Ravi'), await person('Eve')];
        const { group } = await groupOf(alice, []);
        const placeholder = await placeholderIn(group.id, alice, 'Ravi');

        const renewed = await placeholderLink(alice, group.id, placeholder.userId, { renew: true });
        if (!renewed.ok) throw new Error(renewed.error);
        expect((await previewClaim(placeholder.claimToken)).ok).toBe(false);
        expect(await previewClaim(renewed.value.claimToken)).toMatchObject({ ok: true, value: { name: 'Ravi', groups: [{ id: group.id }] } });

        const both = await Promise.all([claimPlaceholder(ravi, renewed.value.claimToken), claimPlaceholder(eve, renewed.value.claimToken)]);
        expect(both.filter((outcome) => outcome.ok)).toHaveLength(1);
        expect(await prisma.groupMember.count({ where: { groupId: group.id } })).toBe(2);
        expect((await claimPlaceholder(eve, renewed.value.claimToken)).ok).toBe(false);
    });
});
