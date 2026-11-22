import { NextResponse } from 'next/server';
import { z } from 'zod';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import { parseSpokenText } from '@/lib/services/voiceParse';

/**
 * POST /api/ai/parse-voice — turns what someone said ("dinner 800 split with
 * Sneh and Ankan") into an expense draft: amount, title, split and members.
 * The parsing is shared with the phone (lib/services/voiceParse.ts): Gemini
 * within the person's voice allowance, else a simple parser.
 */

const VoiceSchema = z.object({
    transcript: z.string().trim().min(1).max(500),
    memberNames: z.array(z.string().trim().min(1).max(60)).min(1).max(50),
    groupName: z.string().trim().max(100).default(''),
});

export async function POST(req: Request) {
    try {
        const session = await auth();
        if (!session?.user?.email) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const parsed = VoiceSchema.safeParse(await req.json().catch(() => null));
        if (!parsed.success) {
            const field = parsed.error.issues[0]?.path[0];
            return NextResponse.json(
                {
                    error: field === 'memberNames'
                        ? 'No group members provided'
                        : field === 'transcript'
                            ? 'Say the expense in a sentence or two (up to 500 characters)'
                            : 'Invalid voice request',
                },
                { status: 400 }
            );
        }
        const { transcript, memberNames, groupName } = parsed.data;

        const user = await prisma.user.findUnique({ where: { email: session.user.email }, select: { id: true, name: true } });
        if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

        // "Me" is whoever is speaking, as the group names them.
        const speakerName = memberNames.find((name) => user.name && name.toLowerCase() === user.name.toLowerCase());
        const outcome = await parseSpokenText(user.id, transcript, { memberNames, groupName, speakerName });
        if (!outcome.ok) return NextResponse.json({ error: outcome.error }, { status: outcome.status });
        return NextResponse.json(outcome.parsed);
    } catch (error) {
        logger.error('Voice parse error', { err: error });
        return NextResponse.json({ error: 'Failed to parse voice input' }, { status: 500 });
    }
}
