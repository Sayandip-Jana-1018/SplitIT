import { describe, expect, it } from 'vitest';
import { payeeOf, readPaymentAlert } from '@/lib/payments/alert';

/*
 * A corpus in the shapes Indian banks and UPI apps use (written for this test, not anyone's real
 * messages). Phase 5's exit test grows it from the owner's masked alerts: at least 95% of amounts
 * right, at most 2% false captures.
 */

const PAYMENTS: [string, { amount: number; direction: 'debit' | 'credit'; counterparty?: string | null; vpa?: string | null; reference?: string | null; account?: string | null; source?: string }][] = [
    ['Rs.450.00 debited from A/c XX1234 on 21-11-26 to VPA swiggy@icici (UPI Ref No 432112345678). Not you? Call 1800...', { amount: 45_000, direction: 'debit', counterparty: 'swiggy@icici', vpa: 'swiggy@icici', reference: '432112345678', account: '1234', source: 'upi' }],
    ['INR 1,200.00 debited from your A/c **5678 on 21-Nov-26. Info: UPI/432198765432/Swiggy. Avl Bal: INR 5,000.00', { amount: 120_000, direction: 'debit', counterparty: 'Swiggy', reference: '432198765432', account: '5678', source: 'upi' }],
    ['Sent Rs.250.00 From HDFC Bank A/C x1234 To RAVI MENON On 21/11/26 Ref 432111112222 Not You? Call 18002586161/SMS BLOCK UPI to 7308080808', { amount: 25_000, direction: 'debit', counterparty: 'RAVI MENON', reference: '432111112222', account: '1234' }],
    ['Dear UPI user A/C X1234 debited by 450.0 on date 21Nov26 trf to SWIGGY Refno 432112340000. If not u? call 1800111109. -SBI', { amount: 45_000, direction: 'debit', counterparty: 'SWIGGY', reference: '432112340000', account: '1234', source: 'upi' }],
    ['Rs 1,500.00 credited to A/c XX1234 on 21-11-26 by VPA kabir@okaxis (UPI Ref No 432155556666).', { amount: 150_000, direction: 'credit', counterparty: 'kabir@okaxis', vpa: 'kabir@okaxis', reference: '432155556666', account: '1234', source: 'upi' }],
    ['You have received Rs.500 from Meera Iyer via Google Pay', { amount: 50_000, direction: 'credit', counterparty: 'Meera Iyer', source: 'upi' }],
    ['₹500 received from Meera', { amount: 50_000, direction: 'credit', counterparty: 'Meera' }],
    ['Paid ₹250 to Ravi Menon', { amount: 25_000, direction: 'debit', counterparty: 'Ravi Menon' }],
    ['Paid ₹450 to Swiggy using PhonePe', { amount: 45_000, direction: 'debit', counterparty: 'Swiggy', source: 'upi' }],
    ['Received ₹1,500 from Kabir Khan', { amount: 150_000, direction: 'credit', counterparty: 'Kabir Khan' }],
    ['Rs.649.00 spent on HDFC Bank Card x9876 at NETFLIX on 2026-11-21:10:22:31. Avl Lmt: Rs 45,000.00', { amount: 64_900, direction: 'debit', counterparty: 'NETFLIX', account: '9876', source: 'card' }],
    ['Your a/c no. XXXXXXXX4321 is debited for Rs.2,000.00 on 21-11-2026 and credited to a/c no. XXXXXXXX1111 (UPI Ref no 432177778888)', { amount: 200_000, direction: 'debit', reference: '432177778888', account: '4321' }],
    ['ATM withdrawal of Rs 3,000 from A/c XX1234 on 21-11-26. Avl bal Rs 12,000', { amount: 300_000, direction: 'debit', account: '1234', source: 'bank' }],
    ['Refund of Rs.199.00 credited to your account XX1234 by AMAZON on 21-11-26', { amount: 19_900, direction: 'credit', counterparty: 'AMAZON', account: '1234' }],
    ['₹1,23,456.50 credited to your A/c XX1234 on 21-11-26. Avl Bal ₹2,00,000.00', { amount: 12_345_650, direction: 'credit', account: '1234' }],
];

const TRAPS = [
    'Get Rs.500 cashback on your next payment with PhonePe! T&C apply',
    'Your OTP for the transaction of Rs.450.00 at SWIGGY is 482913. Do not share it with anyone.',
    'Your electricity bill of Rs.1,240 is due on 25-11-2026. Pay now to avoid late fee.',
    'Payment of Rs.450 to Swiggy failed. Any amount debited will be refunded in 3-5 days.',
    'Ravi Menon has requested Rs.250 from you on Google Pay',
    'Rs.2,000 will be debited for your SIP on 25 Nov 2026',
    'Your credit card statement: total amount due Rs 12,450, minimum amount due Rs 620',
    'You are eligible for a pre-approved loan of Rs 5,00,000. Apply now',
    'Transaction of Rs.900 declined due to insufficient balance',
    'Flat Rs 200 off on your first order. Use code WELCOME200',
    'Dinner at Spice Route was lovely, see you tomorrow', // no money at all
];

describe('readPaymentAlert', () => {
    it.each(PAYMENTS)('reads %s', (text, expected) => {
        expect(readPaymentAlert(text)).toMatchObject(expected);
    });

    it.each(TRAPS)('refuses %s', (text) => {
        expect(readPaymentAlert(text)).toBeNull();
    });

    it('never takes the balance for the amount', () => {
        expect(readPaymentAlert('Avl Bal: INR 9,999.00. INR 120.00 debited from A/c XX1234 for UPI/432100001111/Chai')?.amount).toBe(12_000);
    });

    it('keeps at most the last four digits of an account', () => {
        expect(readPaymentAlert('Rs 100 debited from A/c 123456 to VPA a@ybl')?.account).toBe('3456');
    });

    it('reads every amount right and refuses every trap in the corpus (the exit test’s bar: 95% and 2%)', () => {
        const amountsRight = PAYMENTS.filter(([text, expected]) => readPaymentAlert(text)?.amount === expected.amount).length;
        const falseCaptures = TRAPS.filter((text) => readPaymentAlert(text) !== null).length;
        expect(amountsRight / PAYMENTS.length).toBeGreaterThanOrEqual(0.95);
        expect(falseCaptures / TRAPS.length).toBeLessThanOrEqual(0.02);
    });
});

describe('payeeOf', () => {
    it.each([
        ['Sent Rs.250.00 From HDFC Bank A/C x1234 To RAVI MENON On 21/11/26 Ref 432111112222', 'Ravi Menon'],
        ['Rs.450.00 debited from A/c XX1234 to VPA swiggy@icici (UPI Ref No 432112345678)', 'Swiggy'],
        ['Rs 100 debited from A/c XX1234 to VPA meera.iyer99@okhdfcbank', 'Meera Iyer'],
        ["Paid ₹450 to McDonald's", "McDonald's"],
    ])('names the payee of %s as %s', (text, name) => {
        expect(payeeOf(readPaymentAlert(text)!)).toBe(name);
    });
});
