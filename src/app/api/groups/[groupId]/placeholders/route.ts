import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { NewPlaceholder } from '@/lib/contract/v1';
import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import { addPlaceholder, claimUrl } from '@/lib/services/placeholders';

// POST /api/groups/:groupId/placeholders — add a friend who isn't on SplitIT yet, by name
// (src/lib/services/placeholders.ts); answers their claim link to send them.
export async function POST(request: Request, { params }: { params: Promise<{ groupId: string }> }) {
    try {
        const session = await auth();
        if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        const user = await prisma.user.findUnique({ where: { email: session.user.email }, select: { id: true } });
        if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

        const parsed = NewPlaceholder.safeParse(await request.json().catch(() => null));
        if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Give them a name' }, { status: 400 });

        const { groupId } = await params;
        const added = await addPlaceholder(user, groupId, parsed.data.name);
        if (!added.ok) return NextResponse.json({ error: added.error, code: added.code }, { status: added.status });
        return NextResponse.json({ userId: added.value.userId, name: added.value.name, url: claimUrl(new URL(request.url).origin, added.value.claimToken) }, { status: 201 });
    } catch (error) {
        logger.error('Add by name failed', { err: error });
        return NextResponse.json({ error: 'Could not add them' }, { status: 500 });
    }
}
