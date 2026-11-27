import { readV1Body, requireCaller, v1Error, v1Json } from '@/lib/apiV1';
import { NewPlaceholder } from '@/lib/contract/v1';
import { logger } from '@/lib/logger';
import { addPlaceholder, claimUrl } from '@/lib/services/placeholders';

/**
 * POST /api/v1/groups/:groupId/placeholders: adds a friend who isn't on SplitIT yet, by name
 * (src/lib/services/placeholders.ts), and answers their claim link to send them.
 */
export async function POST(request: Request, { params }: { params: Promise<{ groupId: string }> }) {
    const auth = await requireCaller(request);
    if (!auth.ok) return auth.response;
    const body = await readV1Body(request, NewPlaceholder);
    if (!body.ok) return body.response;
    const { groupId } = await params;
    try {
        const added = await addPlaceholder({ id: auth.caller.userId }, groupId, body.data.name);
        if (!added.ok) return v1Error(added.error, added.status, added.code);
        return v1Json({ userId: added.value.userId, name: added.value.name, url: claimUrl(new URL(request.url).origin, added.value.claimToken) }, 201);
    } catch (error) {
        logger.error('Phone add-by-name failed', { err: error });
        return v1Error('Couldn’t add them. Try again.', 500, 'server_error');
    }
}
