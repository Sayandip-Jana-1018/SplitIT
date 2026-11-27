import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/*
 * Roadmap section 7: "raw alert text never leaves the phone, and an automated test proves it".
 * Payment capture's code (the native module's bridge and src/capture) never talks to the server,
 * the alerts it keeps are read in one screen only, and the only ways out of that screen are the
 * share sheet you open yourself (with the masked copy) and Add or Pay, opened with an amount, a
 * title and a UPI reference: never an alert's text.
 */
const MOBILE = join(__dirname, '../../apps/mobile');
const read = (path: string) => readFileSync(join(MOBILE, path), 'utf8');
const captureFiles = ['modules/payment-alerts/index.ts', ...readdirSync(join(MOBILE, 'src/capture')).map((file) => `src/capture/${file}`)];

function sourcesUnder(dir: string): string[] {
    return readdirSync(join(MOBILE, dir), { withFileTypes: true }).flatMap((entry) => {
        const path = `${dir}/${entry.name}`;
        if (entry.isDirectory()) return sourcesUnder(path);
        return /\.(ts|tsx)$/.test(entry.name) ? [path] : [];
    });
}

describe('payment capture keeps alert text on the phone', () => {
    it.each(captureFiles)('%s never calls the server', (file) => {
        const source = read(file);
        expect(source).not.toMatch(/from '~\/api'|from '\.\.\/api|\bfetch\(|XMLHttpRequest|WebSocket|Sentry\.|reportError\(|console\.(log|info|warn|error)\(/);
    });

    it('reads kept alerts in the capture screen only', () => {
        const readers = sourcesUnder('src').filter((file) => /capturedAlerts\(/.test(read(file)));
        expect(readers).toEqual(['src/app/capture.tsx']);
    });

    it('opens Add and Pay with an amount, a title and a reference, never the text', () => {
        const inbox = read('src/capture/ReviewList.tsx');
        const opened = [...inbox.matchAll(/router\.push\((\{[^\n]*\})\)/g)].map((match) => match[1]);
        expect(opened.length).toBeGreaterThan(0);
        for (const call of opened) expect(call).not.toMatch(/\.text\b|\.title\b|alert/);
    });

    it('shares only the masked copy, and only when you tap it', () => {
        const screen = read('src/app/capture.tsx');
        expect([...screen.matchAll(/Share\.share\(([^\n]*)\)/g)].map((match) => match[1])).toEqual(['{ message: maskedReport(alerts, sourceName, now) }']);
        expect(screen).not.toMatch(/from '~\/api'|\bfetch\(|Sentry\.|reportError\(/);
    });
});
