/**
 * Reading a payment alert: a bank's SMS, a UPI app's notification, or the same text copied and
 * pasted. Pure and synchronous, so it runs on the phone and the text never leaves it (roadmap
 * section 7: "raw alert text never leaves the phone").
 *
 * The enemy is the false alarm: "Get ₹500 cashback", "your OTP for ₹450 is…", "your bill of ₹500
 * is due" and "payment failed" all name an amount and aren't payments, so they are refused first.
 * What is left is read for the amount (never the balance printed beside it), which way the money
 * went, who it went to or came from, the UPI or card reference that ties duplicate alerts of one
 * payment together, and the last digits of the account.
 */

import { readableName } from '@/lib/names';

export interface PaymentAlert {
    /** In paise. */
    amount: number;
    /** debit: money left your account; credit: it arrived. */
    direction: 'debit' | 'credit';
    /** Who was paid or who paid: a name or a merchant, as the alert says it; or their UPI ID. */
    counterparty: string | null;
    /** The UPI ID (VPA) when the alert has one. */
    vpa: string | null;
    /** UPI reference (UTR/RRN) or the bank's reference: the same payment's alerts share it. */
    reference: string | null;
    /** The last digits of the account or card, as printed (never more than 4). */
    account: string | null;
    source: 'upi' | 'card' | 'bank';
}

/** Alerts that name an amount but move no money now. */
const NOT_A_PAYMENT = [
    /\botp\b|one[- ]time password|verification code/i,
    /cash ?back|\boffer\b|\bwin\b|\bwon\b|reward|coupon|voucher|discount|\bdeal\b|\bsale\b/i,
    /\b(is|are|falls?|payment) due\b|\bdue (on|date|by)\b|\boverdue\b|minimum amount|total amount due|\bstatement\b/i,
    /\bwill be (debited|deducted|charged)\b|\bscheduled\b|\bupcoming\b|\bmandate\b|\bauto-?pay (set|created|registered)/i,
    /\bfailed\b|\bdeclined\b|\bunsuccessful\b|\bnot (been )?(processed|completed)\b|\bcould not be\b|\binsufficient\b/i,
    /\brequest(ed|s)? (money|payment|for)\b|\bcollect request\b|\bhas requested\b|\brequested ₹|\brequested rs\b|\bpay request\b/i,
    /\bpre-?approved\b|\bloan of\b|\bcredit limit (of|increased)\b|\beligible\b/i,
];

const DEBIT = /\b(debited|deducted|sent|paid|spent|withdrawn|withdrawal|purchase|transferred|txn of|payment of|charged)\b/i;
const CREDIT = /\b(credited|received|deposited|refund(ed)?|reversed|reversal|cashback credited)\b/i;

const MONEY = String.raw`(?:rs\.?|inr|₹)\s*([0-9][0-9,]*(?:\.[0-9]{1,2})?)`;

/** "1,23,456.5" → 12345650 paise. */
function paise(text: string): number {
    const value = Number(text.replace(/,/g, ''));
    return Number.isFinite(value) ? Math.round(value * 100) : 0;
}

/** The amount moved: by the verb when it says ("debited by 450.0"), else the first sum of money that isn't a balance or a limit. */
function amountOf(text: string): number {
    const withoutBalances = text.replace(/\b(avl\.?|available|avbl\.?|closing|clr|total)\s*(bal(ance)?|lmt|limit|credit limit)\b[^.\n]*/gi, ' ');
    const byVerb = new RegExp(String.raw`\b(?:debited|credited|deducted|sent|paid|spent|received|deposited|withdrawn)\s+(?:by|with|for|of)?\s*(?:rs\.?|inr|₹)?\s*([0-9][0-9,]*(?:\.[0-9]{1,2})?)`, 'i').exec(withoutBalances);
    if (byVerb && paise(byVerb[1]) > 0) return paise(byVerb[1]);
    const first = new RegExp(MONEY, 'i').exec(withoutBalances);
    return first ? paise(first[1]) : 0;
}

/** Which way the money went: whichever verb comes first ("Sent … received by" is a debit). */
function directionOf(text: string): 'debit' | 'credit' | null {
    const debit = DEBIT.exec(text);
    const credit = CREDIT.exec(text);
    if (debit && credit) return debit.index <= credit.index ? 'debit' : 'credit';
    if (debit) return 'debit';
    if (credit) return 'credit';
    return null;
}

const tidy = (name: string) =>
    name
        .replace(/\s+/g, ' ')
        .replace(/[.,;:\-]+$/, '')
        .trim();

function counterpartyOf(text: string, direction: 'debit' | 'credit'): string | null {
    const patterns =
        direction === 'debit'
            ? [
                  /\b(?:paid|sent)\s+(?:rs\.?|inr|₹)\s*[0-9][0-9,.]*\s+to\s+([^\n]+?)(?:\s+(?:on|via|using|from|ref|upi|txn)\b|[.!]?$)/i,
                  /\btrf to\s+([A-Za-z0-9 .&'-]+?)(?=\s+ref|\s+on\b|[.,]|$)/i,
                  /\bto\s+(?!vpa\b|a\/c\b|ac\b|your\b)([A-Za-z][A-Za-z0-9 .&'-]+?)(?=\s+on\b|\s+ref|\s+upi|\s*\(|[.,]|$)/i,
                  /\bat\s+([A-Za-z0-9][A-Za-z0-9 .&*'-]+?)(?=\s+on\b|\s+ref|\.|,|$)/i,
              ]
            : [
                  /\breceived\s+(?:rs\.?|inr|₹)\s*[0-9][0-9,.]*\s+from\s+([^\n]+?)(?:\s+(?:on|via|in|ref|upi)\b|[.!]?$)/i,
                  /\bfrom\s+(?!vpa\b|a\/c\b|your\b)([A-Za-z][A-Za-z0-9 .&'-]+?)(?=\s+on\b|\s+via\b|\s+ref|\s+upi|\s*\(|[.,]|$)/i,
                  /\bby\s+(?!vpa\b|upi\b|a\/c\b|rs\b|inr\b)([A-Za-z][A-Za-z0-9 .&'-]+?)(?=\s+on\b|\s+ref|\s*\(|[.,]|$)/i,
              ];
    for (const pattern of patterns) {
        const match = pattern.exec(text);
        if (match) {
            const name = tidy(match[1]);
            if (name && !/^(a\/?c|account|your|vpa|upi)$/i.test(name) && name.length <= 60) return name;
        }
    }
    // "Info: UPI/432112345678/Swiggy" names the other side after the reference.
    const info = /\bupi\/[0-9]{6,16}\/([A-Za-z][^/.\n]*)/i.exec(text);
    return info ? tidy(info[1]) : null;
}

/** A payment the text describes, or null when it isn't one (an offer, a code, a bill due, a failure, a request) or names no amount. */
export function readPaymentAlert(raw: string): PaymentAlert | null {
    const text = raw.replace(/\s+/g, ' ').trim().slice(0, 600);
    if (!text) return null;
    if (NOT_A_PAYMENT.some((pattern) => pattern.test(text))) return null;

    const direction = directionOf(text);
    if (!direction) return null;
    const amount = amountOf(text);
    if (amount <= 0) return null;

    const vpa = /\b([a-z0-9._-]{2,64}@[a-z][a-z0-9.]{1,32})\b/i.exec(text)?.[1]?.toLowerCase() ?? null;
    const reference =
        /\b(?:upi\s*ref(?:erence)?(?:\s*no\.?)?|ref(?:erence)?\s*(?:no\.?|number|id)?|refno|utr(?:\s*no\.?)?|rrn|txn\s*id)\s*[:.#-]?\s*([0-9]{9,18})\b/i.exec(text)?.[1] ??
        /\bupi\/([0-9]{9,18})\b/i.exec(text)?.[1] ??
        null;
    const account = /\b(?:a\/?c|acct|account|card)\s*(?:no\.?|number|ending(?: with)?)?\s*[:.]?\s*[x*•]*\s*([0-9]{3,6})\b/i.exec(text)?.[1]?.slice(-4) ?? null;
    const source = /\bcard\b/i.test(text) && !/\bupi\b/i.test(text) ? 'card' : vpa || /\bupi\b|google ?pay|gpay|phonepe|paytm|bhim/i.test(text) ? 'upi' : 'bank';

    const named = counterpartyOf(text, direction);
    const counterparty = named && named.toLowerCase() !== vpa ? named : (vpa ?? named);
    return { amount, direction, counterparty, vpa, reference, account, source };
}

/** Who a payment went to, as an expense's title: "RAVI MENON" as Ravi Menon, "swiggy@icici" as Swiggy. */
export function payeeOf(alert: PaymentAlert): string {
    const raw = alert.counterparty && alert.counterparty !== alert.vpa ? alert.counterparty : (alert.vpa?.split('@')[0].replace(/[._-]+/g, ' ').replace(/\d+/g, ' ') ?? '');
    return readableName(raw);
}
