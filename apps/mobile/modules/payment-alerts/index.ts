/**
 * Payment capture (Android): the notifications of the payment apps you agreed to, noticed by a
 * listener Android runs once you allow SplitIT in Notification access. The native side is
 * ./android (AlertListener.kt reads, AlertStore.kt keeps); nothing it keeps leaves the phone.
 * Elsewhere (the web preview, iPhone, which lets no app read another's notifications) there is no
 * module, and capture is simply not offered.
 */
import { requireOptionalNativeModule } from 'expo';

/** One notification that mentioned money, as it was posted. */
export interface CapturedAlert {
    id: string;
    /** The app that posted it (its package name). */
    app: string;
    title: string;
    text: string;
    /** When it was posted, in milliseconds. */
    at: number;
}

export interface CaptureStatus {
    /** Whether SplitIT is switched on in Notification access. */
    access: boolean;
    /** Whether you turned capture on in SplitIT. */
    capturing: boolean;
    since: number | null;
    /** When the last alert was kept. */
    lastAt: number | null;
    /** When Android last connected the listener: a sign it's alive. */
    connectedAt: number | null;
    /** When Android last paused it: after connectedAt, capture is paused until it is woken. */
    disconnectedAt: number | null;
    /** Whether a "payment noticed" notification is shown. */
    notify: boolean;
    count: number;
}

interface PaymentAlertsNative {
    status(): CaptureStatus;
    list(): CapturedAlert[];
    start(apps: string[]): void;
    stop(): void;
    rebind(): boolean;
    setNotify(on: boolean): void;
    openAccessSettings(): boolean;
    openAppInfo(): boolean;
}

const native = requireOptionalNativeModule<PaymentAlertsNative>('PaymentAlerts');

/** Whether this phone can capture at all (Android, in the installed app). */
export const captureAvailable = native !== null;

export function captureStatus(): CaptureStatus | null {
    return native?.status() ?? null;
}

/** What it has kept, oldest first. */
export function capturedAlerts(): CapturedAlert[] {
    return native?.list() ?? [];
}

/** Turns capture on for these apps (package names); Notification access is asked for separately. */
export function startCapture(apps: string[]): void {
    native?.start(apps);
}

/** Turns capture off and deletes everything it kept. */
export function stopCapture(): void {
    native?.stop();
}

/** Asks Android to hand notifications over again, after it paused capture. */
export function wakeCapture(): boolean {
    return native?.rebind() ?? false;
}

export function setCaptureNotify(on: boolean): void {
    native?.setNotify(on);
}

export function openNotificationAccess(): boolean {
    return native?.openAccessSettings() ?? false;
}

export function openAppInfo(): boolean {
    return native?.openAppInfo() ?? false;
}
