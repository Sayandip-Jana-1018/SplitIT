import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const takeAiQuota = vi.fn();
vi.mock('@/lib/aiQuota', () => ({ takeAiQuota: (...args: unknown[]) => takeAiQuota(...args) }));

const { parseSpokenAudio, parseSpokenText } = await import('@/lib/services/voiceParse');

const fetchMock = vi.fn();
const CLIP = 'data:audio/aac;base64,' + 'A'.repeat(200);
const GROUP = { groupName: 'Goa Trip', memberNames: ['Sayandip Jana', 'Ravi Menon', 'Meera Iyer', 'Kabir Khan'], speakerName: 'Sayandip Jana' };

const gemini = (body: unknown) => new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(body) }] } }] }), { status: 200 });
const sent = (call = 0) => JSON.parse(fetchMock.mock.calls[call][1].body);

beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
    vi.stubEnv('GEMINI_API_KEY', 'test-key');
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    takeAiQuota.mockResolvedValue({ ok: true });
});

afterEach(() => {
    vi.resetAllMocks();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
});

describe('parseSpokenAudio', () => {
    it('sends the recording inline to the quick model, and reads "me" as the speaker', async () => {
        fetchMock.mockResolvedValue(
            gemini({ amount: 1200, title: 'Dinner', category: 'food', splitType: 'equal', members: [{ name: 'me', confidence: 1 }, { name: 'ravi', confidence: 1 }, { name: 'Meera', confidence: 1 }], payer: 'me', confidence: 1, rawTranscript: 'dinner 1200 split with Ravi and Meera, paid by me' }),
        );

        const outcome = await parseSpokenAudio('user-1', CLIP, GROUP);

        expect(outcome).toMatchObject({ ok: true, parsed: { amount: 1200, title: 'Dinner', category: 'food', payer: 'Sayandip Jana', rawTranscript: 'dinner 1200 split with Ravi and Meera, paid by me' } });
        if (outcome.ok) expect(outcome.parsed.members.map((member) => member.name)).toEqual(['Sayandip Jana', 'Ravi Menon', 'Meera Iyer']);
        expect(String(fetchMock.mock.calls[0][0])).toContain('models/gemini-3.5-flash-lite:generateContent');
        expect(sent().contents[0].parts[0]).toEqual({ inlineData: { mimeType: 'audio/aac', data: 'A'.repeat(200) } });
        // The speaker is named for the model, and "with" includes them.
        expect(sent().systemInstruction.parts[0].text).toContain('The speaker is "Sayandip Jana"');
        expect(sent().systemInstruction.parts[0].text).toContain('"split with Ravi and Meera" is the speaker, Ravi and Meera');
        expect(takeAiQuota).toHaveBeenCalledWith('voice', 'user-1');
    });

    it('shares out what a custom split leaves', async () => {
        fetchMock.mockResolvedValue(gemini({ amount: 423, title: 'Shopping', splitType: 'custom', members: [{ name: 'Sayandip', amount: 234 }, { name: 'Kabir' }], confidence: 0.9, rawTranscript: 'divide 423 between Sayandip 234 and Kabir rest' }));
        const outcome = await parseSpokenAudio('user-1', CLIP, GROUP);
        expect(outcome.ok && outcome.parsed.members).toEqual([
            { name: 'Sayandip Jana', amount: 234, confidence: 0.5 },
            { name: 'Kabir Khan', amount: 189, confidence: 0.5 },
        ]);
    });

    it('says nothing was heard when the recording has no words', async () => {
        fetchMock.mockResolvedValue(gemini({ amount: 0, title: '', splitType: 'equal', members: [], confidence: 0, rawTranscript: '' }));
        expect(await parseSpokenAudio('user-1', CLIP, GROUP)).toMatchObject({ ok: false, status: 422, code: 'no_speech' });
    });

    it('refuses what is not audio, before spending the allowance', async () => {
        expect(await parseSpokenAudio('user-1', 'data:image/png;base64,AAAA', GROUP)).toMatchObject({ ok: false, status: 400, code: 'invalid_audio' });
        expect(takeAiQuota).not.toHaveBeenCalled();
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it('asks for typing when the allowance is spent, or Gemini is slow', async () => {
        takeAiQuota.mockResolvedValueOnce({ ok: false, status: 429, error: 'You’ve used today’s voice entries.', retryAfterSeconds: 600 });
        expect(await parseSpokenAudio('user-1', CLIP, GROUP)).toMatchObject({ ok: false, status: 429, code: 'ai_limit', retryAfterSeconds: 600, error: expect.stringMatching(/Type the expense/) });

        fetchMock.mockRejectedValue(new DOMException('timed out', 'TimeoutError'));
        expect(await parseSpokenAudio('user-1', CLIP, GROUP)).toMatchObject({ ok: false, status: 504, code: 'timeout' });
    });
});

describe('parseSpokenText', () => {
    it('falls back to the simple parser when Gemini answers nonsense', async () => {
        fetchMock.mockResolvedValue(new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: 'sure!' }] } }] }), { status: 200 }));
        const outcome = await parseSpokenText('user-1', 'cab 250 with Ravi', GROUP);
        expect(outcome).toMatchObject({ ok: true, parsed: { amount: 250, members: [{ name: 'Ravi Menon' }] } });
    });
});
