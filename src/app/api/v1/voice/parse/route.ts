import { readV1Body, requireCaller, v1Error, v1Json } from '@/lib/apiV1';
import { VOICE_AUDIO_MAX_CHARS, VoiceParseRequest } from '@/lib/contract/v1';
import { logger } from '@/lib/logger';
import { parseSpokenAudio } from '@/lib/services/voiceParse';

/**
 * POST /api/v1/voice/parse: the phone's recording of someone saying an expense, heard and read
 * by the same rules as the website's voice entry (lib/services/voiceParse.ts), within their voice
 * allowance.
 */
export async function POST(request: Request) {
    const auth = await requireCaller(request);
    if (!auth.ok) return auth.response;
    const body = await readV1Body(request, VoiceParseRequest, VOICE_AUDIO_MAX_CHARS + 10_000);
    if (!body.ok) return body.response;
    try {
        const { audio, groupName, memberNames, speakerName } = body.data;
        const outcome = await parseSpokenAudio(auth.caller.userId, audio, { groupName, memberNames, speakerName });
        if (outcome.ok) return v1Json(outcome.parsed);
        const response = v1Error(outcome.error, outcome.status, outcome.code);
        if (outcome.retryAfterSeconds) response.headers.set('Retry-After', String(outcome.retryAfterSeconds));
        return response;
    } catch (error) {
        logger.error('Phone voice parse failed', { err: error });
        return v1Error('Couldn’t understand that. Try again, or type it.', 500, 'server_error');
    }
}
