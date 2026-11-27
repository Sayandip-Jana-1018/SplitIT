/**
 * Payment capture (roadmap section 7), its first part: a test week. Turned on, SplitIT notices the
 * payment alerts of the apps on its list (modules/payment-alerts) and keeps the ones about money,
 * on this phone only, for 14 days. This screen says plainly what it reads before you agree, takes
 * you to Android's Notification access, shows that it's alive and what it read from each alert,
 * shares a masked copy to check the reading against, and turns off deleting everything.
 *
 * Nothing becomes an expense yet: that comes once the week shows the reading is right for your
 * bank. Where capture can't run (the web preview, iPhone), the same screen shows sample alerts.
 */
import { useFocusEffect } from 'expo-router';
import { ArrowDownLeft, ArrowUpRight, Ban, BellRing, Share2, ShieldCheck, Smartphone, Trash2, type LucideIcon } from 'lucide-react-native';
import { useCallback, useEffect, useState } from 'react';
import { Alert, AppState, Platform, Pressable, Share, View } from 'react-native';
import { payeeOf } from '@/lib/payments/alert';
import { captureAvailable, capturedAlerts, captureStatus, openAppInfo, openNotificationAccess, setCaptureNotify, startCapture, stopCapture, wakeCapture, type CapturedAlert, type CaptureStatus } from '../../modules/payment-alerts';
import { maskedReport, readCaptured } from '~/capture/mask';
import { ReviewList } from '~/capture/ReviewList';
import { SAMPLE_ALERTS } from '~/capture/samples';
import { CAPTURE_SOURCES, sourceName } from '~/capture/sources';
import { GlassSurface } from '~/glass/GlassSurface';
import { notificationTime } from '~/notifications/text';
import { useLook } from '~/theme/ThemeProvider';
import { GlassButton } from '~/ui/GlassButton';
import { Header } from '~/ui/Header';
import { rupees } from '~/ui/money';
import { Screen } from '~/ui/Screen';
import { Text } from '~/ui/Text';
import { useToast } from '~/ui/Toast';

const DAY_MS = 86_400_000;
const SHOWN = 60;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const day = (at: number) => `${new Date(at).getDate()} ${MONTHS[new Date(at).getMonth()]}`;

/** The apps it reads, as one line: "Google Pay, PhonePe, Paytm … your bank's app and your SMS app". */
const APPS_LINE = `${CAPTURE_SOURCES.filter((source) => source.kind === 'upi')
    .map((source) => source.name)
    .join(', ')}, your bank’s app and your SMS app`;

/** Phones that put apps to sleep, and where their owners stop it. */
const brand = (Platform.constants as { Brand?: string } | undefined)?.Brand?.toLowerCase() ?? '';
const SLEEP_TIP =
    brand === 'samsung'
        ? 'Samsung phones put apps to sleep. In Settings, Battery, Background usage limits, add SplitIT to Never sleeping apps.'
        : 'Some phones put apps to sleep. In Settings, Apps, SplitIT, Battery, choose Unrestricted.';

interface Seen {
    status: CaptureStatus | null;
    alerts: CapturedAlert[];
}

const look = (): Seen => ({ status: captureStatus(), alerts: capturedAlerts() });

export default function Capture() {
    const { tokens } = useLook();
    const toast = useToast();
    const [seen, setSeen] = useState(look);
    const reload = useCallback(() => setSeen(look()), []);

    // Back from Android's settings, or from a payment app: look again.
    useFocusEffect(reload);
    useEffect(() => {
        const subscription = AppState.addEventListener('change', (state) => {
            if (state === 'active') reload();
        });
        return () => subscription.remove();
    }, [reload]);

    const { status, alerts } = seen;
    const preview = !captureAvailable;
    const on = Boolean(status?.capturing);
    const now = new Date();

    const turnOn = () => {
        if (preview) return toast('Payment capture works in the Android app', 'info');
        startCapture(CAPTURE_SOURCES.map((source) => source.id));
        if (!captureStatus()?.access) openNotificationAccess();
        reload();
    };

    const turnOff = () =>
        Alert.alert('Turn off payment capture?', 'It stops at once, and everything it kept on this phone is deleted. Its access can also be taken back in Android’s Notification access.', [
            { text: 'Cancel', style: 'cancel' },
            {
                text: 'Turn off',
                style: 'destructive',
                onPress: () => {
                    stopCapture();
                    reload();
                    toast('Payment capture is off, and what it kept is deleted');
                },
            },
        ]);

    const share = () => void Share.share({ message: maskedReport(alerts, sourceName, now) });

    return (
        <Screen tabBar={false} onRefresh={async () => reload()}>
            <Header title="Payment capture" eyebrow={on ? 'Test week' : 'Android · optional'} />

            {on && status ? <Health status={status} payments={alerts.filter((alert) => readCaptured(alert) !== null).length} now={now} onChange={reload} /> : <Intro onTurnOn={turnOn} />}

            {on || preview ? <ReviewList alerts={preview ? SAMPLE_ALERTS : alerts} now={now} /> : null}

            {on || preview ? (
                <View style={{ gap: 16, marginTop: 6 }}>
                    <View style={{ alignItems: 'center', gap: 2 }}>
                        <Text variant="heading" onLiquid>
                            {preview ? 'What it looks like' : 'What it noticed'}
                        </Text>
                        <Text variant="caption" tone="secondary" onLiquid numberOfLines={1} style={{ alignSelf: 'stretch' }}>
                            Newest first · kept 14 days
                        </Text>
                    </View>
                    <Alerts alerts={preview ? SAMPLE_ALERTS : alerts} now={now} />
                    {preview ? (
                        <Text variant="caption" tone="secondary" onLiquid>
                            Sample alerts. On an Android phone, this shows what it really noticed.
                        </Text>
                    ) : null}
                </View>
            ) : null}

            {on ? (
                <View style={{ gap: 10 }}>
                    <GlassButton kind="thin" contentStyle={{ height: 52, flexDirection: 'row', gap: 8 }} disabled={alerts.length === 0} onPress={share}>
                        <Share2 size={18} color={tokens.fg} strokeWidth={2.3} />
                        <Text variant="label">Share a masked copy</Text>
                    </GlassButton>
                    <Text variant="caption" tone="secondary" onLiquid>
                        Names, UPI IDs, account digits, references and balances are hidden before it leaves SplitIT. Amounts stay. Read it before you send it.
                    </Text>
                    <GlassButton kind="thin" contentStyle={{ height: 52, flexDirection: 'row', gap: 8 }} onPress={turnOff}>
                        <Trash2 size={18} color={tokens.danger} strokeWidth={2.3} />
                        <Text variant="label" tone="danger">
                            Turn off and delete
                        </Text>
                    </GlassButton>
                </View>
            ) : null}
        </Screen>
    );
}

function Intro({ onTurnOn }: { onTurnOn: () => void }) {
    const { tokens } = useLook();
    return (
        <View style={{ gap: 14 }}>
            <GlassSurface style={{ paddingHorizontal: 20, paddingVertical: 24, gap: 20 }}>
                <View style={{ alignItems: 'center', gap: 10 }}>
                    <View style={{ width: 60, height: 60, borderRadius: 30, backgroundColor: tokens.accent, alignItems: 'center', justifyContent: 'center' }}>
                        <BellRing size={28} color={tokens.onAccent} strokeWidth={2.2} />
                    </View>
                    <Text variant="heading">Notice payments as they happen</Text>
                    <Text variant="caption" tone="secondary" style={{ maxWidth: 300 }}>
                        When your UPI app or bank tells you money moved, SplitIT can notice it, so splitting it takes a tap.
                    </Text>
                </View>
                <View style={{ gap: 16 }}>
                    <Point first icon={ShieldCheck} title="Only payment alerts" body="From UPI apps, banks’ apps and bank SMS. Everything else is ignored unread, and codes are never kept." />
                    <Point icon={Smartphone} title="Stays on this phone" body="Nothing it notices is sent anywhere. It’s kept 14 days, then deleted." />
                    <Point icon={Trash2} title="Off in one tap" body="Turning it off deletes everything it kept." />
                </View>
            </GlassSurface>

            <GlassSurface kind="thin" style={{ paddingHorizontal: 20, paddingVertical: 16, gap: 6, alignItems: 'center' }}>
                <Text variant="eyebrow" tone="accent">
                    This week: a test
                </Text>
                <Text variant="caption" tone="secondary">
                    For now it only collects, to check it reads your bank’s alerts right. Nothing becomes an expense yet. After a week, share a masked copy so the reading can be checked.
                </Text>
            </GlassSurface>

            <GlassButton kind="accent" contentStyle={{ height: 54 }} accessibilityLabel="Turn on payment capture" onPress={onTurnOn}>
                <Text variant="label" weight="bold" tone="onAccent">
                    Turn on
                </Text>
            </GlassButton>
            <Text variant="caption" tone="secondary" onLiquid>
                Turning it on means you agree that SplitIT reads notifications from {APPS_LINE}, on this phone only.
            </Text>
        </View>
    );
}

/** One promise, centred: its mark, what it is, and a line about it; a hairline above all but the first. */
function Point({ icon: Icon, title, body, first }: { icon: LucideIcon; title: string; body: string; first?: boolean }) {
    const { tokens } = useLook();
    return (
        <View style={{ alignItems: 'center', gap: 6, paddingTop: first ? 0 : 16, borderTopWidth: first ? 0 : 1, borderTopColor: tokens.border }}>
            <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: tokens.chip, alignItems: 'center', justifyContent: 'center' }}>
                <Icon size={18} color={tokens.fg} strokeWidth={2.2} />
            </View>
            <Text variant="label" weight="bold">
                {title}
            </Text>
            <Text variant="caption" tone="secondary" style={{ maxWidth: 300 }}>
                {body}
            </Text>
        </View>
    );
}

/** Whether it's alive: access given, alerts arriving, and what to do when they stop. */
function Health({ status, payments, now, onChange }: { status: CaptureStatus; payments: number; now: Date; onChange: () => void }) {
    const { tokens } = useLook();
    const lastSign = status.lastAt ?? status.since ?? now.getTime();
    // Android paused the listener after it last connected: nothing arrives until it is woken.
    const paused = status.access && status.disconnectedAt !== null && status.disconnectedAt > (status.connectedAt ?? 0);
    const quiet = status.access && !paused && now.getTime() - lastSign > 2 * DAY_MS;
    const title = !status.access ? 'Waiting for access' : paused ? 'Paused by Android' : quiet ? 'Quiet for a while' : 'Noticing payments';
    const dot = !status.access || paused ? tokens.danger : quiet ? tokens.accentText : tokens.moneyIn;
    const detail = !status.access
        ? 'Switch SplitIT on in Notification access. If its switch is greyed out, open App info, tap ⋮, choose Allow restricted settings, and try again.'
        : paused
          ? 'Your phone stopped SplitIT from noticing payments, usually to save battery. Wake it, and keep it awake with the tip below.'
          : [status.since ? `On since ${day(status.since)}` : null, status.lastAt ? `last alert ${notificationTime(new Date(status.lastAt), now).toLowerCase()}` : 'no alerts yet'].filter(Boolean).join(' · ');
    const wake = () => {
        wakeCapture();
        onChange();
    };
    const toggleNotify = () => {
        setCaptureNotify(!status.notify);
        onChange();
    };
    return (
        <GlassSurface style={{ paddingHorizontal: 18, paddingVertical: 18, gap: 12 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
                <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: dot }} />
                <Text variant="label" weight="bold">
                    {title}
                </Text>
            </View>
            <Text variant="caption" tone="secondary">
                {detail}
            </Text>
            {quiet || paused ? (
                <Text variant="caption" tone="secondary">
                    {SLEEP_TIP}
                </Text>
            ) : null}
            {paused ? (
                <GlassButton kind="accent" contentStyle={{ height: 46 }} onPress={wake}>
                    <Text variant="label" weight="bold" tone="onAccent">
                        Wake it
                    </Text>
                </GlassButton>
            ) : null}
            {status.access ? (
                <>
                    <View style={{ flexDirection: 'row', borderTopWidth: 1, borderTopColor: tokens.border, paddingTop: 12 }}>
                        <Figure value={status.count} label="kept" />
                        <Figure value={payments} label="payments" />
                        <Figure value={status.count - payments} label="not payments" />
                    </View>
                    {/* Its own notification when a payment is noticed, on unless you turn it off. */}
                    <Pressable
                        accessibilityRole="switch"
                        accessibilityState={{ checked: status.notify }}
                        onPress={toggleNotify}
                        style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, borderTopWidth: 1, borderTopColor: tokens.border, paddingTop: 12, opacity: pressed ? 0.7 : 1 })}
                    >
                        <Text variant="caption" tone="secondary">
                            Tell me when it notices a payment
                        </Text>
                        <View style={{ paddingHorizontal: 12, paddingVertical: 4, borderRadius: 999, backgroundColor: status.notify ? tokens.accent : tokens.chip }}>
                            <Text variant="caption" weight="bold" tone={status.notify ? 'onAccent' : 'secondary'}>
                                {status.notify ? 'On' : 'Off'}
                            </Text>
                        </View>
                    </Pressable>
                </>
            ) : (
                <View style={{ flexDirection: 'row', gap: 10 }}>
                    <GlassButton kind="accent" style={{ flex: 1 }} contentStyle={{ height: 46 }} onPress={() => openNotificationAccess()}>
                        <Text variant="label" weight="bold" tone="onAccent">
                            Allow access
                        </Text>
                    </GlassButton>
                    <GlassButton kind="thin" style={{ flex: 1 }} contentStyle={{ height: 46 }} onPress={() => openAppInfo()}>
                        <Text variant="label">App info</Text>
                    </GlassButton>
                </View>
            )}
        </GlassSurface>
    );
}

function Figure({ value, label }: { value: number; label: string }) {
    return (
        <View style={{ flex: 1, alignItems: 'center', gap: 2 }}>
            <Text variant="heading" tabular>
                {value}
            </Text>
            <Text variant="caption" tone="secondary">
                {label}
            </Text>
        </View>
    );
}

/** Newest first: what SplitIT read from each (an amount and who), or that it isn't a payment. */
function Alerts({ alerts, now }: { alerts: CapturedAlert[]; now: Date }) {
    const { tokens } = useLook();
    if (alerts.length === 0) {
        return (
            <GlassSurface style={{ alignItems: 'center', gap: 8, paddingHorizontal: 20, paddingVertical: 26 }}>
                <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: tokens.chip, alignItems: 'center', justifyContent: 'center' }}>
                    <BellRing size={22} color={tokens.fg2} strokeWidth={2.2} />
                </View>
                <Text variant="label" weight="bold">
                    Nothing yet
                </Text>
                <Text variant="caption" tone="secondary" style={{ maxWidth: 260 }}>
                    Pay someone or get paid, and its alert shows here within a moment.
                </Text>
            </GlassSurface>
        );
    }
    const newest = [...alerts].reverse().slice(0, SHOWN);
    return (
        <View style={{ gap: 8 }}>
            <GlassSurface style={{ paddingHorizontal: 18, paddingVertical: 2 }}>
                {newest.map((alert, index) => {
                    const payment = readCaptured(alert);
                    const Icon = payment ? (payment.direction === 'credit' ? ArrowDownLeft : ArrowUpRight) : Ban;
                    const who = payment ? payeeOf(payment) : '';
                    const tint = payment ? (payment.direction === 'credit' ? tokens.moneyIn : tokens.moneyOut) : tokens.fg3;
                    return (
                        <View key={alert.id} style={{ alignItems: 'center', gap: 4, paddingVertical: 16, borderTopWidth: index === 0 ? 0 : 1, borderTopColor: tokens.border }}>
                            {/* What SplitIT read, centred: which way, how much, and who. */}
                            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, maxWidth: '100%' }}>
                                <View style={{ width: 26, height: 26, borderRadius: 13, backgroundColor: tokens.chip, alignItems: 'center', justifyContent: 'center' }}>
                                    <Icon size={14} color={tint} strokeWidth={2.6} />
                                </View>
                                <Text variant="label" weight="bold" tone={payment ? 'primary' : 'muted'} numberOfLines={1} style={{ flexShrink: 1 }}>
                                    {payment ? `${rupees(payment.amount)} ${payment.direction === 'credit' ? 'from' : 'to'} ${who || 'someone'}` : 'Not a payment'}
                                </Text>
                            </View>
                            <Text variant="caption" tone="muted" tabular numberOfLines={1} style={{ alignSelf: 'stretch' }}>
                                {sourceName(alert.app)} · {notificationTime(new Date(alert.at), now)}
                            </Text>
                            <Text variant="caption" tone="secondary" numberOfLines={2} style={{ maxWidth: 300 }}>
                                {alert.text}
                            </Text>
                        </View>
                    );
                })}
            </GlassSurface>
            {alerts.length > SHOWN ? (
                <Text variant="caption" tone="secondary" onLiquid>
                    And {alerts.length - SHOWN} older, all in the masked copy.
                </Text>
            ) : null}
        </View>
    );
}
