/**
 * Payment capture's inbox: each payment it noticed (its alerts merged, src/capture/payments.ts),
 * once, until you decide. Money you sent: split it as an expense, or, when it is exactly what you
 * owe someone, tell them it's paid. Money that arrived from someone who owes you: open Settle up.
 * Or ignore it. Only your choice reaches the server; the alert's text never does (Add and Pay are
 * opened with the amount, a title and the UPI reference only).
 *
 * What you have decided is remembered on this phone (AsyncStorage), by the payment's first alert.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';
import { ArrowDownLeft, ArrowUpRight } from 'lucide-react-native';
import { useEffect, useMemo, useState } from 'react';
import { View } from 'react-native';
import { payeeOf } from '@/lib/payments/alert';
import type { CapturedAlert } from '../../modules/payment-alerts';
import { groupTransfers } from '~/data/ledger';
import { ME, useLedger } from '~/data/LedgerProvider';
import { GlassSurface } from '~/glass/GlassSurface';
import { notificationTime } from '~/notifications/text';
import { useLook } from '~/theme/ThemeProvider';
import { GlassButton } from '~/ui/GlassButton';
import { rupees } from '~/ui/money';
import { Text } from '~/ui/Text';
import { matchTransfer, mergeAlerts, type CapturedPayment, type OpenTransfer, type SettleMatch } from './payments';
import { sourceName } from './sources';

const KEY = 'splitit.capture.reviewed';
const REMEMBERED = 500;

function useReviewed() {
    const [reviewed, setReviewed] = useState<Set<string> | null>(null);
    useEffect(() => {
        AsyncStorage.getItem(KEY)
            .then((value) => {
                try {
                    setReviewed(new Set(value ? (JSON.parse(value) as string[]) : []));
                } catch {
                    setReviewed(new Set());
                }
            })
            .catch(() => setReviewed(new Set()));
    }, []);
    const decide = (id: string) =>
        setReviewed((current) => {
            const next = new Set(current ?? []).add(id);
            AsyncStorage.setItem(KEY, JSON.stringify([...next].slice(-REMEMBERED))).catch(() => undefined);
            return next;
        });
    return { reviewed, decide };
}

export function ReviewList({ alerts, now }: { alerts: CapturedAlert[]; now: Date }) {
    const { ledger } = useLedger();
    const { reviewed, decide } = useReviewed();
    const payments = useMemo(() => mergeAlerts(alerts), [alerts]);
    const transfers = useMemo<OpenTransfer[]>(() => ledger.groups.flatMap((group) => groupTransfers(ledger, group.id).map((transfer) => ({ ...transfer, groupId: group.id, groupName: group.name }))), [ledger]);
    if (!reviewed) return null;
    const waiting = payments.filter((payment) => !reviewed.has(payment.id));
    if (waiting.length === 0) return null;

    return (
        <View style={{ gap: 16, marginTop: 6 }}>
            <View style={{ alignItems: 'center', gap: 2 }}>
                <Text variant="heading" onLiquid>
                    To review
                </Text>
                <Text variant="caption" tone="secondary" onLiquid numberOfLines={1} style={{ alignSelf: 'stretch' }}>
                    {waiting.length === 1 ? '1 payment' : `${waiting.length} payments`} · only what you choose is saved
                </Text>
            </View>
            {waiting.map((payment) => (
                <Card key={payment.id} payment={payment} match={matchTransfer(payment, transfers, ME)} now={now} onDecide={() => decide(payment.id)} />
            ))}
        </View>
    );
}

function Card({ payment, match, now, onDecide }: { payment: CapturedPayment; match: SettleMatch | null; now: Date; onDecide: () => void }) {
    const { tokens } = useLook();
    const credit = payment.direction === 'credit';
    const Icon = credit ? ArrowDownLeft : ArrowUpRight;
    const who = payeeOf(payment) || 'someone';
    const other = match ? (match.kind === 'paid' ? match.transfer.toName : match.transfer.fromName).split(' ')[0] : '';

    const primary = (): { label: string; run: () => void } => {
        if (match?.kind === 'paid') {
            const { transfer } = match;
            return {
                label: `Tell ${other} it’s paid`,
                run: () => router.push({ pathname: '/pay', params: { group: transfer.groupId, to: transfer.to, amount: String(transfer.amount), paid: '1', reference: payment.reference ?? '' } }),
            };
        }
        if (credit) return { label: 'Open Settle up', run: () => router.push('/settle') };
        return { label: 'Split it', run: () => router.push({ pathname: '/add', params: { amount: String(payment.amount), title: who } }) };
    };
    const action = primary();

    return (
        <GlassSurface style={{ alignItems: 'center', gap: 6, paddingHorizontal: 18, paddingVertical: 18 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, maxWidth: '100%' }}>
                <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: tokens.chip, alignItems: 'center', justifyContent: 'center' }}>
                    <Icon size={15} color={credit ? tokens.moneyIn : tokens.moneyOut} strokeWidth={2.6} />
                </View>
                <Text variant="heading" numberOfLines={1} style={{ flexShrink: 1 }}>
                    {`${rupees(payment.amount)} ${credit ? 'from' : 'to'} ${who}`}
                </Text>
            </View>
            <Text variant="caption" tone="muted" numberOfLines={1} style={{ alignSelf: 'stretch' }}>
                {payment.apps.map(sourceName).join(' + ')} · {notificationTime(new Date(payment.at), now)}
            </Text>
            {match ? (
                <Text variant="caption" tone="accent" style={{ maxWidth: 300 }}>
                    {match.kind === 'paid' ? `Looks like what you owed ${other} in ${match.transfer.groupName}` : `Looks like ${other} paying you back for ${match.transfer.groupName}`}
                </Text>
            ) : null}
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 8, alignSelf: 'stretch' }}>
                <GlassButton
                    kind="accent"
                    style={{ flex: 1.4 }}
                    contentStyle={{ height: 46, paddingHorizontal: 10 }}
                    onPress={() => {
                        onDecide();
                        action.run();
                    }}
                >
                    <Text variant="label" weight="bold" tone="onAccent" numberOfLines={1}>
                        {action.label}
                    </Text>
                </GlassButton>
                <GlassButton kind="thin" style={{ flex: 1 }} contentStyle={{ height: 46 }} onPress={onDecide}>
                    <Text variant="label">Ignore</Text>
                </GlassButton>
            </View>
        </GlassSurface>
    );
}
