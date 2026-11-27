import { describe, expect, it } from 'vitest';
import { maskAlertText, maskedReport, readCaptured, readingLine } from '../../apps/mobile/src/capture/mask';
import { CAPTURE_SOURCES, sourceName } from '../../apps/mobile/src/capture/sources';

const masked = (text: string) => maskAlertText(text, readCaptured({ title: '', text })?.counterparty);

describe('a captured alert, masked before it is shared', () => {
    it('keeps the amount and hides the account, the UPI ID and the reference', () => {
        expect(masked('Rs.450.00 debited from A/c XX1234 on 21-11-26 to VPA swiggy@icici (UPI Ref No 432112345678).')).toBe(
            'Rs.450.00 debited from A/c XX#### on 21-11-26 to VPA •••@icici (UPI Ref No ############).',
        );
    });

    it('hides the balance beside the payment', () => {
        expect(masked('INR 1,200.00 debited from your A/c **5678 on 21-Nov-26. Info: UPI/432198765432/Swiggy. Avl Bal: INR 5,000.00')).toBe(
            'INR 1,200.00 debited from your A/c **#### on 21-Nov-26. Info: UPI/############/NAME. Avl Bal: INR #,###.##',
        );
        expect(masked('Rs.649.00 spent on HDFC Bank Card x9876 at NETFLIX on 2026-11-21. Avl Lmt: Rs 45,000.00')).toBe('Rs.649.00 spent on HDFC Bank Card x#### at NAME on ####-11-21. Avl Lmt: Rs ##,###.##');
    });

    it('hides the people, in capitals or not, and phone numbers', () => {
        expect(masked('Sent Rs.250.00 From HDFC Bank A/C x1234 To RAVI MENON On 21/11/26 Ref 432111112222 Not You? Call 18002586161')).toBe(
            'Sent Rs.250.00 From HDFC Bank A/C x#### To NAME On 21/11/26 Ref ############ Not You? Call ###########',
        );
        expect(masked('You have received Rs.500 from Meera Iyer via Google Pay')).toBe('You have received Rs.500 from NAME via Google Pay');
    });

    it('keeps an amount written without a rupee sign', () => {
        expect(masked('Dear UPI user A/C X1234 debited by 450.0 on date 21Nov26 trf to SWIGGY Refno 432112340000. -SBI')).toBe('Dear UPI user A/C X#### debited by 450.0 on date 21Nov26 trf to NAME Refno ############. -SBI');
    });

    it('hides a name the reader missed', () => {
        expect(maskAlertText('Money sent to Kabir Khan', null)).toBe('Money sent to NAME');
    });
});

describe('what SplitIT read, said without the values', () => {
    it('names the parts it found', () => {
        expect(readingLine(readCaptured({ title: 'AX-HDFCBK', text: 'Rs.450.00 debited from A/c XX1234 on 21-11-26 to VPA swiggy@icici (UPI Ref No 432112345678).' }))).toBe('debit ₹450.00 · to NAME · UPI ID · ref · a/c · upi');
        expect(readingLine(readCaptured({ title: '', text: 'Get Rs.500 cashback on your next payment!' }))).toBe('not read as a payment');
    });

    it('makes one report, with nothing private left in it', () => {
        const report = maskedReport(
            [
                { app: 'com.samsung.android.messaging', title: 'AX-HDFCBK', text: 'Sent Rs.250.00 From HDFC Bank A/C x1234 To RAVI MENON On 21/11/26 Ref 432111112222', at: new Date(2026, 10, 21, 9, 5).getTime() },
                { app: 'com.google.android.apps.nbu.paisa.user', title: 'Meera Iyer', text: 'Paid you ₹500', at: new Date(2026, 10, 22, 18, 30).getTime() },
            ],
            sourceName,
            new Date(2026, 10, 27, 12, 0),
        );
        expect(report).toContain('2 alerts from 2 apps');
        expect(report).toContain('[1] Samsung Messages · 21 Nov 09:05');
        expect(report).toContain('[2] Google Pay · 22 Nov 18:30');
        expect(report).toContain('AX-HDFCBK | ');
        for (const secret of ['1234', '432111112222', 'RAVI', 'MENON', 'Meera', 'Iyer']) expect(report).not.toContain(secret);
    });
});

describe('the apps capture may read', () => {
    it('lists each app once, with a name', () => {
        expect(new Set(CAPTURE_SOURCES.map((source) => source.id)).size).toBe(CAPTURE_SOURCES.length);
        expect(sourceName('com.phonepe.app')).toBe('PhonePe');
        expect(sourceName('com.example.unknown')).toBe('com.example.unknown');
    });
});
