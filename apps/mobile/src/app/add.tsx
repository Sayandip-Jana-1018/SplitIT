/**
 * Adding an expense: the amount on a keypad under the thumb, what it was for (the category is
 * guessed from that), the group, who paid, and how it splits: equally among the people you pick,
 * by exact amounts, by percentages, or by shares. Every split goes through the website's own
 * rules (resolveSplits), so the app can never save one the server would refuse. Shares are saved
 * as exact amounts, which the server already knows, with the shares kept to show later.
 *
 * Opened with an expense (`edit`), the same screen changes it: everything but who paid and the
 * group, which the server keeps as they are.
 *
 * The mic at the top fills it from what you say (VoiceEntry.tsx): the amount, what it was for, who
 * paid and who shares it, equally or by the amounts you said.
 *
 * Paste fills it from a payment message you copied (your bank's SMS, a UPI app's alert), read on the
 * phone by the same reader auto-capture will use (src/lib/payments/alert.ts): the text never leaves it.
 *
 * Opened from a scanned bill (scan.tsx), it starts filled in: the printed total, the shop's name and
 * the category, and the photo is kept as the new expense's receipt.
 */
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import { router, useLocalSearchParams } from 'expo-router';
import { Check, ClipboardPaste, Minus, Plus } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import type { ParsedVoice } from '@/lib/contract/v1';
import { readPaymentAlert, type PaymentAlert } from '@/lib/payments/alert';
import { Platform, Pressable, TextInput, View } from 'react-native';
import { inferCategory } from '@/lib/categoryInference';
import { resolveSplits, type SplitRequest, type SplitType } from '@/lib/expenseSplits';
import { useAuth } from '~/auth/AuthProvider';
import { ME, type Expense, type Group } from '~/data/ledger';
import { useLedger } from '~/data/LedgerProvider';
import { GlassSurface } from '~/glass/GlassSurface';
import { useLook } from '~/theme/ThemeProvider';
import { FONT } from '~/theme/type';
import { CATEGORY_IDS, categoryEmoji, categoryLabel, knownCategory } from '~/ui/category';
import { Chips } from '~/ui/Chips';
import { EmptyState } from '~/ui/EmptyState';
import { Field } from '~/ui/Field';
import { GlassButton, tap } from '~/ui/GlassButton';
import { Header } from '~/ui/Header';
import { Keypad } from '~/ui/Keypad';
import { rupees } from '~/ui/money';
import { Avatar } from '~/ui/Avatar';
import { Screen } from '~/ui/Screen';
import { Segmented } from '~/ui/Segmented';
import { Text } from '~/ui/Text';
import { useToast } from '~/ui/Toast';
import { VoiceButton } from '~/ui/VoiceEntry';

type Share = { userId: string; amount: number };
/** The ways to split: the server's three, and shares, which become exact amounts. */
type SplitMode = SplitType | 'shares';

/** "1,234.5" → 123450 paise; anything that isn't a number is nothing. */
const toPaise = (text: string | undefined) => {
    const value = Number((text ?? '').replace(/,/g, ''));
    return Number.isFinite(value) && value > 0 ? Math.round(value * 100) : 0;
};

/** Keeps what's typed to digits and one dot, at most two places after it. */
const decimal = (text: string) => {
    const [whole = '', ...rest] = text.replace(/[^0-9.]/g, '').split('.');
    return rest.length ? `${whole}.${rest.join('').slice(0, 2)}` : whole;
};

/** Weights (percentages or shares) into paise that add up exactly, the leftover paise going to the largest remainders. */
function byWeight(amount: number, weights: { userId: string; weight: number }[]): Share[] {
    const total = weights.reduce((sum, entry) => sum + entry.weight, 0);
    if (total <= 0) return weights.map(({ userId }) => ({ userId, amount: 0 }));
    const parts = weights.map(({ userId, weight }) => {
        const exact = (amount * weight) / total;
        return { userId, amount: Math.floor(exact), remainder: exact - Math.floor(exact) };
    });
    let left = amount - parts.reduce((sum, part) => sum + part.amount, 0);
    for (const part of [...parts].sort((a, b) => b.remainder - a.remainder)) {
        if (left <= 0) break;
        part.amount += 1;
        left -= 1;
    }
    return parts.map(({ userId, amount: share }) => ({ userId, amount: share }));
}

/** An even start for exact amounts, percentages or shares, so a new split already adds up. */
function evenly(memberIds: string[], amount: number, type: SplitMode): Record<string, string> {
    if (type === 'shares') return Object.fromEntries(memberIds.map((id) => [id, '1']));
    if (type === 'percentage') {
        const base = Math.floor(10_000 / memberIds.length) / 100;
        const last = Math.round((100 - base * (memberIds.length - 1)) * 100) / 100;
        return Object.fromEntries(memberIds.map((id, index) => [id, String(index === memberIds.length - 1 ? last : base)]));
    }
    const resolved = resolveSplits({ amount, splitType: 'equal' }, memberIds);
    if (!resolved.ok) return {};
    return Object.fromEntries(resolved.splits.map((share) => [share.userId, String(share.amount / 100)]));
}

/** "4800", "3525.75", "12.5": paise as the keypad would have typed them. */
const typedAmount = (paise: number) => (paise / 100).toFixed(2).replace(/\.00$/, '').replace(/(\.\d)0$/, '$1');

/** Who a payment went to, as a title: "RAVI MENON" as Ravi Menon, "swiggy@icici" as Swiggy. */
function payeeName(alert: PaymentAlert): string {
    const raw = alert.counterparty && alert.counterparty !== alert.vpa ? alert.counterparty : (alert.vpa?.split('@')[0].replace(/[._-]+/g, ' ').replace(/d+/g, ' ') ?? '');
    const words = raw.trim().split(/s+/).filter(Boolean);
    return words.map((word) => (word === word.toUpperCase() || word === word.toLowerCase() ? word.charAt(0).toUpperCase() + word.slice(1).toLowerCase() : word)).join(' ');
}

/** The split as the screen holds it, from an expense being changed. */
function splitFrom(expense: Expense, group: Group): { mode: SplitMode; among: string[]; typed: Record<string, string> } {
    if (expense.weights) return { mode: 'shares', among: group.memberIds, typed: Object.fromEntries(group.memberIds.map((id) => [id, String(expense.weights?.[id] ?? 0)])) };
    if (expense.splitType === 'equal') return { mode: 'equal', among: expense.splits.map((share) => share.userId), typed: {} };
    if (expense.splitType === 'custom') return { mode: 'custom', among: group.memberIds, typed: Object.fromEntries(expense.splits.map((share) => [share.userId, typedAmount(share.amount)])) };
    // Percentages back from paise, to two places, the last taking what rounding left so they add to 100.
    const percents = expense.splits.map((share) => ({ id: share.userId, value: Math.round((share.amount / expense.amount) * 10_000) / 100 }));
    const rest = Math.round((100 - percents.slice(0, -1).reduce((sum, entry) => sum + entry.value, 0)) * 100) / 100;
    return { mode: 'percentage', among: group.memberIds, typed: Object.fromEntries(percents.map((entry, index) => [entry.id, String(index === percents.length - 1 ? rest : entry.value)])) };
}

export default function AddExpense() {
    const params = useLocalSearchParams<{ group?: string; edit?: string; amount?: string; title?: string; category?: string; receipt?: string }>();
    const { ledger } = useLedger();
    // The expense as it was when the screen opened: what the edit is measured against.
    const [original] = useState(() => (params.edit ? ledger.expenses.find((expense) => expense.id === params.edit) : undefined));
    if (params.edit && !original) {
        return (
            <Screen tabBar={false}>
                <Header title="Edit expense" close />
                <EmptyState emoji="🧾" title="That expense is gone" hint="It was deleted, maybe on another phone or on the website." />
            </Screen>
        );
    }
    const scanned = params.amount ? { amount: Number(params.amount), title: params.title ?? '', category: params.category, receipt: params.receipt } : undefined;
    return <ExpenseForm original={original} startGroup={params.group} scanned={scanned} />;
}

/** A bill read by the scan: what the new expense starts with. */
interface Scanned {
    amount: number;
    title: string;
    category?: string;
    receipt?: string;
}

function ExpenseForm({ original, startGroup, scanned }: { original?: Expense; startGroup?: string; scanned?: Scanned }) {
    const { tokens } = useLook();
    const { ledger, personOf, addExpense, editExpense, setReceipt } = useLedger();
    const toast = useToast();
    const auth = useAuth();

    const [groupId, setGroupId] = useState(() => original?.groupId ?? (ledger.groups.some((candidate) => candidate.id === startGroup) ? startGroup! : ledger.groups[0].id));
    const group = ledger.groups.find((candidate) => candidate.id === groupId) ?? ledger.groups[0];
    const [start] = useState(() => (original ? splitFrom(original, group) : null));
    const [amount, setAmount] = useState(() => (original ? typedAmount(original.amount) : scanned && scanned.amount > 0 ? typedAmount(scanned.amount) : ''));
    const [title, setTitle] = useState(original?.title ?? scanned?.title ?? '');
    const [picked, setPicked] = useState<string | null>(original?.category ?? (scanned?.category && scanned.category !== 'general' ? scanned.category : null));
    const [choosingCategory, setChoosingCategory] = useState(false);
    const [payerId, setPayerId] = useState(original?.payerId ?? ME);
    const [splitType, setSplitType] = useState<SplitMode>(start?.mode ?? 'equal');
    const [among, setAmong] = useState<string[]>(start?.among ?? group.memberIds);
    const [typed, setTyped] = useState<Record<string, string>>(start?.typed ?? {});

    const paise = toPaise(amount);
    const guessed = inferCategory(title);
    const category = picked ?? guessed ?? 'general';
    const firstName = (id: string) => (id === ME ? 'You' : personOf(id).first);

    const chooseGroup = (id: string) => {
        const next = ledger.groups.find((candidate) => candidate.id === id);
        if (!next) return;
        setGroupId(id);
        setPayerId(ME);
        setAmong(next.memberIds);
        setTyped(splitType === 'equal' ? {} : evenly(next.memberIds, paise, splitType));
    };

    const chooseSplit = (type: SplitMode) => {
        setSplitType(type);
        setTyped(type === 'equal' ? {} : evenly(group.memberIds, paise, type));
    };

    /** The split as it stands: whether it can be saved, what to say about it, and each share. */
    const split = useMemo((): { ok: boolean; note: string; shares: Share[] } => {
        if (paise <= 0) return { ok: false, note: 'Type the amount on the keypad', shares: [] };
        let request: SplitRequest;
        if (splitType === 'equal') {
            if (among.length === 0) return { ok: false, note: 'Pick at least one person to share it', shares: [] };
            request = { amount: paise, splitType, splitAmong: group.memberIds.filter((id) => among.includes(id)) };
        } else if (splitType === 'shares') {
            const weights = group.memberIds.map((id) => ({ userId: id, weight: Number(typed[id] || 0) }));
            const count = weights.reduce((sum, entry) => sum + entry.weight, 0);
            if (count <= 0) return { ok: false, note: 'Give someone at least one share', shares: [] };
            request = { amount: paise, splitType: 'custom', splits: byWeight(paise, weights).filter((share) => share.amount > 0) };
        } else if (splitType === 'custom') {
            const shares = group.memberIds.map((id) => ({ userId: id, amount: toPaise(typed[id]) }));
            const total = shares.reduce((sum, share) => sum + share.amount, 0);
            if (total < paise) return { ok: false, note: `${rupees(paise - total)} still to share out`, shares };
            if (total > paise) return { ok: false, note: `${rupees(total - paise)} more than the expense`, shares };
            request = { amount: paise, splitType, splits: shares.filter((share) => share.amount > 0) };
        } else {
            const percents = group.memberIds.map((id) => ({ userId: id, weight: Number(typed[id] || 0) }));
            const total = Math.round(percents.reduce((sum, entry) => sum + entry.weight, 0) * 100) / 100;
            if (total !== 100) return { ok: false, note: `${total}% of 100% shared out`, shares: percents.map(({ userId, weight }) => ({ userId, amount: Math.round((paise * weight) / 100) })) };
            request = { amount: paise, splitType, splits: byWeight(paise, percents).filter((share) => share.amount > 0) };
        }
        const resolved = resolveSplits(request, group.memberIds);
        return resolved.ok ? { ok: true, note: 'Adds up exactly', shares: resolved.splits } : { ok: false, note: resolved.error, shares: [] };
    }, [paise, splitType, among, typed, group.memberIds]);

    const shareOf = (id: string) => split.shares.find((share) => share.userId === id)?.amount ?? 0;

    const save = () => {
        if (!split.ok) return;
        try {
            const input = {
                groupId: group.id,
                title: title.trim() || categoryLabel(category),
                category,
                amount: paise,
                payerId,
                splitType: splitType === 'shares' ? 'custom' : splitType,
                among: splitType === 'equal' ? group.memberIds.filter((id) => among.includes(id)) : undefined,
                shares: splitType === 'equal' ? undefined : split.shares,
                weights: splitType === 'shares' ? Object.fromEntries(group.memberIds.filter((id) => Number(typed[id] || 0) > 0).map((id) => [id, Number(typed[id])])) : undefined,
            };
            if (original) {
                const after = editExpense(original.id, input);
                toast(after === original ? 'Nothing changed' : 'Saved');
                if (router.canGoBack()) router.back();
                return;
            }
            const added = addExpense(input);
            if (scanned?.receipt) setReceipt(added.id, scanned.receipt);
        } catch (error) {
            toast(error instanceof Error ? error.message : 'That expense could not be saved', 'info');
            return;
        }
        if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
        toast(`Added to ${group.name}`);
        if (router.canGoBack()) router.back();
        else router.replace(`/group/${group.id}`);
    };

    /** What the mic heard, into the form: names back to the group's people, rupees to the keypad's digits. */
    const heard = (parsed: ParsedVoice) => {
        const idOf = (name?: string | null) => (name ? group.memberIds.find((id) => personOf(id).name.toLowerCase() === name.toLowerCase()) : undefined);
        if (parsed.amount > 0) setAmount(typedAmount(Math.round(parsed.amount * 100)));
        if (parsed.title) setTitle(parsed.title);
        const kind = parsed.category ? knownCategory(parsed.category) : 'general';
        if (kind !== 'general') setPicked(kind);
        const payer = idOf(parsed.payer);
        if (payer) setPayerId(payer);
        const people = parsed.members.map((member) => ({ id: idOf(member.name), amount: member.amount })).filter((member): member is { id: string; amount: number | null | undefined } => Boolean(member.id));
        if (parsed.splitType === 'custom' && people.length > 0) {
            setSplitType('custom');
            setTyped(Object.fromEntries(people.map((member) => [member.id, member.amount ? String(member.amount) : ''])));
        } else if (people.length > 0) {
            setSplitType('equal');
            setAmong(people.map((member) => member.id));
            setTyped({});
        }
        toast(`Heard “${parsed.rawTranscript}”`);
        for (const warning of parsed.warnings ?? []) toast(warning, 'info');
    };

    /** A payment message you copied, read on the phone: what you paid, and to whom. */
    const paste = async () => {
        tap();
        const text = await Clipboard.getStringAsync().catch(() => '');
        if (!text.trim()) {
            toast('Nothing copied. Copy a payment message from your bank or UPI app first.', 'info');
            return;
        }
        const alert = readPaymentAlert(text);
        if (!alert) {
            toast('That doesn’t look like a payment. Copy the message your bank or UPI app sent.', 'info');
            return;
        }
        if (alert.direction === 'credit') {
            toast(`That’s ${rupees(alert.amount)} you received. Record it in Settle up.`, 'info');
            return;
        }
        setAmount(typedAmount(alert.amount));
        const payee = payeeName(alert);
        if (payee) setTitle(payee);
        setPayerId(ME);
        toast(payee ? `Pasted ${rupees(alert.amount)} paid to ${payee}` : `Pasted ${rupees(alert.amount)}`);
    };

    const shown = amount ? Number(amount.endsWith('.') ? amount.slice(0, -1) : amount).toLocaleString('en-IN', { maximumFractionDigits: 2 }) + (amount.endsWith('.') ? '.' : '') : '0';

    return (
        <Screen tabBar={false}>
            <Header
                title={original ? 'Edit expense' : 'New expense'}
                eyebrow={`${group.emoji} ${group.name}`}
                close
                right={
                    original ? undefined : (
                        <VoiceButton
                            enabled={auth.status === 'signed_in'}
                            group={{ groupName: group.name, memberNames: group.memberIds.map((id) => personOf(id).name), speakerName: personOf(ME).name }}
                            onHeard={heard}
                        />
                    )
                }
            />

            <View style={{ alignItems: 'center', paddingTop: 4 }}>
                <Text onLiquid tabular numberOfLines={1} adjustsFontSizeToFit accessibilityLabel={`Amount ${rupees(paise)}`} style={{ fontSize: 64, lineHeight: 74, letterSpacing: -2.4, fontFamily: FONT.medium }}>
                    <Text tone="secondary" style={{ fontSize: 40, lineHeight: 74, fontFamily: FONT.medium }}>
                        ₹
                    </Text>
                    {shown}
                </Text>
            </View>

            <Keypad value={amount} onChange={setAmount} />

            {original ? null : (
                <GlassButton kind="thin" style={{ alignSelf: 'center' }} contentStyle={{ height: 40, paddingHorizontal: 18, flexDirection: 'row', gap: 8 }} accessibilityLabel="Paste a payment message you copied" onPress={() => void paste()}>
                    <ClipboardPaste size={16} color={tokens.fg} strokeWidth={2.2} />
                    <Text variant="caption" weight="bold">
                        Paste a payment message
                    </Text>
                </GlassButton>
            )}

            <Field label="What was it for?" value={title} onChangeText={setTitle} returnKeyType="done" />

            <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Category ${categoryLabel(category)}. Change`}
                onPress={() => {
                    tap();
                    setChoosingCategory((open) => !open);
                }}
                style={{ alignSelf: 'center' }}
            >
                <GlassSurface kind="thin" radius={999} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 9, paddingHorizontal: 16 }}>
                    <Text style={{ fontSize: 16, lineHeight: 20 }}>{categoryEmoji(category)}</Text>
                    <Text variant="label">{categoryLabel(category)}</Text>
                    <Text variant="caption" tone="muted">
                        {picked ? '· your pick' : guessed ? '· guessed' : '· change'}
                    </Text>
                </GlassSurface>
            </Pressable>
            {choosingCategory ? (
                <Chips
                    label="Category"
                    options={CATEGORY_IDS.map((id) => ({ id, label: categoryLabel(id), emoji: categoryEmoji(id) }))}
                    value={category}
                    onChange={(id) => {
                        setPicked(id);
                        setChoosingCategory(false);
                    }}
                />
            ) : null}

            {original ? null : (
                <View style={{ gap: 10 }}>
                    <Text variant="eyebrow" tone="secondary" onLiquid>
                        Group
                    </Text>
                    <Chips label="Group" options={ledger.groups.map((candidate) => ({ id: candidate.id, label: candidate.name, emoji: candidate.emoji }))} value={group.id} onChange={chooseGroup} />
                </View>
            )}

            <View style={{ gap: 10 }}>
                <Text variant="eyebrow" tone="secondary" onLiquid>
                    Paid by
                </Text>
                {original ? (
                    <Text variant="caption" tone="secondary" onLiquid style={{ maxWidth: 300, alignSelf: 'center' }}>
                        {payerId === ME ? 'You paid' : `${firstName(payerId)} paid`}. To change who paid, delete this and add it again.
                    </Text>
                ) : (
                    <Chips label="Paid by" options={group.memberIds.map((id) => ({ id, label: firstName(id) }))} value={payerId} onChange={setPayerId} />
                )}
            </View>

            <View style={{ gap: 10 }}>
                <Text variant="eyebrow" tone="secondary" onLiquid>
                    Split
                </Text>
                <Segmented<SplitMode>
                    compact
                    options={[
                        { id: 'equal', label: 'Equally' },
                        { id: 'custom', label: 'Exact ₹' },
                        { id: 'percentage', label: 'Percent' },
                        { id: 'shares', label: 'Shares' },
                    ]}
                    value={splitType}
                    onChange={chooseSplit}
                />
                <GlassSurface style={{ paddingHorizontal: 16, paddingVertical: 4 }}>
                    {group.memberIds.map((id, index) => {
                        const included = among.includes(id);
                        const row = { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 12, paddingVertical: 12, borderTopWidth: index === 0 ? 0 : 1, borderTopColor: tokens.border };
                        const name = (
                            <>
                                <Avatar name={personOf(id).name} size={34} />
                                <Text variant="label" align="left" style={{ flex: 1 }} numberOfLines={1}>
                                    {firstName(id)}
                                </Text>
                            </>
                        );
                        if (splitType === 'equal') {
                            return (
                                <Pressable
                                    key={id}
                                    accessibilityRole="checkbox"
                                    accessibilityState={{ checked: included }}
                                    accessibilityLabel={`${firstName(id)} shares it`}
                                    onPress={() => {
                                        tap();
                                        setAmong((current) => (current.includes(id) ? current.filter((other) => other !== id) : [...current, id]));
                                    }}
                                    style={row}
                                >
                                    {name}
                                    <Text variant="label" tabular tone={included ? 'primary' : 'muted'}>
                                        {included ? rupees(shareOf(id)) : 'Not in it'}
                                    </Text>
                                    <View style={{ width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: included ? tokens.accent : 'transparent', borderWidth: included ? 0 : 1.5, borderColor: tokens.borderStrong }}>
                                        {included ? <Check size={16} color={tokens.onAccent} strokeWidth={3} /> : null}
                                    </View>
                                </Pressable>
                            );
                        }
                        if (splitType === 'shares') {
                            const count = Number(typed[id] || 0);
                            const step = (by: number) => {
                                tap();
                                setTyped((current) => ({ ...current, [id]: String(Math.max(0, Math.min(99, Number(current[id] || 0) + by))) }));
                            };
                            const round = { width: 34, height: 34, borderRadius: 17, alignItems: 'center' as const, justifyContent: 'center' as const, backgroundColor: tokens.chip };
                            return (
                                <View key={id} style={row}>
                                    {name}
                                    <Text variant="caption" tone="secondary" tabular>
                                        {rupees(shareOf(id))}
                                    </Text>
                                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                        <Pressable accessibilityRole="button" accessibilityLabel={`One share less for ${firstName(id)}`} disabled={count === 0} onPress={() => step(-1)} style={[round, { opacity: count === 0 ? 0.4 : 1 }]}>
                                            <Minus size={16} color={tokens.fg} strokeWidth={2.6} />
                                        </Pressable>
                                        <Text variant="heading" tabular style={{ minWidth: 24 }} accessibilityLabel={`${count} shares`}>
                                            {count}
                                        </Text>
                                        <Pressable accessibilityRole="button" accessibilityLabel={`One share more for ${firstName(id)}`} onPress={() => step(1)} style={round}>
                                            <Plus size={16} color={tokens.fg} strokeWidth={2.6} />
                                        </Pressable>
                                    </View>
                                </View>
                            );
                        }
                        const percent = splitType === 'percentage';
                        return (
                            <View key={id} style={row}>
                                {name}
                                {percent ? (
                                    <Text variant="caption" tone="secondary" tabular>
                                        {rupees(shareOf(id))}
                                    </Text>
                                ) : null}
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, minWidth: 104, height: 40, paddingHorizontal: 12, borderRadius: 14, backgroundColor: tokens.chip }}>
                                    {percent ? null : (
                                        <Text variant="label" tone="secondary">
                                            ₹
                                        </Text>
                                    )}
                                    <TextInput
                                        value={typed[id] ?? ''}
                                        onChangeText={(text) => setTyped((current) => ({ ...current, [id]: decimal(text) }))}
                                        keyboardType="decimal-pad"
                                        placeholder="0"
                                        placeholderTextColor={tokens.muted}
                                        accessibilityLabel={percent ? `${firstName(id)}'s percentage` : `${firstName(id)}'s amount in rupees`}
                                        maxLength={percent ? 6 : 10}
                                        style={{ flex: 1, color: tokens.fg, fontFamily: FONT.semibold, fontSize: 15, textAlign: 'right', fontVariant: ['tabular-nums'], padding: 0 }}
                                    />
                                    {percent ? (
                                        <Text variant="label" tone="secondary">
                                            %
                                        </Text>
                                    ) : null}
                                </View>
                            </View>
                        );
                    })}
                </GlassSurface>
                <Text variant="caption" tone={split.ok ? 'in' : 'secondary'} onLiquid accessibilityLiveRegion="polite">
                    {split.note}
                </Text>
            </View>

            <GlassButton kind="accent" contentStyle={{ height: 58 }} disabled={!split.ok} onPress={save} accessibilityLabel={original ? 'Save changes' : 'Save expense'}>
                <Text variant="heading" tone="onAccent">
                    {original ? 'Save changes' : paise > 0 ? `Save ${rupees(paise)}` : 'Save expense'}
                </Text>
            </GlassButton>
        </Screen>
    );
}
