/**
 * Home: your balance on a coin that turns, what you're owed and owe, the four things you do most,
 * your groups, and what happened lately. Every number comes from the ledger.
 */
import { router } from 'expo-router';
import { ArrowDownLeft, ArrowLeftRight, ArrowUpRight, ChartPie, ChevronRight, Plus, ScanLine, type LucideIcon } from 'lucide-react-native';
import { useMemo, useState, type ReactNode } from 'react';
import { Pressable, useWindowDimensions, View } from 'react-native';
import type { GlassKind } from '@shared/glass/styles';
import { activity, groupBalances, groupTransfers, ME, totals } from '~/data/ledger';
import { useYou } from '~/auth/AuthProvider';
import { useLedger } from '~/data/LedgerProvider';
import { Coin } from '~/glass/Coin';
import { GlassScrollView } from '~/glass/GlassScroll';
import { useLook } from '~/theme/ThemeProvider';
import { ActivityList } from '~/ui/ActivityList';
import { Appear } from '~/ui/Appear';
import { AvatarStack } from '~/ui/Avatar';
import { EmptyState } from '~/ui/EmptyState';
import { GroupActions } from '~/ui/GroupActions';
import { GlassButton } from '~/ui/GlassButton';
import { members, rupees } from '~/ui/money';
import { RollingAmount } from '~/ui/RollingAmount';
import { Screen, SectionTitle } from '~/ui/Screen';
import { Text } from '~/ui/Text';
import { PushPrompt } from '~/ui/PushPrompt';
import { SyncNote } from '~/ui/SyncNote';
import { TopBar } from '~/ui/TopBar';

function greeting(): string {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 17) return 'Good afternoon';
    return 'Good evening';
}

const ACTIONS: { label: string; icon: LucideIcon; kind: GlassKind; href: string }[] = [
    { label: 'Add', icon: Plus, kind: 'accent', href: '/add' },
    { label: 'Settle', icon: ArrowLeftRight, kind: 'thin', href: '/settle' },
    { label: 'Scan', icon: ScanLine, kind: 'thin', href: '/scan' },
    { label: 'Insights', icon: ChartPie, kind: 'thin', href: '/insights' },
];

export default function Home() {
    const { tokens } = useLook();
    const you = useYou();
    const { ledger, personOf, onRefresh } = useLedger();
    const { width } = useWindowDimensions();
    const coin = Math.min(width - 56, 310);
    const sum = useMemo(() => totals(ledger), [ledger]);
    // The month as the screen opened, for "your share this month".
    const [month] = useState(() => {
        const now = new Date();
        return { m: now.getMonth(), y: now.getFullYear() };
    });
    // Your share of this month's expenses, and how many of them you're in.
    const thisMonth = useMemo(() => {
        const shares = ledger.expenses
            .filter((expense) => expense.createdAt.getMonth() === month.m && expense.createdAt.getFullYear() === month.y)
            .map((expense) => expense.splits.find((split) => split.userId === ME)?.amount ?? 0)
            .filter((share) => share > 0);
        return { total: shares.reduce((sum, share) => sum + share, 0), count: shares.length };
    }, [ledger.expenses, month]);
    // The payments you're part of, biggest first: the first is the one most worth settling next.
    const yours = useMemo(
        () =>
            ledger.groups
                .flatMap((group) => groupTransfers(ledger, group.id).filter((transfer) => transfer.from === ME || transfer.to === ME))
                .sort((a, b) => b.amount - a.amount),
        [ledger],
    );
    const next = yours[0];
    const owedBy = new Set(yours.filter((transfer) => transfer.to === ME).map((transfer) => transfer.from)).size;
    const oweTo = new Set(yours.filter((transfer) => transfer.from === ME).map((transfer) => transfer.to)).size;
    const people = (count: number) => (count === 1 ? '1 person' : `${count} people`);
    // Both cards only say something new when money goes both ways; otherwise one would repeat the coin.
    const bothWays = sum.owedToYou > 0 && sum.youOwe > 0;
    const lately = useMemo(() => activity(ledger).slice(0, 3), [ledger]);
    const enter = (index: number) => 60 + index * 70;
    const owed = sum.net >= 0;
    const Arrow = owed ? ArrowDownLeft : ArrowUpRight;

    return (
        <Screen onRefresh={onRefresh}>
            <TopBar />

            <Appear delay={enter(0)} style={{ alignItems: 'center', gap: 2 }}>
                <Text variant="label" tone="secondary" onLiquid>
                    {greeting()}
                </Text>
                <Text variant="display" onLiquid>
                    Hi, {you.first}
                </Text>
            </Appear>

            <SyncNote />
            <PushPrompt />

            <Appear delay={enter(1)} style={{ alignItems: 'center' }}>
                <Coin kind="rim" size={coin}>
                    <View style={{ alignItems: 'center', gap: 6, paddingHorizontal: 24 }}>
                        <Text variant="eyebrow" tone="secondary" onLiquid>
                            {sum.net === 0 ? 'All settled up' : owed ? 'You are owed' : 'You owe'}
                        </Text>
                        <RollingAmount paise={sum.net} sign variant="hero" weight="medium" onLiquid numberOfLines={1} adjustsFontSizeToFit />
                        <Pressable
                            accessibilityRole="button"
                            accessibilityHint="Opens your Balance Journey"
                            onPress={() => router.push('/journey')}
                            style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: pressed ? tokens.borderStrong : tokens.chip, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 })}
                        >
                            <Arrow size={14} color={tokens.fg} strokeWidth={2.4} />
                            <Text variant="caption" weight="semibold">
                                Across your groups
                            </Text>
                            <ChevronRight size={14} color={tokens.fg} strokeWidth={2.4} />
                        </Pressable>
                    </View>
                </Coin>
            </Appear>

            <Appear delay={enter(2)} style={{ flexDirection: 'row', gap: 12 }}>
                {bothWays ? (
                    <>
                        <StatCard label="Owed to you" note={`from ${people(owedBy)}`} onPress={() => router.push('/settle')}>
                            <RollingAmount paise={sum.owedToYou} sign variant="heading" tone="in" />
                        </StatCard>
                        <StatCard label="You owe" note={`to ${people(oweTo)}`} onPress={() => router.push('/settle')}>
                            <RollingAmount paise={-sum.youOwe} sign variant="heading" tone="out" />
                        </StatCard>
                    </>
                ) : (
                    <>
                        <StatCard label="Your share this month" note={thisMonth.count === 0 ? `Nothing yet in ${MONTHS[month.m]}` : `${thisMonth.count === 1 ? '1 expense' : `${thisMonth.count} expenses`} in ${MONTHS[month.m]}`} onPress={() => router.push('/insights')}>
                            <RollingAmount paise={thisMonth.total} variant="heading" />
                        </StatCard>
                        <StatCard
                            label={next ? 'Next to settle' : 'Settle up'}
                            note={next ? (next.to === ME ? `${next.fromName.split(' ')[0]} pays you` : `You pay ${next.toName.split(' ')[0]}`) : 'Nobody owes anybody'}
                            onPress={() => router.push('/settle')}
                        >
                            <Text variant="heading" tone={next ? (next.to === ME ? 'in' : 'out') : 'primary'} tabular numberOfLines={1}>
                                {next ? rupees(next.amount) : 'All square'}
                            </Text>
                        </StatCard>
                    </>
                )}
            </Appear>

            <Appear delay={enter(3)} style={{ flexDirection: 'row', gap: 10 }}>
                {ACTIONS.map(({ label, icon: Icon, kind, href }) => (
                    <GlassButton key={label} kind={kind} radius={22} style={{ flex: 1 }} contentStyle={{ height: 78, gap: 6 }} onPress={() => router.push(href as never)}>
                        <Icon size={22} color={kind === 'accent' ? tokens.onAccent : tokens.fg} strokeWidth={2.2} />
                        <Text variant="caption" weight="bold" tone={kind === 'accent' ? 'onAccent' : 'primary'}>
                            {label}
                        </Text>
                    </GlassButton>
                ))}
            </Appear>

            <Appear delay={enter(4)} style={{ gap: 14 }}>
                <SectionTitle
                    action={
                        <Pressable onPress={() => router.push('/groups')} hitSlop={12}>
                            <Text variant="label" tone="accent">
                                See all
                            </Text>
                        </Pressable>
                    }
                >
                    <Text variant="heading" onLiquid>
                        Your groups
                    </Text>
                </SectionTitle>
                {ledger.groups.length === 0 ? (
                    <View style={{ gap: 12 }}>
                        <EmptyState emoji="👥" title="No groups yet" hint="Make one for a trip, a flat or a dinner, or join one with the invite link someone sent you." />
                        <GroupActions />
                    </View>
                ) : null}
                <GlassScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -20, display: ledger.groups.length === 0 ? 'none' : 'flex' }} contentContainerStyle={{ paddingHorizontal: 20, paddingVertical: 14, gap: 12 }}>
                    {ledger.groups.map((group) => {
                        const mine = groupBalances(ledger, group.id)[ME] ?? 0;
                        const spent = ledger.expenses.filter((expense) => expense.groupId === group.id).reduce((total, expense) => total + expense.amount, 0);
                        return (
                            <GlassButton key={group.id} kind="reg" radius={24} contentStyle={{ width: 196, paddingVertical: 18, paddingHorizontal: 12, gap: 8 }} onPress={() => router.push(`/group/${group.id}`)}>
                                <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: tokens.chip, alignItems: 'center', justifyContent: 'center' }}>
                                    <Text style={{ fontSize: 22, lineHeight: 28 }}>{group.emoji}</Text>
                                </View>
                                <Text variant="heading" numberOfLines={1}>
                                    {group.name}
                                </Text>
                                <Text variant="caption" tone="secondary" tabular>
                                    {members(group.memberIds.length)} · {rupees(spent)}
                                </Text>
                                <AvatarStack people={group.memberIds.map((id) => personOf(id))} />
                                <Text variant="label" tone={mine >= 0 ? 'in' : 'out'} tabular>
                                    {mine === 0 ? 'Settled' : rupees(mine, { sign: true })}
                                </Text>
                            </GlassButton>
                        );
                    })}
                </GlassScrollView>
            </Appear>

            <Appear delay={enter(5)} style={{ gap: 14 }}>
                <SectionTitle>
                    <Text variant="heading" onLiquid>
                        Lately
                    </Text>
                </SectionTitle>
                <ActivityList items={lately} />
            </Appear>
        </Screen>
    );
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/**
 * One of the two cards under the coin: what it is, the amount, and a line about it, in the same
 * shape side by side, and a tap opens where the number comes from.
 */
function StatCard({ label, note, onPress, children }: { label: string; note: string; onPress: () => void; children: ReactNode }) {
    return (
        <GlassButton radius={24} style={{ flex: 1 }} contentStyle={{ paddingVertical: 16, paddingHorizontal: 12, gap: 4, minHeight: 104 }} accessibilityLabel={`${label}. ${note}`} onPress={onPress}>
            <Text variant="caption" tone="secondary" numberOfLines={1}>
                {label}
            </Text>
            {children}
            <Text variant="caption" tone="secondary" numberOfLines={1}>
                {note}
            </Text>
        </GlassButton>
    );
}
