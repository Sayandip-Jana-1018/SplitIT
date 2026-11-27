/**
 * Adds a friend who isn't on SplitIT yet to a group, by name (Phase 6 step 1,
 * src/lib/services/placeholders.ts): they're in expenses straight away, and the share sheet opens
 * with their own link. Whoever opens it and signs in becomes them, with everything under the name.
 */
import { UserPlus } from 'lucide-react-native';
import { useState } from 'react';
import { Share, View } from 'react-native';
import { api } from '~/api';
import { authErrorMessage } from '~/auth/AuthProvider';
import { useLook } from '~/theme/ThemeProvider';
import { Field } from './Field';
import { GlassButton } from './GlassButton';
import { Sheet } from './Sheet';
import { Text } from './Text';
import { useToast } from './Toast';

/** The message their link goes out in. */
export function claimMessage(name: string, groupName: string, url: string): string {
    return `Hi ${name.split(' ')[0]}, I added you to “${groupName}” on SplitIT. Open this to see what we’ve split and join: ${url}`;
}

export function AddByName({ open, onClose, groupId, groupName, onAdded }: { open: boolean; onClose: () => void; groupId: string; groupName: string; onAdded: () => Promise<unknown> }) {
    const { tokens } = useLook();
    const toast = useToast();
    const [name, setName] = useState('');
    const [busy, setBusy] = useState(false);

    const add = async () => {
        if (!name.trim() || busy) return;
        setBusy(true);
        try {
            const added = await api.addPlaceholder(groupId, name.trim());
            await onAdded();
            setName('');
            onClose();
            toast(`${added.name} is in ${groupName}`);
            await Share.share({ message: claimMessage(added.name, groupName, added.url) });
        } catch (error) {
            toast(authErrorMessage(error), 'info');
        } finally {
            setBusy(false);
        }
    };

    return (
        <Sheet open={open} onClose={onClose} title="Add by name" hint="For a friend not on SplitIT yet. They can be in expenses straight away; you send them a link to join as themselves.">
            <Field label="Their name" value={name} onChangeText={setName} autoCapitalize="words" maxLength={60} returnKeyType="done" onSubmitEditing={() => void add()} />
            <View style={{ gap: 8 }}>
                <GlassButton kind="accent" disabled={!name.trim() || busy} contentStyle={{ height: 52, flexDirection: 'row', gap: 8 }} onPress={() => void add()}>
                    <UserPlus size={18} color={tokens.onAccent} strokeWidth={2.4} />
                    <Text variant="label" weight="bold" tone="onAccent">
                        {busy ? 'Adding…' : `Add to ${groupName}`}
                    </Text>
                </GlassButton>
                <Text variant="caption" tone="secondary">
                    Whoever opens their link and signs in becomes them here, so send it to them only.
                </Text>
            </View>
        </Sheet>
    );
}
