import { describe, expect, it } from 'vitest';
import { matchTransfer, mergeAlerts, type CapturedPayment, type OpenTransfer } from '../../apps/mobile/src/capture/payments';

const minute = 60_000;
const t0 = new Date(2026, 10, 27, 19, 0).getTime();
const GPAY = 'com.google.android.apps.nbu.paisa.user';
const SMS = 'com.samsung.android.messaging';
const BANK = 'com.snapwork.hdfc';

describe('one payment, however many alerts it fired', () => {
    it('merges the UPI app, the SMS and the bank app by amount and time', () => {
        const payments = mergeAlerts([
            { id: 'a', app: GPAY, title: '', text: 'Paid ₹250 to Ravi Menon', at: t0 },
            { id: 'b', app: SMS, title: 'AX-HDFCBK', text: 'Sent Rs.250.00 From HDFC Bank A/C x1234 To RAVI MENON On 27/11/26 Ref 433111112222', at: t0 + minute },
            { id: 'c', app: BANK, title: 'Debit alert', text: 'Rs 250.00 debited from A/c XX1234 to VPA ravi.menon@okaxis (UPI Ref No 433111112222)', at: t0 + 2 * minute },
        ]);
        expect(payments).toHaveLength(1);
        expect(payments[0]).toMatchObject({ id: 'a', amount: 25_000, direction: 'debit', reference: '433111112222', account: '1234', vpa: 'ravi.menon@okaxis', counterparty: 'Ravi Menon', apps: [GPAY, SMS, BANK], alertIds: ['a', 'b', 'c'] });
    });

    it('keeps two payments of the same amount apart when they went to different people', () => {
        const payments = mergeAlerts([
            { id: 'a', app: GPAY, title: '', text: 'Paid ₹100 to Ravi Menon', at: t0 },
            { id: 'b', app: GPAY, title: '', text: 'Paid ₹100 to Kabir Khan', at: t0 + minute },
        ]);
        expect(payments.map((payment) => payment.id)).toEqual(['b', 'a']);
    });

    it('keeps them apart by reference, by account, and after ten minutes', () => {
        expect(
            mergeAlerts([
                { id: 'a', app: SMS, title: '', text: 'Rs.450.00 debited from A/c XX1234 to VPA swiggy@icici (UPI Ref No 433100000001)', at: t0 },
                { id: 'b', app: SMS, title: '', text: 'Rs.450.00 debited from A/c XX1234 to VPA swiggy@icici (UPI Ref No 433100000002)', at: t0 + minute },
            ]),
        ).toHaveLength(2);
        expect(
            mergeAlerts([
                { id: 'a', app: SMS, title: '', text: 'Rs.450.00 debited from A/c XX1234 on 27-11-26', at: t0 },
                { id: 'b', app: SMS, title: '', text: 'Rs.450.00 debited from A/c XX9876 on 27-11-26', at: t0 + minute },
            ]),
        ).toHaveLength(2);
        expect(
            mergeAlerts([
                { id: 'a', app: GPAY, title: '', text: 'Paid ₹450 to Swiggy', at: t0 },
                { id: 'b', app: GPAY, title: '', text: 'Paid ₹450 to Swiggy', at: t0 + 30 * minute },
            ]),
        ).toHaveLength(2);
    });

    it('leaves out what is not a payment', () => {
        expect(mergeAlerts([{ id: 'a', app: GPAY, title: '', text: 'Get ₹100 cashback on your next payment!', at: t0 }])).toEqual([]);
    });
});

describe('a payment that settles up', () => {
    const transfers: OpenTransfer[] = [
        { groupId: 'g1', groupName: 'Goa Trip', from: 'me', to: 'ravi', amount: 25_000, fromName: 'Sayan', toName: 'Ravi Menon', toUpiId: 'ravi.menon@okaxis' },
        { groupId: 'g2', groupName: 'Flat', from: 'me', to: 'kabir', amount: 25_000, fromName: 'Sayan', toName: 'Kabir Khan', toUpiId: null },
        { groupId: 'g1', groupName: 'Goa Trip', from: 'meera', to: 'me', amount: 60_000, fromName: 'Meera Iyer', toName: 'Sayan', toUpiId: null },
    ];
    const payment = (fields: Partial<CapturedPayment>): CapturedPayment => ({ id: 'p', at: t0, apps: [GPAY], alertIds: ['p'], amount: 25_000, direction: 'debit', counterparty: null, vpa: null, reference: null, account: null, source: 'upi', ...fields });

    it('finds who you paid, by name or by UPI ID', () => {
        expect(matchTransfer(payment({ counterparty: 'RAVI MENON' }), transfers, 'me')?.transfer.to).toBe('ravi');
        expect(matchTransfer(payment({ vpa: 'ravi.menon@okaxis', counterparty: 'ravi.menon@okaxis' }), transfers, 'me')?.transfer.to).toBe('ravi');
        expect(matchTransfer(payment({ counterparty: 'Kabir' }), transfers, 'me')).toMatchObject({ kind: 'paid', transfer: { to: 'kabir', groupName: 'Flat' } });
    });

    it('finds who paid you', () => {
        expect(matchTransfer(payment({ direction: 'credit', amount: 60_000, counterparty: 'Meera Iyer' }), transfers, 'me')).toMatchObject({ kind: 'received', transfer: { from: 'meera' } });
    });

    it('guesses nothing when the amount, the person or the way is wrong, or two could fit', () => {
        expect(matchTransfer(payment({ amount: 26_000, counterparty: 'Ravi Menon' }), transfers, 'me')).toBeNull();
        expect(matchTransfer(payment({ counterparty: 'Swiggy' }), transfers, 'me')).toBeNull();
        expect(matchTransfer(payment({ direction: 'credit', counterparty: 'Ravi Menon' }), transfers, 'me')).toBeNull();
        expect(matchTransfer(payment({}), transfers, 'me')).toBeNull();
        expect(matchTransfer(payment({ direction: 'credit', amount: 60_000 }), transfers, 'me')?.transfer.from).toBe('meera');
    });
});
