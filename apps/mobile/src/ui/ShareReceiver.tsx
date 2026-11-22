/**
 * Shares from other apps, opened in SplitIT (Android's share sheet; modules/share-intent):
 *
 * - a payment message is read on the phone (src/lib/payments/alert.ts; the text never leaves it):
 *   money you paid opens a new expense already filled in; money you received opens Settle up;
 * - a screenshot or a bill opens Scan, which reads it.
 *
 * The share that opened the app is taken once it has started (as a push's tap is, 800 ms in);
 * shares arriving while it is open are taken at once.
 */
import { router } from 'expo-router';
import { useEffect } from 'react';
import { onShare, takeInitialShare, type Shared } from '../../modules/share-intent';
import { payeeOf, readPaymentAlert } from '@/lib/payments/alert';
import { rupees } from './money';
import { useToast } from './Toast';

export function ShareReceiver() {
    const toast = useToast();

    useEffect(() => {
        const open = (shared: Shared) => {
            if (shared.kind === 'image') {
                router.push({ pathname: '/scan', params: { image: shared.uri } });
                return;
            }
            const alert = readPaymentAlert(shared.text);
            if (!alert) {
                toast('That doesn’t look like a payment. Share the message your bank or UPI app sent.', 'info');
                return;
            }
            if (alert.direction === 'credit') {
                toast(`That’s ${rupees(alert.amount)} you received. Find who paid in Settle up.`, 'info');
                router.push('/settle');
                return;
            }
            router.push({ pathname: '/add', params: { amount: String(alert.amount), title: payeeOf(alert) } });
        };

        const first = takeInitialShare();
        const timer = first ? setTimeout(() => open(first), 800) : undefined;
        const stop = onShare(open);
        return () => {
            clearTimeout(timer);
            stop();
        };
    }, [toast]);

    return null;
}
