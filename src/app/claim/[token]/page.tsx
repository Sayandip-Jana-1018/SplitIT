'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import useSWR from 'swr';
import { motion } from 'framer-motion';
import { ArrowRightLeft, Check, Link2Off, LogIn, ReceiptText, RotateCcw, UserCheck, WifiOff } from 'lucide-react';
import Button from '@/components/ui/Button';
import { Notice, Spinner } from '@/components/ui/kit';
import { AuthCard, PublicShell, apiErrorMessage } from '@/components/auth/AuthKit';
import { sessionEnded } from '@/lib/signOut';
import { cn } from '@/lib/utils';
import styles from '@/components/auth/auth.module.css';

/**
 * A friend's claim link (src/lib/services/placeholders.ts): someone added you to a group by name
 * before you were on SplitIT. Signed in, "Yes, that's me" moves everything under that name to
 * your account; signed out, you sign in (or sign up) and come back here.
 */

interface ClaimPreview {
    name: string;
    groups: { id: string; name: string; emoji: string }[];
    alreadyIn: string[];
    signedIn: boolean;
}

async function previewFetcher(url: string): Promise<ClaimPreview | null> {
    const response = await fetch(url);
    if (!response.ok) {
        if (response.status >= 500) throw new Error('Server error');
        return null;
    }
    return response.json();
}

const listOf = (names: string[]) => (names.length <= 1 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`);

export default function ClaimPage() {
    const params = useParams();
    const router = useRouter();
    const token = params.token as string;
    const { data: claim, error, isLoading, mutate } = useSWR(token ? `/api/claim/${encodeURIComponent(token)}` : null, previewFetcher, { revalidateOnFocus: false });
    const [claiming, setClaiming] = useState(false);
    const [claimError, setClaimError] = useState('');
    const [done, setDone] = useState<string | null>(null);

    const becomeThem = async () => {
        setClaiming(true);
        setClaimError('');
        try {
            const res = await fetch(`/api/claim/${encodeURIComponent(token)}`, { method: 'POST' });
            if (res.status === 401) {
                sessionEnded(`/claim/${token}`);
                return;
            }
            const data = await res.json().catch(() => null);
            if (res.ok) {
                const first = (data?.groupIds as string[] | undefined)?.[0];
                setDone(first ?? '');
                window.setTimeout(() => router.push(first ? `/groups/${first}` : '/groups'), 1400);
            } else {
                setClaimError(apiErrorMessage(data, 'We couldn’t finish that. Please try again.'));
            }
        } catch {
            setClaimError('Network error — please try again.');
        } finally {
            setClaiming(false);
        }
    };

    let content;
    if (isLoading) {
        content = (
            <AuthCard key="loading" title="Opening your link…">
                <div className={styles.loadingBlock}><Spinner size={28} /></div>
            </AuthCard>
        );
    } else if (error) {
        content = (
            <AuthCard key="error" icon={<span className={cn(styles.stateIcon, styles.stateDanger)}><WifiOff size={30} /></span>} title="Couldn’t open this link" subtitle="Check your connection and try again.">
                <Button fullWidth size="lg" leftIcon={<RotateCcw size={17} />} onClick={() => mutate()}>Try again</Button>
            </AuthCard>
        );
    } else if (!claim) {
        content = (
            <AuthCard key="invalid" icon={<span className={cn(styles.stateIcon, styles.stateDanger)}><Link2Off size={30} /></span>} title="This link has been used" subtitle="It works once, and a friend may have sent a newer one. Ask them for a fresh link.">
                <Button fullWidth size="lg" onClick={() => router.push('/dashboard')}>Go to SplitIT</Button>
            </AuthCard>
        );
    } else if (done !== null) {
        content = (
            <AuthCard
                key="done"
                icon={(
                    <motion.span className={cn(styles.stateIcon, styles.stateSuccess)} initial={{ scale: 0.4, rotate: -14 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: 'spring', stiffness: 420, damping: 15 }}>
                        <Check size={34} strokeWidth={3} />
                    </motion.span>
                )}
                title="It’s all yours now"
                subtitle={<>Everything under <strong>{claim.name}</strong> is on your account. Opening the group…</>}
            />
        );
    } else {
        const groups = claim.groups.map((group) => `${group.emoji} ${group.name}`);
        const merged = claim.groups.filter((group) => claim.alreadyIn.includes(group.id)).map((group) => group.name);
        content = (
            <AuthCard
                key="claim"
                icon={(
                    <div className={styles.joinHead}>
                        <motion.span className={styles.groupEmoji} initial={{ scale: 0.6, rotate: -10 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: 'spring', stiffness: 380, damping: 16 }}>
                            {claim.groups[0]?.emoji ?? '👋'}
                        </motion.span>
                        <span className={styles.eyebrow}>A friend added you as</span>
                    </div>
                )}
                title={claim.name}
                subtitle={groups.length > 0 ? `In ${listOf(groups)}.` : 'Before you were on SplitIT.'}
            >
                <ul className={styles.perks}>
                    <li className={styles.perk}><ReceiptText size={17} />Expenses they paid and their shares move to you</li>
                    <li className={styles.perk}><ArrowRightLeft size={17} />So do payments, and who owes whom stays right</li>
                    {merged.length > 0 && <li className={styles.perk}><UserCheck size={17} />You’re already in {listOf(merged)}: there, the two of you become one</li>}
                </ul>
                {claimError && <Notice tone="danger">{claimError}</Notice>}
                <div className={styles.actions}>
                    {claim.signedIn ? (
                        <Button fullWidth size="lg" loading={claiming} leftIcon={<UserCheck size={18} />} onClick={becomeThem}>
                            Yes, that’s me
                        </Button>
                    ) : (
                        <Button fullWidth size="lg" leftIcon={<LogIn size={18} />} onClick={() => sessionEnded(`/claim/${token}`)}>
                            Sign in or sign up to continue
                        </Button>
                    )}
                    <Button fullWidth variant="ghost" onClick={() => router.push('/dashboard')} disabled={claiming}>
                        That’s not me
                    </Button>
                </div>
            </AuthCard>
        );
    }

    return <PublicShell>{content}</PublicShell>;
}
