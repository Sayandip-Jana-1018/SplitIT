/**
 * Paying a UPI QR and splitting it at once: the camera reads the QR (src/lib/upi.ts readUpiQr),
 * you see who it pays and type the amount when the QR doesn't fix it, and your UPI app opens to pay
 * (the QR's own link, so a shop's bank sees what it printed; your money never passes through
 * SplitIT). Back here, a "did it go through?" opens the expense already filled in, to split.
 *
 * SplitIT can't see the UPI app's answer, so it asks rather than assume: a payment that failed
 * mustn't become an expense.
 */
import { CameraView, useCameraPermissions, type BarcodeScanningResult } from 'expo-camera';
import { router } from 'expo-router';
import { Check, ScanLine, Smartphone, X } from 'lucide-react-native';
import { useRef, useState } from 'react';
import { Linking, View } from 'react-native';
import { readUpiQr, upiQrPayLink, type UpiQr } from '@/lib/upi';
import { GlassSurface } from '~/glass/GlassSurface';
import { useLook } from '~/theme/ThemeProvider';
import { EmptyState } from '~/ui/EmptyState';
import { Field } from '~/ui/Field';
import { GlassButton } from '~/ui/GlassButton';
import { Header } from '~/ui/Header';
import { Keypad } from '~/ui/Keypad';
import { rupees } from '~/ui/money';
import { Screen } from '~/ui/Screen';
import { Text } from '~/ui/Text';
import { useToast } from '~/ui/Toast';

type Stage = { kind: 'scan' } | { kind: 'pay'; qr: UpiQr } | { kind: 'paid'; qr: UpiQr; amount: number; title: string };

/** "1,234.5" → 123450 paise. */
const toPaise = (text: string) => {
    const value = Number(text.replace(/,/g, ''));
    return Number.isFinite(value) && value > 0 ? Math.round(value * 100) : 0;
};

export default function PayByQr() {
    const [stage, setStage] = useState<Stage>({ kind: 'scan' });
    return (
        <Screen tabBar={false}>
            <Header title={stage.kind === 'scan' ? 'Scan a UPI QR' : 'Pay and split'} close />
            {stage.kind === 'scan' ? <Scanner onRead={(qr) => setStage({ kind: 'pay', qr })} /> : null}
            {stage.kind === 'pay' ? <Pay qr={stage.qr} onOpened={(amount, title) => setStage({ kind: 'paid', qr: stage.qr, amount, title })} onAgain={() => setStage({ kind: 'scan' })} /> : null}
            {stage.kind === 'paid' ? <DidItGo stage={stage} onNo={() => setStage({ kind: 'pay', qr: stage.qr })} /> : null}
        </Screen>
    );
}

function Scanner({ onRead }: { onRead: (qr: UpiQr) => void }) {
    const { tokens } = useLook();
    const toast = useToast();
    const [permission, requestPermission] = useCameraPermissions();
    // The camera keeps reporting the same QR many times a second: the first one counts.
    const done = useRef(false);
    const refusedAt = useRef(0);

    if (!permission) return null;
    if (!permission.granted) {
        return (
            <EmptyState
                emoji="📷"
                title="SplitIT needs the camera to read the QR"
                hint="It’s used only while this screen is open."
                action={
                    <GlassButton kind="accent" contentStyle={{ height: 48, paddingHorizontal: 26 }} onPress={() => void requestPermission()}>
                        <Text variant="label" weight="bold" tone="onAccent">
                            Allow the camera
                        </Text>
                    </GlassButton>
                }
            />
        );
    }

    const scanned = ({ data }: BarcodeScanningResult) => {
        if (done.current) return;
        const qr = readUpiQr(data);
        if (qr) {
            done.current = true;
            onRead(qr);
            return;
        }
        // Not a UPI QR: said once every few seconds, not every frame.
        if (Date.now() - refusedAt.current > 3_000) {
            refusedAt.current = Date.now();
            toast('That isn’t a UPI payment QR.', 'info');
        }
    };

    return (
        <>
            <GlassSurface kind="thick" style={{ padding: 10 }}>
                <View style={{ height: 340, borderRadius: 18, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' }}>
                    <CameraView style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} facing="back" barcodeScannerSettings={{ barcodeTypes: ['qr'] }} onBarcodeScanned={scanned} />
                    <View pointerEvents="none" style={{ width: 210, height: 210, borderRadius: 26, borderWidth: 3, borderColor: tokens.fg, opacity: 0.85 }} />
                </View>
            </GlassSurface>
            <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center' }}>
                <ScanLine size={16} color={tokens.fg2} strokeWidth={2.2} />
                <Text variant="label" tone="secondary" onLiquid>
                    Point at a shop’s or a friend’s UPI QR
                </Text>
            </View>
        </>
    );
}

function Pay({ qr, onOpened, onAgain }: { qr: UpiQr; onOpened: (amount: number, title: string) => void; onAgain: () => void }) {
    const { tokens } = useLook();
    const toast = useToast();
    const [typed, setTyped] = useState('');
    const [title, setTitle] = useState(qr.payeeName ?? '');
    const amount = qr.amount ?? toPaise(typed);

    const pay = async () => {
        if (amount <= 0) return;
        try {
            await Linking.openURL(upiQrPayLink(qr, amount));
            onOpened(amount, title.trim() || qr.payeeName || 'UPI payment');
        } catch {
            toast('No UPI app could open. Install Google Pay, PhonePe, Paytm or your bank’s app.', 'info');
        }
    };

    return (
        <>
            <GlassSurface kind="thick" style={{ paddingVertical: 20, paddingHorizontal: 18, gap: 4, alignItems: 'center' }}>
                <Text variant="eyebrow" tone="secondary">
                    {qr.merchant ? 'Paying a shop' : 'Paying'}
                </Text>
                <Text variant="title" numberOfLines={2}>
                    {qr.payeeName ?? qr.upiId}
                </Text>
                <Text variant="caption" tone="secondary">
                    {qr.upiId}
                </Text>
                <Text variant="display" tabular style={{ marginTop: 6 }}>
                    {qr.amount !== null ? rupees(qr.amount) : `₹${typed || '0'}`}
                </Text>
                {qr.amount !== null ? (
                    <Text variant="caption" tone="secondary">
                        The amount on the QR
                    </Text>
                ) : null}
            </GlassSurface>

            {qr.amount === null ? <Keypad value={typed} onChange={setTyped} /> : null}
            <Field label="What was it for?" value={title} onChangeText={setTitle} returnKeyType="done" />

            <GlassButton kind="accent" contentStyle={{ height: 56, flexDirection: 'row', gap: 10 }} disabled={amount <= 0} onPress={() => void pay()} accessibilityLabel={amount > 0 ? `Pay ${rupees(amount)} with a UPI app` : 'Type the amount first'}>
                <Smartphone size={20} color={tokens.onAccent} strokeWidth={2.3} />
                <Text variant="heading" tone="onAccent">
                    {amount > 0 ? `Pay ${rupees(amount)} with a UPI app` : 'Type the amount'}
                </Text>
            </GlassButton>
            <GlassButton kind="thin" contentStyle={{ height: 46 }} onPress={onAgain}>
                <Text variant="label" weight="bold">
                    Scan another QR
                </Text>
            </GlassButton>
        </>
    );
}

function DidItGo({ stage, onNo }: { stage: { qr: UpiQr; amount: number; title: string }; onNo: () => void }) {
    const { tokens } = useLook();
    return (
        <>
            <GlassSurface kind="thick" style={{ paddingVertical: 24, paddingHorizontal: 18, gap: 8, alignItems: 'center' }}>
                <Text variant="heading">Did the payment go through?</Text>
                <Text variant="label" tone="secondary">
                    {`${rupees(stage.amount)} to ${stage.qr.payeeName ?? stage.qr.upiId}. SplitIT can’t see your UPI app, so it asks.`}
                </Text>
            </GlassSurface>
            <GlassButton
                kind="accent"
                contentStyle={{ height: 56, flexDirection: 'row', gap: 10 }}
                onPress={() => router.replace({ pathname: '/add', params: { amount: String(stage.amount), title: stage.title } })}
            >
                <Check size={20} color={tokens.onAccent} strokeWidth={2.4} />
                <Text variant="heading" tone="onAccent">
                    Yes, split it
                </Text>
            </GlassButton>
            <GlassButton kind="thin" contentStyle={{ height: 48, flexDirection: 'row', gap: 8 }} onPress={onNo}>
                <X size={18} color={tokens.fg} strokeWidth={2.2} />
                <Text variant="label" weight="bold">
                    No, it didn’t
                </Text>
            </GlassButton>
        </>
    );
}
