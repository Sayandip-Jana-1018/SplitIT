import { describe, expect, it } from 'vitest';
import { receiptRows, type TextLine } from '@/lib/receiptRows';
import { parseTransactionText } from '@/lib/transactionParser';

/** A line of text on the photo: its words, where it starts across, and its row's height (with a tilt). */
const line = (text: string, left: number, top: number, tilt = 0): TextLine => ({ text, left, top: top + tilt, right: left + text.length * 9, bottom: top + tilt + 20 });

// The sample bill as text recognition returns it: the left column and the right column as separate
// blocks, the right one read after the left, and the photo tilted (the right column 6 px lower).
const RECOGNISED: TextLine[] = [
    line('SPICE ROUTE KITCHEN', 80, 20),
    line('Paneer Tikka', 20, 100),
    line('Butter Naan', 20, 126),
    line('Chicken Biryani', 20, 152),
    line('Sub Total', 20, 200),
    line('CGST 2.5%', 20, 226),
    line('GRAND TOTAL', 20, 280),
    line('Paid by UPI', 120, 330),
    line('320.00', 300, 100, 6),
    line('240.00', 300, 126, 6),
    line('700.00', 300, 152, 6),
    line('2030.00', 300, 200, 6),
    line('50.75', 300, 226, 6),
    line('2233.00', 300, 280, 6),
];

describe('receiptRows', () => {
    it('puts each label back beside its amount, row by row, top to bottom', () => {
        expect(receiptRows(RECOGNISED).split('\n')).toEqual([
            'SPICE ROUTE KITCHEN',
            'Paneer Tikka  320.00',
            'Butter Naan  240.00',
            'Chicken Biryani  700.00',
            'Sub Total  2030.00',
            'CGST 2.5%  50.75',
            'GRAND TOTAL  2233.00',
            'Paid by UPI',
        ]);
    });

    it('lets the parser find the total and every item, which it could not in the blocks as read', () => {
        const asRead = parseTransactionText(RECOGNISED.map((entry) => entry.text).join('\n'));
        expect(asRead.amount).toBeNull();
        expect(asRead.items).toEqual([]);

        const rows = parseTransactionText(receiptRows(RECOGNISED));
        expect(rows.amount).toBe(223_300);
        expect(rows.items.map((item) => [item.name, item.price])).toEqual([
            ['Paneer Tikka', 32_000],
            ['Butter Naan', 24_000],
            ['Chicken Biryani', 70_000],
        ]);
    });

    it('ignores empty lines and gives nothing for nothing', () => {
        expect(receiptRows([])).toBe('');
        expect(receiptRows([line('  ', 0, 0)])).toBe('');
    });
});
