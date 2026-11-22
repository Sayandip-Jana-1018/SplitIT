/**
 * Saying an expense: a mic button that records a few seconds of you ("dinner 1,200 split with
 * Ravi and Meera, paid by me") and has the server's AI hear and read it (POST
 * /api/v1/voice/parse, the website's voice rules), then hands back the draft to fill the form.
 *
 * The recording is mono AAC at 32 kbps, about 4 KB a second, so it travels quickly even on a weak
 * signal; it stops by itself after 30 seconds. Recording needs the mic permission, asked the first
 * time; understanding needs a connection and an account, and the sheet says so when either is
 * missing. The recording is deleted from the phone once it has been read.
 */
import { AudioModule, RecordingPresets, setAudioModeAsync, useAudioRecorder, useAudioRecorderState, type RecordingOptions } from 'expo-audio';
import { File } from 'expo-file-system';
import { Mic } from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Platform, View } from 'react-native';
import type { ParsedVoice } from '@/lib/contract/v1';
import { api, ApiError } from '~/api';
import { useLook } from '~/theme/ThemeProvider';
import { GlassButton, tap } from './GlassButton';
import { Sheet } from './Sheet';
import { Text } from './Text';
import { useToast } from './Toast';

const VOICE: RecordingOptions = {
    ...RecordingPresets.HIGH_QUALITY,
    extension: '.aac',
    sampleRate: 16_000,
    numberOfChannels: 1,
    bitRate: 32_000,
    isMeteringEnabled: true,
    android: { ...RecordingPresets.HIGH_QUALITY.android, extension: '.aac', outputFormat: 'aac_adts', audioEncoder: 'aac' },
};

const LONGEST_MS = 30_000;
const SHORTEST_MS = 700;

type Stage = { kind: 'closed' } | { kind: 'listening' } | { kind: 'understanding' } | { kind: 'failed'; message: string };

export interface VoiceGroup {
    groupName: string;
    memberNames: string[];
    speakerName: string;
}

export function VoiceButton({ group, onHeard, enabled }: { group: VoiceGroup; onHeard: (parsed: ParsedVoice) => void; enabled: boolean }) {
    const { tokens } = useLook();
    const toast = useToast();
    const recorder = useAudioRecorder(VOICE);
    const state = useAudioRecorderState(recorder, 120);
    const [stage, setStage] = useState<Stage>({ kind: 'closed' });
    const limit = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
    // A reading whose sheet was closed, or that a newer recording replaced, is let go.
    const turn = useRef(0);

    // How long it has recorded, for the stop the 30-second limit makes from an older render.
    const spokenMs = useRef(0);
    useEffect(() => {
        spokenMs.current = state.durationMillis;
    }, [state.durationMillis]);

    useEffect(() => () => clearTimeout(limit.current), []);

    const start = async () => {
        tap();
        if (!enabled) {
            toast('Voice needs an account and a connection. Type it instead.', 'info');
            return;
        }
        const permission = await AudioModule.requestRecordingPermissionsAsync();
        if (!permission.granted) {
            toast('Microphone access is off. You can turn it on in Settings.', 'info');
            return;
        }
        try {
            await setAudioModeAsync({ playsInSilentMode: true, allowsRecording: true });
            await recorder.prepareToRecordAsync();
            recorder.record();
        } catch {
            toast('The microphone couldn’t start. Try again.', 'info');
            return;
        }
        turn.current += 1;
        setStage({ kind: 'listening' });
        clearTimeout(limit.current);
        limit.current = setTimeout(() => void finish(), LONGEST_MS);
    };

    const stopRecording = async () => {
        clearTimeout(limit.current);
        try {
            await recorder.stop();
        } catch {
            // Already stopped.
        }
        setAudioModeAsync({ allowsRecording: false }).catch(() => undefined);
        return recorder.uri;
    };

    const finish = async () => {
        const mine = turn.current;
        const spoke = spokenMs.current;
        const uri = await stopRecording();
        if (!uri || spoke < SHORTEST_MS) {
            setStage({ kind: 'failed', message: 'That was too short. Tap Try again and say the expense, then Done.' });
            return;
        }
        setStage({ kind: 'understanding' });
        const file = new File(uri);
        try {
            const audio = await file.base64();
            const mimeType = Platform.OS === 'android' ? 'audio/aac' : 'audio/mp4';
            const parsed = await api.parseVoice({ audio: `data:${mimeType};base64,${audio}`, ...group });
            if (mine !== turn.current) return;
            setStage({ kind: 'closed' });
            onHeard(parsed);
        } catch (error) {
            if (mine !== turn.current) return;
            const message =
                error instanceof ApiError
                    ? error.kind === 'offline'
                        ? 'Voice needs a connection. Type it instead, or try again when you’re back online.'
                        : error.message
                    : 'That recording couldn’t be read. Try again.';
            setStage({ kind: 'failed', message });
        } finally {
            try {
                file.delete();
            } catch {
                // Gone already.
            }
        }
    };

    const close = () => {
        turn.current += 1;
        if (stage.kind === 'listening') void stopRecording();
        setStage({ kind: 'closed' });
    };

    // dBFS from about -60 (quiet) to 0 (loud), as a 0-1 level for the ring.
    const level = stage.kind === 'listening' && typeof state.metering === 'number' ? Math.min(1, Math.max(0, (state.metering + 60) / 60)) : 0;
    const seconds = Math.floor(state.durationMillis / 1000);

    return (
        <>
            <GlassButton kind="thin" contentStyle={{ width: 42, height: 42 }} accessibilityLabel="Say the expense" onPress={() => void start()}>
                <Mic size={19} color={tokens.fg} strokeWidth={2.2} />
            </GlassButton>
            <Sheet open={stage.kind !== 'closed'} onClose={close} title={stage.kind === 'understanding' ? 'Understanding…' : 'Say the expense'} hint={stage.kind === 'listening' ? 'Like: dinner 1,200 split with Ravi and Meera, paid by me' : undefined}>
                {stage.kind === 'listening' ? (
                    <View style={{ alignItems: 'center', gap: 16, paddingVertical: 8 }} accessibilityLiveRegion="polite">
                        <View
                            style={{
                                width: 96,
                                height: 96,
                                borderRadius: 48,
                                alignItems: 'center',
                                justifyContent: 'center',
                                backgroundColor: tokens.accent,
                                borderWidth: 2 + level * 10,
                                borderColor: tokens.chip,
                                transform: [{ scale: 1 + level * 0.18 }],
                            }}
                        >
                            <Mic size={38} color={tokens.onAccent} strokeWidth={2.2} />
                        </View>
                        <Text variant="heading" tabular>{`Listening… 0:${String(seconds).padStart(2, '0')}`}</Text>
                        <GlassButton kind="accent" contentStyle={{ height: 52, paddingHorizontal: 40 }} accessibilityLabel="Done speaking" onPress={() => void finish()}>
                            <Text variant="heading" tone="onAccent">
                                Done
                            </Text>
                        </GlassButton>
                    </View>
                ) : null}
                {stage.kind === 'understanding' ? (
                    <View style={{ alignItems: 'center', gap: 12, paddingVertical: 18 }}>
                        <ActivityIndicator color={tokens.accentText} size="large" />
                        <Text variant="label" tone="secondary">
                            Working out the amount, who paid and who shares it.
                        </Text>
                    </View>
                ) : null}
                {stage.kind === 'failed' ? (
                    <View style={{ alignItems: 'center', gap: 14, paddingVertical: 8 }}>
                        <Text variant="label" tone="secondary">
                            {stage.message}
                        </Text>
                        <GlassButton kind="accent" contentStyle={{ height: 50, paddingHorizontal: 32 }} onPress={() => void start()}>
                            <Text variant="heading" tone="onAccent">
                                Try again
                            </Text>
                        </GlassButton>
                    </View>
                ) : null}
            </Sheet>
        </>
    );
}
