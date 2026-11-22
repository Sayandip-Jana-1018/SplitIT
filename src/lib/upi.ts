/**
 * UPI Deep Link Generator
 *
 * Generates `upi://pay?...` links that open the user's preferred UPI app
 * (GPay, PhonePe, Paytm, etc.) for settlement payments.
 *
 * No payment processing on our side — zero compliance burden.
 */

export interface UpiPayParams {
    /** Payee UPI ID, e.g. "priya@okaxis" */
    upiId: string;
    /** Payee display name */
    payeeName: string;
    /** Amount in rupees (not paise) */
    amount: number;
    /** Transaction note */
    note?: string;
    /** Currency (default: INR) */
    currency?: string;
}

/**
 * Generate a UPI deep link URL
 */
export function generateUpiLink({
    upiId,
    payeeName,
    amount,
    note = 'SplitIT Settlement',
    currency = 'INR',
}: UpiPayParams): string {
    const params = new URLSearchParams({
        pa: upiId,
        pn: payeeName,
        am: amount.toFixed(2),
        cu: currency,
        tn: note,
    });
    return `upi://pay?${params.toString()}`;
}

/** A UPI QR code, as read: who it pays and, when the QR fixes it, how much. */
export interface UpiQr {
    upiId: string;
    payeeName: string | null;
    /** In paise, when the QR names the amount (a shop's bill); null when the payer types it. */
    amount: number | null;
    note: string | null;
    /** A shop's QR (it carries a merchant code). */
    merchant: boolean;
    /** The QR's own link, every parameter as printed: a shop's bank may check them. */
    link: string;
}

const decode = (value: string) => {
    try {
        return decodeURIComponent(value.replace(/\+/g, ' '));
    } catch {
        return value;
    }
};

/**
 * Reads a scanned QR code as a UPI payment ("upi://pay?pa=…&pn=…&am=…"), or null when it isn't one
 * (a website, a Wi-Fi code, a UPI ID that isn't one, or a currency other than rupees). Parsed by
 * hand: React Native's URLSearchParams is incomplete.
 */
export function readUpiQr(data: string): UpiQr | null {
    const text = data.trim();
    const match = /^upi:\/\/pay\?(.+)$/i.exec(text);
    if (!match) return null;
    const params = new Map<string, string>();
    for (const pair of match[1].split('&')) {
        const at = pair.indexOf('=');
        if (at <= 0) continue;
        params.set(pair.slice(0, at).toLowerCase(), decode(pair.slice(at + 1)).trim());
    }
    const upiId = params.get('pa') ?? '';
    if (!/^[a-z0-9._-]{2,256}@[a-z][a-z0-9.]{1,64}$/i.test(upiId)) return null;
    const currency = params.get('cu');
    if (currency && currency.toUpperCase() !== 'INR') return null;
    const amountText = params.get('am');
    const rupees = amountText ? Number(amountText) : Number.NaN;
    const amount = Number.isFinite(rupees) && rupees > 0 ? Math.round(rupees * 100) : null;
    if (amountText && amount === null) return null;
    return {
        upiId,
        payeeName: params.get('pn') || null,
        amount,
        note: params.get('tn') || null,
        merchant: params.has('mc'),
        link: `upi://pay?${match[1]}`,
    };
}

/**
 * The link that pays a scanned QR: the QR's own, untouched when it names the amount or is signed
 * (a shop's bank refuses a changed one); otherwise with the amount typed added, in rupees.
 */
export function upiQrPayLink(qr: UpiQr, amount: number): string {
    if (qr.amount !== null || /[?&]sign=/i.test(qr.link)) return qr.link;
    const extra = [`am=${(amount / 100).toFixed(2)}`];
    if (!/[?&]cu=/i.test(qr.link)) extra.push('cu=INR');
    return `${qr.link}&${extra.join('&')}`;
}
