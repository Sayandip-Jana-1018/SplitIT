/**
 * Reading a bill on the phone, with no connection: ML Kit reads the photo's lines
 * (modules/text-reader), their columns are put back into rows (src/lib/receiptRows.ts), and the
 * website's own on-device parser (src/lib/transactionParser.ts) finds the total and the items. It
 * reads fewer bills than the server's AI and never the taxes by name, so the result says to check it.
 */
import { inferCategory } from '@/lib/categoryInference';
import type { ReceiptScan } from '@/lib/contract/v1';
import { receiptRows } from '@/lib/receiptRows';
import { parseTransactionText } from '@/lib/transactionParser';
import { readTextLines } from '../../modules/text-reader';

export { canReadOnPhone } from '../../modules/text-reader';

/** The bill in the photo as the scan shows it, or null when no total could be found. */
export async function scanOnPhone(uri: string): Promise<ReceiptScan | null> {
    const text = receiptRows(await readTextLines(uri));
    const parsed = parseTransactionText(text);
    if (!parsed.amount) return null;

    // A bill's name is usually its first row with words in it.
    const firstWords = text.split('\n').find((row) => /[A-Za-z]{3,}/.test(row))?.trim() ?? null;
    const merchant = parsed.merchant ?? (firstWords ? firstWords.slice(0, 40) : null);
    const items = parsed.items.map((item) => ({ name: item.name, quantity: item.quantity, price: item.price }));
    const itemSum = items.reduce((sum, item) => sum + item.price, 0);
    return {
        merchant,
        date: null,
        items,
        subtotal: itemSum,
        taxes: {},
        total: parsed.amount,
        currency: parsed.currency,
        category: inferCategory(`${merchant ?? ''} ${items.map((item) => item.name).join(' ')}`) ?? 'general',
        confidence: Math.min(0.6, parsed.confidence),
        notes: 'Read on the phone, without the AI: check the total and the items against the bill.',
    };
}
