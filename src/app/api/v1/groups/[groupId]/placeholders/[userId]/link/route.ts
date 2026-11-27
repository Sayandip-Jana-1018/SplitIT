import { readV1Body, requireCaller, v1Error, v1Json } from '@/lib/apiV1';
import { PlaceholderLinkRequest } from '@/lib/contract/v1';
import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import { claimUrl, placeholderLink } from '@/lib/services/placeholders';

/**
 * POST /api/v1/groups/:groupId/placeholders/:userId/link: a friend's claim link to send again,
 * or a new one (`renew`) that ends the old. 404 once they have joined.
 */
export async function POST(request: Request, { params }: { params: Promise<{ groupId: string; userId: string }> }) {
    const auth = await requireCaller(request);
    if (!auth.ok) return auth.response;
    const body = await readV1Body(request, PlaceholderLinkRequest);
    if (!body.ok) return body.response;
    const { groupId, userId } = await params;
    try {
        const link = await placeholderLink({ id: auth.caller.userId }, groupId, userId, { renew: body.data.renew });
        if (!link.ok) return v1Error(link.error, link.status, link.code);
        const person = await prisma.user.findUnique({ where: { id: userId }, select: { name: true } });
        return v1Json({ userId, name: person?.name ?? 'Your friend', url: claimUrl(new URL(request.url).origin, link.value.claimToken) });
    } catch (error) {
        logger.error('Phone placeholder link failed', { err: error });
        return v1Error('Couldn’t get their link. Try again.', 500, 'server_error');
    }
}
