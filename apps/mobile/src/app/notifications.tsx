/**
 * The list behind the bell, as the website's: your newest 50 notifications, by day (today,
 * yesterday, this week, earlier). Each row is its kind's mark, what happened on one line with
 * when beside it, and the detail below; unread ones are marked with your colour, a bolder title
 * and a dot. Tapping one marks it read and opens what it's about; the button at the top marks all.
 *
 * The server writes its texts for the website; the phone tidies them for a row that already has
 * its mark and its title (notifications/text.ts).
 */
import { router } from 'expo-router';
import { ArrowLeftRight, Bell, BellRing, CheckCheck, CircleCheck, CircleX, Mail, Receipt, UserMinus, UserPlus, type LucideIcon } from 'lucide-react-native';
import { createElement, useEffect } from 'react';
import { Pressable, View } from 'react-native';
import type { AppNotification } from '@/lib/contract/v1';
import { useAuth } from '~/auth/AuthProvider';
import { markRead, refreshInbox, useInbox } from '~/notifications/inbox';
import { screenFor } from '~/notifications/links';
import { notificationDay, notificationTime, readableNotification } from '~/notifications/text';
import { GlassSurface } from '~/glass/GlassSurface';
import { useLook } from '~/theme/ThemeProvider';
import { EmptyState } from '~/ui/EmptyState';
import { GlassButton } from '~/ui/GlassButton';
import { Header } from '~/ui/Header';
import { Screen } from '~/ui/Screen';
import { Skeleton } from '~/ui/Skeleton';
import { Text } from '~/ui/Text';

/** Each kind of notification's mark: an expense, a payment, a reminder, an invitation… */
function iconOf(type: string): LucideIcon {
    if (type === 'payment_reminder') return BellRing;
    if (type === 'settlement_completed') return CircleCheck;
    if (type === 'settlement_rejected') return CircleX;
    if (type.startsWith('settlement')) return ArrowLeftRight;
    if (type === 'group_invite' || type === 'group_invite_accepted') return Mail;
    if (type === 'member_joined') return UserPlus;
    if (type === 'member_removed') return UserMinus;
    if (type === 'group_activity' || type === 'new_expense') return Receipt;
    return Bell;
}

const DAYS = ['Today', 'Yesterday', 'This week', 'Earlier'] as const;

export default function Notifications() {
    const { tokens } = useLook();
    const auth = useAuth();
    const { notifications, unread } = useInbox();
    const signedIn = auth.status === 'signed_in';

    useEffect(() => {
        if (signedIn) void refreshInbox();
    }, [signedIn]);

    if (!signedIn) {
        return (
            <Screen tabBar={false}>
                <Header title="Notifications" />
                <EmptyState emoji="🔔" title="Nothing here in the demo" hint="Sign in, and you’re told here when friends add an expense, pay you back, or remind you." />
            </Screen>
        );
    }

    const open = (notification: AppNotification) => {
        if (!notification.read) markRead([notification.id]);
        router.push(screenFor(notification.link) as never);
    };

    const now = new Date();
    const days = DAYS.map((day) => ({ day, items: (notifications ?? []).filter((n) => notificationDay(new Date(n.createdAt), now) === day) })).filter((group) => group.items.length > 0);

    return (
        <Screen tabBar={false} onRefresh={refreshInbox}>
            <Header
                title="Notifications"
                eyebrow={unread > 0 ? (unread === 1 ? '1 unread' : `${unread} unread`) : 'All caught up'}
                right={
                    unread > 0 ? (
                        <GlassButton kind="thin" contentStyle={{ width: 42, height: 42 }} accessibilityLabel="Mark all read" onPress={() => markRead()}>
                            <CheckCheck size={19} color={tokens.fg} strokeWidth={2.3} />
                        </GlassButton>
                    ) : undefined
                }
            />
            {notifications === null ? (
                <View style={{ gap: 10 }}>
                    <Skeleton height={76} radius={20} />
                    <Skeleton height={76} radius={20} />
                    <Skeleton height={76} radius={20} />
                </View>
            ) : notifications.length === 0 ? (
                <EmptyState emoji="🔔" title="Nothing yet" hint="You’re told here when friends add an expense, pay you back, or remind you." />
            ) : (
                days.map(({ day, items }) => (
                    <View key={day} style={{ gap: 10 }}>
                        <Text variant="eyebrow" tone="secondary" onLiquid>
                            {day}
                        </Text>
                        <GlassSurface style={{ paddingHorizontal: 14, paddingVertical: 2 }}>
                            {items.map((notification, index) => (
                                <Row key={notification.id} notification={notification} first={index === 0} now={now} onPress={() => open(notification)} />
                            ))}
                        </GlassSurface>
                    </View>
                ))
            )}
        </Screen>
    );
}

function Row({ notification, first, now, onPress }: { notification: AppNotification; first: boolean; now: Date; onPress: () => void }) {
    const { tokens } = useLook();
    // The mark is drawn by its kind's icon, picked here rather than made a component of its own.
    const mark = (color: string) => createElement(iconOf(notification.type), { size: 19, color, strokeWidth: 2.2 });
    const { title, body } = readableNotification(notification.title, notification.body);
    const unread = !notification.read;
    const time = notificationTime(new Date(notification.createdAt), now);
    return (
        <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${unread ? 'Unread. ' : ''}${title}. ${body}. ${time}`}
            onPress={onPress}
            style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, borderTopWidth: first ? 0 : 1, borderTopColor: tokens.border, opacity: pressed ? 0.7 : 1 })}
        >
            {/* Unread ones are filled with your colour; read ones sit back. */}
            <View style={{ width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center', backgroundColor: unread ? tokens.accent : tokens.chip }}>
                {mark(unread ? tokens.onAccent : tokens.fg2)}
            </View>
            <View style={{ flex: 1, gap: 3 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    <Text variant="label" align="left" weight={unread ? 'bold' : 'semibold'} numberOfLines={1} style={{ flex: 1 }}>
                        {title}
                    </Text>
                    <Text variant="caption" tone="muted" tabular>
                        {time}
                    </Text>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    <Text variant="caption" tone="secondary" align="left" numberOfLines={2} style={{ flex: 1 }}>
                        {body}
                    </Text>
                    {unread ? <View accessibilityElementsHidden style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: tokens.accentText }} /> : null}
                </View>
            </View>
        </Pressable>
    );
}
