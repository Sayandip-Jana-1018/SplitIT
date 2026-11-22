/**
 * Reading a photo's text on the phone (Android; ./android wraps Google ML Kit), for scanning a bill
 * with no signal. Elsewhere (the web preview, iPhone for now) there is no module.
 */
import { requireOptionalNativeModule } from 'expo';
import type { TextLine } from '@/lib/receiptRows';

const native = requireOptionalNativeModule<{ read(uri: string): Promise<TextLine[]> }>('TextReader');

/** Whether this phone can read photos itself. */
export const canReadOnPhone = native !== null;

/** Every line of text in the photo, with its box. */
export function readTextLines(uri: string): Promise<TextLine[]> {
    if (!native) return Promise.reject(new Error('This phone can’t read photos by itself.'));
    return native.read(uri);
}
