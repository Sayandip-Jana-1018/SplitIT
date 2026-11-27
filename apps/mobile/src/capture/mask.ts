/**
 * Payment capture's test week: what it kept, readable as a report you can share, masked on the
 * phone first. Amounts stay (the point is checking they're read right); names, UPI IDs and email
 * addresses, account and card digits, references, phone numbers and balances are hidden. Beside
 * each alert is what SplitIT read from it, as which parts it found rather than their values.
 */
import { readPaymentAlert, type PaymentAlert } from '@/lib/payments/alert';

/**
 * A kept alert, as modules/payment-alerts gives it. Written out here rather than imported, so
 * these rules (and their tests, run outside the app) don't pull in the native module's types.
 */
export interface KeptAlert {
    /** The app that posted it (its package name). */
    app: string;
    title: string;
    text: string;
    /** When it was posted, in milliseconds. */
    at: number;
}

/** What SplitIT reads from a kept alert: its title (an SMS's sender, a UPI app's headline) and text. */
export function readCaptured(alert: Pick<KeptAlert, 'title' | 'text'>): PaymentAlert | null {
    return readPaymentAlert(alert.title ? `${alert.title}\n${alert.text}` : alert.text);
}

const MONEY = /(\brs\.?|\binr|₹)(\s*)([0-9][0-9,]*(?:\.[0-9]{1,2})?)/gi;
/** A sum after a money verb, as SBI writes it: "debited by 450.0". */
const VERB_SUM = /\b(debited|credited)(\s+(?:by|with|for)?\s*)([0-9][0-9,]*(?:\.[0-9]{1,2})?)/gi;
/** A sum right after these words is a balance or a limit: private, and not the payment. */
const BALANCE_BEFORE = /\b(bal|balance|avl|available|lmt|limit)\b[^0-9]{0,12}$/i;
const ID = /\b[A-Za-z0-9._-]{2,}@([A-Za-z][A-Za-z0-9.-]{1,40})\b/g;
const NAMED = /\b(to|from|by|at)(\s+)([A-Z][A-Za-z.'&-]+(?:\s+[A-Z][A-Za-z.'&-]+){0,3})(?![/\w])/g;
/** Words that follow "to", "from" or "by" in alerts and aren't anyone's name. */
const NOT_NAMES = new Set(
    'A/C AC ACCOUNT ACCT YOUR YOU THE ON VIA USING FOR IF NOT REF REFNO UPI VPA INR RS IMPS NEFT RTGS ATM POS BANK CARD AVL BAL DATE MOBILE HDFC SBI ICICI AXIS KOTAK GOOGLE PHONEPE PAYTM NAME'.split(' '),
);

/** Each placeholder is one private-use character, so the digit rules can't touch it. */
const hold = (index: number) => String.fromCharCode(0xe100 + index);
const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export function maskAlertText(text: string, counterparty?: string | null): string {
    const held: string[] = [];
    let masked = text.replace(MONEY, (match: string, mark: string, space: string, sum: string, offset: number) => {
        const balance = BALANCE_BEFORE.test(text.slice(Math.max(0, offset - 24), offset));
        held.push(balance ? `${mark}${space}${sum.replace(/[0-9]/g, '#')}` : match);
        return hold(held.length - 1);
    });
    masked = masked.replace(VERB_SUM, (match: string) => {
        held.push(match);
        return hold(held.length - 1);
    });
    masked = masked.replace(ID, (_match: string, handle: string) => `•••@${handle}`);
    if (counterparty && !counterparty.includes('@')) masked = masked.replace(new RegExp(escape(counterparty), 'gi'), 'NAME');
    masked = masked.replace(NAMED, (match: string, word: string, space: string, words: string) => {
        const parts = words.split(/\s+/);
        const stop = parts.findIndex((part) => NOT_NAMES.has(part.replace(/[.,]$/, '').toUpperCase()));
        const name = stop === -1 ? parts : parts.slice(0, stop);
        if (name.length === 0) return match;
        return `${word}${space}NAME${words.slice(name.join(' ').length)}`;
    });
    masked = masked.replace(/[0-9]{3,}/g, (digits) => '#'.repeat(digits.length));
    return masked.replace(/[-]/g, (mark) => held[mark.charCodeAt(0) - 0xe100] ?? '');
}

/** "debit ₹450.00 · to NAME · UPI ID · ref · a/c · upi", or that it wasn't read as a payment. */
export function readingLine(alert: PaymentAlert | null): string {
    if (!alert) return 'not read as a payment';
    const rupees = (alert.amount / 100).toFixed(2);
    return [
        `${alert.direction} ₹${rupees}`,
        alert.counterparty ? (alert.direction === 'debit' ? 'to NAME' : 'from NAME') : null,
        alert.vpa ? 'UPI ID' : null,
        alert.reference ? 'ref' : null,
        alert.account ? 'a/c' : null,
        alert.source,
    ]
        .filter(Boolean)
        .join(' · ');
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const stamp = (at: Date) => `${at.getDate()} ${MONTHS[at.getMonth()]} ${String(at.getHours()).padStart(2, '0')}:${String(at.getMinutes()).padStart(2, '0')}`;

/** The whole week as one masked text, oldest first, ready for the share sheet. */
export function maskedReport(alerts: KeptAlert[], appName: (id: string) => string, now: Date): string {
    const apps = new Set(alerts.map((alert) => alert.app)).size;
    const lines = [
        `SplitIT capture check · ${stamp(now)}`,
        `${alerts.length} ${alerts.length === 1 ? 'alert' : 'alerts'} from ${apps} ${apps === 1 ? 'app' : 'apps'}. Masked on the phone: names, UPI IDs, account digits, references, phone numbers and balances.`,
    ];
    alerts.forEach((alert, index) => {
        const reading = readCaptured(alert);
        // A UPI app's title is often just the person ("Meera Iyer"): a title of only capitalised words
        // is a name, unless it's one capitalised code, an SMS sender ("AX-HDFCBK", "SBIUPI").
        const name = /^\p{Lu}[\p{L}.'-]*(?:\s+\p{Lu}[\p{L}.'-]*){0,3}$/u.test(alert.title.trim()) && !/^[A-Z0-9-]+$/.test(alert.title.trim());
        const title = alert.title ? `${name ? 'NAME' : maskAlertText(alert.title, reading?.counterparty)} | ` : '';
        lines.push('', `[${index + 1}] ${appName(alert.app)} · ${stamp(new Date(alert.at))}`, `${title}${maskAlertText(alert.text, reading?.counterparty)}`, `→ ${readingLine(reading)}`);
    });
    return lines.join('\n');
}
