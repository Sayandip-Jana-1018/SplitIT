/**
 * The apps payment capture may read, and nothing else: UPI apps, banks' own apps, and the SMS
 * apps that show banks' messages. Android hands SplitIT every notification once access is on;
 * one from an app not on this list is dropped before a word of it is read (AlertListener.kt).
 */
export interface CaptureSource {
    /** The app's package name on Android. */
    id: string;
    name: string;
    kind: 'upi' | 'bank' | 'sms';
}

export const CAPTURE_SOURCES: CaptureSource[] = [
    { id: 'com.google.android.apps.nbu.paisa.user', name: 'Google Pay', kind: 'upi' },
    { id: 'com.phonepe.app', name: 'PhonePe', kind: 'upi' },
    { id: 'net.one97.paytm', name: 'Paytm', kind: 'upi' },
    { id: 'in.org.npci.upiapp', name: 'BHIM', kind: 'upi' },
    { id: 'com.dreamplug.androidapp', name: 'CRED', kind: 'upi' },
    { id: 'in.amazon.mShop.android.shopping', name: 'Amazon Pay', kind: 'upi' },
    { id: 'com.mobikwik_new', name: 'MobiKwik', kind: 'upi' },
    { id: 'com.naviapp', name: 'Navi', kind: 'upi' },
    { id: 'money.jupiter', name: 'Jupiter', kind: 'bank' },
    { id: 'com.epifi.paisa', name: 'Fi', kind: 'bank' },
    { id: 'com.sbi.lotusintouch', name: 'YONO SBI', kind: 'bank' },
    { id: 'com.snapwork.hdfc', name: 'HDFC Bank', kind: 'bank' },
    // HDFC's newer app: HDFC stops UPI SMS alerts from 1 January 2027, so its app's alerts matter.
    { id: 'com.hdfcbank.android.now', name: 'HDFC Bank', kind: 'bank' },
    { id: 'com.csam.icici.bank.imobile', name: 'ICICI iMobile', kind: 'bank' },
    { id: 'com.axis.mobile', name: 'Axis Mobile', kind: 'bank' },
    { id: 'com.msf.kbank.mobile', name: 'Kotak', kind: 'bank' },
    { id: 'com.bankofbaroda.mconnect', name: 'bob World', kind: 'bank' },
    { id: 'com.canarabank.mobility', name: 'Canara ai1', kind: 'bank' },
    { id: 'com.fedmobile', name: 'FedMobile', kind: 'bank' },
    { id: 'com.google.android.apps.messaging', name: 'Messages', kind: 'sms' },
    { id: 'com.samsung.android.messaging', name: 'Samsung Messages', kind: 'sms' },
    { id: 'com.android.mms', name: 'Messaging', kind: 'sms' },
    { id: 'com.truecaller', name: 'Truecaller', kind: 'sms' },
];

const NAMES = new Map(CAPTURE_SOURCES.map((source) => [source.id, source.name]));

/** "Google Pay" for its package name; an app no longer on the list keeps its package name. */
export function sourceName(id: string): string {
    return NAMES.get(id) ?? id;
}
