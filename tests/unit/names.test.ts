import { describe, expect, it } from 'vitest';
import { readableName } from '@/lib/names';

describe('readableName', () => {
    it.each([
        ['SPICE ROUTE KITCHEN', 'Spice Route Kitchen'],
        ['ravi menon', 'Ravi Menon'],
        ['KFC', 'KFC'],
        ['MTR FOODS', 'MTR Foods'],
        ['THE BOMBAY CANTEEN', 'The Bombay Canteen'],
        ['BAR OF THE CITY', 'Bar of the City'],
        ["McDonald's", "McDonald's"],
        ['  Café   Coffee  Day ', 'Café Coffee Day'],
        ['', ''],
    ])('%s reads as %s', (raw, readable) => {
        expect(readableName(raw)).toBe(readable);
    });
});
