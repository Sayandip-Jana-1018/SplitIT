/**
 * Made-up alerts in the shapes banks and UPI apps use (not anyone's real messages), shown where
 * capture can't run (the web preview, iPhone) so the screen can still be seen working.
 */
import type { CapturedAlert } from '../../modules/payment-alerts';

const at = (hoursAgo: number) => Date.now() - hoursAgo * 3_600_000;

export const SAMPLE_ALERTS: CapturedAlert[] = [
    { id: 's1', app: 'com.samsung.android.messaging', title: 'AX-HDFCBK', text: 'Sent Rs.640.00 From HDFC Bank A/C x1234 To SPICE ROUTE On 26/11/26 Ref 433011112222 Not You? Call 18002586161', at: at(30) },
    { id: 's2', app: 'com.google.android.apps.nbu.paisa.user', title: '', text: 'You have received Rs.320 from Meera Iyer via Google Pay', at: at(26) },
    { id: 's3', app: 'com.samsung.android.messaging', title: 'JD-SBIUPI', text: 'Dear UPI user A/C X1234 debited by 180.0 on date 27Nov26 trf to UBER INDIA Refno 433122223333. -SBI', at: at(5) },
    { id: 's4', app: 'com.phonepe.app', title: '', text: 'Get Rs.100 cashback on your next 3 bill payments with PhonePe!', at: at(3) },
    { id: 's5', app: 'com.phonepe.app', title: '', text: 'Paid ₹450 to Swiggy using PhonePe', at: at(1) },
];
