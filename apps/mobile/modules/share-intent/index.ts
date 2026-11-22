/**
 * Shares from other apps (Android): a payment message or a screenshot sent to SplitIT from the
 * share sheet. The native side is ./android (ShareIntentModule.kt); elsewhere (the web preview,
 * iPhone for now) there is no module and nothing is ever shared.
 */
import { requireOptionalNativeModule, type EventSubscription } from 'expo';

export type Shared = { kind: 'text'; text: string } | { kind: 'image'; uri: string; mimeType: string };

interface ShareIntentNative {
    takeInitial(): Shared | null;
    addListener(event: 'onShare', listener: (shared: Shared) => void): EventSubscription;
}

const native = requireOptionalNativeModule<ShareIntentNative>('ShareIntent');

/** What the app was opened with, if it was a share: given once. */
export function takeInitialShare(): Shared | null {
    return native?.takeInitial() ?? null;
}

/** Calls back for each share that arrives while the app is open; the function returned stops it. */
export function onShare(listener: (shared: Shared) => void): () => void {
    const subscription = native?.addListener('onShare', listener);
    return () => subscription?.remove();
}
