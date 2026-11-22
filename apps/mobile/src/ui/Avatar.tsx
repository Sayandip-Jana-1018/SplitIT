import { useState } from 'react';
import { Image, View } from 'react-native';
import { useLook } from '~/theme/ThemeProvider';
import { Text } from './Text';

/** A photo the phone can load: Google's, GitHub's or SplitIT's own storage. Anything else shows initials. */
const loadable = (image?: string | null): image is string => Boolean(image && /^https:\/\//.test(image));

/**
 * A person: their profile photo (Google, GitHub, or one they uploaded on the website) on a disc,
 * or their initials on a disc of the palette's colour when they have none, or it won't load.
 */
export function Avatar({ name, image, size = 34, ring }: { name: string; image?: string | null; size?: number; ring?: boolean }) {
    const { tokens } = useLook();
    const [failed, setFailed] = useState(false);
    const initials = name
        .split(/\s+/)
        .map((part) => part[0])
        .join('')
        .slice(0, 2)
        .toUpperCase();
    const photo = loadable(image) && !failed;
    return (
        <View
            accessibilityLabel={name}
            style={{
                width: size,
                height: size,
                borderRadius: size / 2,
                backgroundColor: tokens.accent,
                alignItems: 'center',
                justifyContent: 'center',
                borderWidth: ring ? 2 : 0,
                borderColor: tokens.bg,
                overflow: 'hidden',
            }}
        >
            <Text variant="caption" weight="bold" tone="onAccent" style={{ fontSize: size * 0.36, lineHeight: size * 0.44 }}>
                {initials}
            </Text>
            {photo ? (
                // Over the initials, so they show while it loads and stay if it fails.
                <Image source={{ uri: image }} onError={() => setFailed(true)} accessibilityIgnoresInvertColors style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%' }} />
            ) : null}
        </View>
    );
}

export interface AvatarPerson {
    name: string;
    image?: string | null;
}

export function AvatarStack({ people, size = 26 }: { people: AvatarPerson[]; size?: number }) {
    const shown = people.slice(0, 4);
    return (
        <View style={{ flexDirection: 'row', justifyContent: 'center' }}>
            {shown.map((person, index) => (
                <View key={`${index}-${person.name}`} style={{ marginLeft: index === 0 ? 0 : -size * 0.32 }}>
                    <Avatar name={person.name} image={person.image} size={size} ring />
                </View>
            ))}
        </View>
    );
}
