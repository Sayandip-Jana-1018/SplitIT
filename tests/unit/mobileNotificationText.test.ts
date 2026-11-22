import { describe, expect, it } from 'vitest';
import { notificationDay, notificationTime, readableNotification } from '../../apps/mobile/src/notifications/text';

describe('a notification as the phone shows it', () => {
    it('drops the emoji and the words the title already says', () => {
        expect(readableNotification('💰 Ankit Basu added an expense', 'Ankit Basu added ₹60 for category: Food & Drinks')).toEqual({ title: 'Ankit Basu added an expense', body: '₹60 · Food & Drinks' });
    });

    it('drops joined and variation-marked emoji too', () => {
        expect(readableNotification('🗑️ Ravi deleted an expense', 'Dinner (₹800) was removed from Goa Trip.').title).toBe('Ravi deleted an expense');
        expect(readableNotification('✏️ Meera edited an expense', '"Cab" updated to ₹450 in Goa Trip.')).toEqual({ title: 'Meera edited an expense', body: '"Cab" updated to ₹450 in Goa Trip.' });
    });

    it('leaves texts with nothing to tidy as they are', () => {
        expect(readableNotification('Payment approved', 'Kabir approved your ₹500 payment.')).toEqual({ title: 'Payment approved', body: 'Kabir approved your ₹500 payment.' });
    });
});

describe('when a notification was', () => {
    const now = new Date(2026, 10, 22, 15, 30);

    it.each([
        [new Date(2026, 10, 22, 3, 5), 'Today', '3:05 am'],
        [new Date(2026, 10, 22, 12, 0), 'Today', '12:00 pm'],
        [new Date(2026, 10, 21, 23, 59), 'Yesterday', 'Yesterday'],
        [new Date(2026, 10, 17, 9, 0), 'This week', 'Tue'],
        [new Date(2026, 10, 14, 9, 0), 'Earlier', '14 Nov'],
    ])('%s is %s, shown as %s', (at, day, time) => {
        expect(notificationDay(at, now)).toBe(day);
        expect(notificationTime(at, now)).toBe(time);
    });
});
