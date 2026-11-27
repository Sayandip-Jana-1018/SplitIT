import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { PlaceholderLinkRequest } from '@/lib/contract/v1';
import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import { claimUrl, placeholderLink } from '@/lib/services/placeholders';

// POST /api/groups/:groupId/placeholders/:userId/link — a friend's claim link to send again,
// or a new one ({ renew: true }) that ends the old. 404 once they have joined.
export async function POST(request: Request, { params }: { params: Promise<{ groupId: string; userId: string }> }) {
    try {
        const session = await auth();
        if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        const user = await prisma.user.findUnique({ where: { email: session.user.email }, select: { id: true } });
        if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

        const parsed = PlaceholderLinkRequest.safeParse(await request.json().catch(() => ({})));
        const { groupId, userId } = await params;
        const link = await placeholderLink(user, groupId, userId, { renew: parsed.success && parsed.data.renew });
        if (!link.ok) return NextResponse.json({ error: link.error, code: link.code }, { status: link.status });
        return NextResponse.json({ url: claimUrl(new URL(request.url).origin, link.value.claimToken) });
    } catch (error) {
        logger.error('Placeholder link failed', { err: error });
        return NextResponse.json({ error: 'Could not get their link' }, { status: 500 });
    }
}
