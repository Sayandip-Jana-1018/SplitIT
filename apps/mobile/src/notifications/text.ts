/**
 * A notification as the phone shows it. The server writes its texts for the website (an emoji
 * before the title, the title's words again in the body: "💰 Ankit Basu added an expense" /
 * "Ankit Basu added ₹60 for category: Food & Drinks"); a row already has its icon and its title,
 * so the phone shows "Ankit Basu added an expense" / "₹60 · Food & Drinks".
 */

/** Emoji, their joiners and variation marks, and the spaces after them, at the start. */
const LEADING_EMOJI = /^[\p{Extended_Pictographic}\u{FE0F}\u{200D}\s]+/u;

export function readableNotification(title: string, body: string): { title: string; body: string } {
    const cleanTitle = title.replace(LEADING_EMOJI, '').trim() || title.trim();
    let cleanBody = body.trim().replace(/\s+for category:\s*/i, ' · ');
    // "X added an expense" over "X added ₹60 …": the body keeps only what the title doesn't say.
    const actor = /^(.+?) added an expense$/i.exec(cleanTitle)?.[1];
    if (actor && cleanBody.toLowerCase().startsWith(`${actor.toLowerCase()} added `)) {
        cleanBody = cleanBody.slice(actor.length + ' added '.length);
    }
    return { title: cleanTitle, body: cleanBody };
}

const DAY_MS = 86_400_000;

/** Which group of the list a notification falls in, by its day. */
export function notificationDay(at: Date, now: Date): 'Today' | 'Yesterday' | 'This week' | 'Earlier' {
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const time = at.getTime();
    if (time >= start) return 'Today';
    if (time >= start - DAY_MS) return 'Yesterday';
    if (time >= start - 6 * DAY_MS) return 'This week';
    return 'Earlier';
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** The time beside a row: "3:05 pm" today, "Yesterday", "Tue" this week, "14 Nov" before. */
export function notificationTime(at: Date, now: Date): string {
    const day = notificationDay(at, now);
    if (day === 'Today') {
        const hours = at.getHours();
        return `${hours % 12 || 12}:${String(at.getMinutes()).padStart(2, '0')} ${hours < 12 ? 'am' : 'pm'}`;
    }
    if (day === 'Yesterday') return 'Yesterday';
    if (day === 'This week') return WEEKDAYS[at.getDay()];
    return `${at.getDate()} ${MONTHS[at.getMonth()]}`;
}
