/** Small words that stay lower-case inside a name, and are not acronyms when short. */
const SMALL = new Set(['the', 'and', 'of', 'by', 'at', 'in', 'on', 'for', 'to', 'a', 'an', 'co']);

/**
 * A name as printed on a bill or in a bank's message, made readable: "SPICE ROUTE KITCHEN" as
 * Spice Route Kitchen, "ravi menon" as Ravi Menon. A name already in mixed case is left as written
 * ("McDonald's"), and short shouted words without vowels, acronyms, stay so ("KFC", "MTR").
 */
export function readableName(text: string): string {
    const words = text.trim().split(/\s+/).filter(Boolean);
    return words
        .map((word, index) => {
            const letters = word.replace(/[^A-Za-z]/g, '');
            const shouted = letters.length > 0 && letters === letters.toUpperCase();
            const whispered = letters.length > 0 && letters === letters.toLowerCase();
            if (!shouted && !whispered) return word;
            const lower = word.toLowerCase();
            // An acronym: short, shouted and without vowels (KFC, MTR, SBI); "BAR" is a word.
            if (shouted && letters.length <= 5 && !/[AEIOU]/.test(letters)) return word;
            if (index > 0 && SMALL.has(lower)) return lower;
            return lower.charAt(0).toUpperCase() + lower.slice(1);
        })
        .join(' ');
}
