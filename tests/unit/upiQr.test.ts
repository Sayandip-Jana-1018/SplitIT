import { describe, expect, it } from 'vitest';
import { readUpiQr, upiQrPayLink } from '@/lib/upi';

describe('readUpiQr', () => {
    it("reads a person's QR, which leaves the amount to the payer", () => {
        expect(readUpiQr('upi://pay?pa=ravi.menon@okaxis&pn=Ravi%20Menon&cu=INR')).toEqual({
            upiId: 'ravi.menon@okaxis',
            payeeName: 'Ravi Menon',
            amount: null,
            note: null,
            merchant: false,
            link: 'upi://pay?pa=ravi.menon@okaxis&pn=Ravi%20Menon&cu=INR',
        });
    });

    it("reads a shop's bill QR, with its amount in paise", () => {
        const qr = readUpiQr('UPI://PAY?pa=swiggy@icici&pn=Swiggy+Ltd&mc=5812&tr=ABC123&am=450.00&cu=INR&tn=Order%2042');
        expect(qr).toMatchObject({ upiId: 'swiggy@icici', payeeName: 'Swiggy Ltd', amount: 45_000, note: 'Order 42', merchant: true });
    });

    it.each([
        ['a website', 'https://example.com/pay'],
        ['a Wi-Fi code', 'WIFI:S:Home;T:WPA;P:secret;;'],
        ['no UPI ID', 'upi://pay?pn=Nobody&am=10'],
        ['a UPI ID that is not one', 'upi://pay?pa=not-an-id&pn=X'],
        ['another currency', 'upi://pay?pa=shop@okicici&am=10&cu=USD'],
        ['an amount that is not one', 'upi://pay?pa=shop@okicici&am=ten'],
    ])('refuses %s', (_, data) => {
        expect(readUpiQr(data)).toBeNull();
    });
});

describe('upiQrPayLink', () => {
    it('adds the amount typed to a QR without one', () => {
        const qr = readUpiQr('upi://pay?pa=ravi@okaxis&pn=Ravi')!;
        expect(upiQrPayLink(qr, 25_050)).toBe('upi://pay?pa=ravi@okaxis&pn=Ravi&am=250.50&cu=INR');
    });

    it("never changes a shop's QR that names its amount, or a signed one", () => {
        const fixed = readUpiQr('upi://pay?pa=shop@icici&mc=5812&am=450.00&cu=INR')!;
        expect(upiQrPayLink(fixed, 99_900)).toBe(fixed.link);
        const signed = readUpiQr('upi://pay?pa=shop@icici&mc=5812&sign=AbC123')!;
        expect(upiQrPayLink(signed, 10_000)).toBe(signed.link);
    });
});
