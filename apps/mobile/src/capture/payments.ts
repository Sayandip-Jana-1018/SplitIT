/**
 * From kept alerts to payments. One payment often fires two or three alerts (the UPI app, the
 * bank's SMS, the bank's app): they are merged by the UPI reference when both have one, otherwise
 * by the same amount, the same way, within ten minutes, from the same account and, when both
 * name someone, the same someone. Then a payment is matched to an open settle-up: money you sent
 * that is exactly what you owe someone, or money that arrived from someone who owes you exactly
 * that. A person always confirms; nothing here moves money or saves anything.
 */
import type { PaymentAlert } from '@/lib/payments/alert';
import { readCaptured, type KeptAlert } from './mask';

export interface CapturedPayment extends PaymentAlert {
    /** The first alert's id: it stays the same as later alerts of the payment arrive. */
    id: string;
    /** When the first alert came. */
    at: number;
    /** The apps that told of it, first first. */
    apps: string[];
    alertIds: string[];
}

const SAME_PAYMENT_MS = 10 * 60_000;

/** A name's words, for comparing "RAVI MENON", "Ravi Menon" and "ravi.menon@okaxis". */
function words(text: string): Set<string> {
    return new Set(
        text
            .toLowerCase()
            .replace(/@.*$/, '')
            .split(/[^a-z]+/)
            .filter((word) => word.length > 2),
    );
}

function shareWords(a: string, b: string): boolean {
    const left = words(a);
    const right = words(b);
    return [...left].some((word) => right.has(word));
}

function samePerson(a: PaymentAlert, b: PaymentAlert): boolean {
    if (a.vpa && b.vpa) return a.vpa.toLowerCase() === b.vpa.toLowerCase();
    if (!a.counterparty || !b.counterparty) return true;
    if (words(a.counterparty).size === 0 || words(b.counterparty).size === 0) return true;
    return shareWords(a.counterparty, b.counterparty);
}

function samePayment(payment: CapturedPayment, alert: PaymentAlert, at: number): boolean {
    if (payment.reference && alert.reference) return payment.reference === alert.reference;
    if (payment.account && alert.account && payment.account !== alert.account) return false;
    return payment.amount === alert.amount && payment.direction === alert.direction && Math.abs(at - payment.at) <= SAME_PAYMENT_MS && samePerson(payment, alert);
}

/** The payments the alerts describe, newest first; alerts that aren't payments are left out. */
export function mergeAlerts(alerts: (KeptAlert & { id: string })[]): CapturedPayment[] {
    const payments: CapturedPayment[] = [];
    for (const alert of [...alerts].sort((a, b) => a.at - b.at)) {
        const read = readCaptured(alert);
        if (!read) continue;
        const same = payments.find((payment) => samePayment(payment, read, alert.at));
        if (!same) {
            payments.push({ ...read, id: alert.id, at: alert.at, apps: [alert.app], alertIds: [alert.id] });
            continue;
        }
        same.alertIds.push(alert.id);
        if (!same.apps.includes(alert.app)) same.apps.push(alert.app);
        same.reference ??= read.reference;
        same.vpa ??= read.vpa;
        same.account ??= read.account;
        // A name says more than a UPI ID.
        const named = read.counterparty && read.counterparty !== read.vpa;
        if (!same.counterparty || (named && same.counterparty === same.vpa)) same.counterparty = read.counterparty ?? same.counterparty;
    }
    return payments.reverse();
}

/** A payment still to make or to receive in one of your groups. */
export interface OpenTransfer {
    groupId: string;
    groupName: string;
    from: string;
    to: string;
    /** In paise. */
    amount: number;
    fromName: string;
    toName: string;
    toUpiId: string | null;
}

export interface SettleMatch {
    transfer: OpenTransfer;
    /** paid: you sent what you owed; received: someone sent what they owed you. */
    kind: 'paid' | 'received';
}

/**
 * The open settle-up a payment most likely is: the same amount, the right way, and the same
 * person by UPI ID or name. With no name or UPI ID on the alert, only when exactly one open
 * payment has that amount.
 */
export function matchTransfer(payment: CapturedPayment, transfers: OpenTransfer[], me: string): SettleMatch | null {
    const kind = payment.direction === 'debit' ? 'paid' : 'received';
    const candidates = transfers.filter((transfer) => (kind === 'paid' ? transfer.from === me : transfer.to === me) && transfer.amount === payment.amount);
    if (candidates.length === 0) return null;
    if (!payment.counterparty && !payment.vpa) return candidates.length === 1 ? { transfer: candidates[0], kind } : null;
    const named = candidates.filter((transfer) => {
        const name = kind === 'paid' ? transfer.toName : transfer.fromName;
        const upiId = kind === 'paid' ? transfer.toUpiId : null;
        if (payment.vpa && upiId) return payment.vpa.toLowerCase() === upiId.toLowerCase();
        return Boolean(payment.counterparty) && shareWords(payment.counterparty as string, name);
    });
    return named.length === 1 ? { transfer: named[0], kind } : null;
}
