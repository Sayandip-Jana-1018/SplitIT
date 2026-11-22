/**
 * A photographed bill's text, put back into its printed rows.
 *
 * Text recognition (ML Kit on the phone) reads a bill in blocks, and a bill's columns become
 * separate blocks: "GRAND TOTAL" in one, "Rs 2233.00" in another, so the label and its amount
 * end up on different lines and a parser that reads "a total and its number on one line"
 * (transactionParser.ts) finds no total. Each recognised line comes with its box on the photo,
 * so lines whose middles sit at the same height are one printed row again, read left to right.
 *
 * A slightly tilted photo still works: lines join a row when their middles are within half a
 * typical line's height of it.
 */

export interface TextLine {
    text: string;
    left: number;
    top: number;
    right: number;
    bottom: number;
}

const middle = (line: TextLine) => (line.top + line.bottom) / 2;

/** The bill's text, one printed row per line, top to bottom. */
export function receiptRows(lines: readonly TextLine[]): string {
    const usable = lines.filter((line) => line.text.trim() && line.bottom > line.top);
    if (usable.length === 0) return '';

    const heights = usable.map((line) => line.bottom - line.top).sort((a, b) => a - b);
    const typical = heights[Math.floor(heights.length / 2)];
    const tolerance = typical / 2;

    const rows: { centre: number; lines: TextLine[] }[] = [];
    for (const line of [...usable].sort((a, b) => middle(a) - middle(b))) {
        const row = rows.find((candidate) => Math.abs(candidate.centre - middle(line)) <= tolerance);
        if (row) {
            row.lines.push(line);
            row.centre = row.lines.reduce((sum, member) => sum + middle(member), 0) / row.lines.length;
        } else {
            rows.push({ centre: middle(line), lines: [line] });
        }
    }

    return rows
        .sort((a, b) => a.centre - b.centre)
        .map((row) =>
            row.lines
                .sort((a, b) => a.left - b.left)
                .map((line) => line.text.trim())
                .join('  '),
        )
        .join('\n');
}
