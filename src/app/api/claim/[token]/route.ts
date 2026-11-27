import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import { claimPlaceholder, previewClaim } from '@/lib/services/placeholders';

/**
 * A friend's claim link (src/lib/services/placeholders.ts).
 * GET: who you'd become and in which groups (signed in or not; `alreadyIn` when signed in).
 * POST: become them, signed in. A used or replaced link answers 404.
 */

async function signedInUser() {
    const session = await auth();
    if (!session?.user?.email) return null;
    return prisma.user.findUnique({ where: { email: session.user.email }, select: { id: true, name: true, placeholder: true } });
}

export async function GET(_request: Request, { params }: { params: Promise<{ token: string }> }) {
    try {
        const { token } = await params;
        const user = await signedInUser();
        const preview = await previewClaim(token, user?.id);
        if (!preview.ok) return NextResponse.json({ error: preview.error, code: preview.code }, { status: preview.status });
        return NextResponse.json({ ...preview.value, signedIn: Boolean(user) });
    } catch (error) {
        logger.error('Claim preview failed', { err: error });
        return NextResponse.json({ error: 'Could not open this link' }, { status: 500 });
    }
}

export async function POST(_request: Request, { params }: { params: Promise<{ token: string }> }) {
    try {
        const user = await signedInUser();
        if (!user || user.placeholder) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        const { token } = await params;
        const claimed = await claimPlaceholder(user, token);
        if (!claimed.ok) return NextResponse.json({ error: claimed.error, code: claimed.code }, { status: claimed.status });
        return NextResponse.json(claimed.value);
    } catch (error) {
        logger.error('Claim failed', { err: error });
        return NextResponse.json({ error: 'Could not finish joining. Try again.' }, { status: 500 });
    }
}
