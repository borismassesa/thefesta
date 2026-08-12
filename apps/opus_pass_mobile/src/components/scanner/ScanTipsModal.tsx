import { Modal, Pressable, Text, View } from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ACCENT, ON_ACCENT } from '@/theme/brand';
import { useTheme } from '@/theme/useTheme';

/** Side of the square the corner brackets frame. */
const RETICLE_SIZE = 132;

/**
 * The camera's own reticle, drawn at rest.
 *
 * A picture of the thing the tips are describing, rather than decoration: the
 * attendant meets these exact brackets a second later on the live feed, so the
 * screen teaches the target it is about to hand them. Line art in theme
 * tokens, so it stays legible in both schemes without carrying a colour block.
 */
function ScanReticle() {
  const { editorial } = useTheme();
  return (
    <View
      className="items-center justify-center"
      style={{ width: RETICLE_SIZE, height: RETICLE_SIZE }}
    >
      {(
        [
          { top: 0, left: 0, borderTopWidth: 2.5, borderLeftWidth: 2.5, borderTopLeftRadius: 14 },
          { top: 0, right: 0, borderTopWidth: 2.5, borderRightWidth: 2.5, borderTopRightRadius: 14 },
          { bottom: 0, left: 0, borderBottomWidth: 2.5, borderLeftWidth: 2.5, borderBottomLeftRadius: 14 },
          { bottom: 0, right: 0, borderBottomWidth: 2.5, borderRightWidth: 2.5, borderBottomRightRadius: 14 },
        ] as const
      ).map((corner, i) => (
        <View
          key={i}
          style={{
            position: 'absolute',
            width: 34,
            height: 34,
            borderColor: editorial.outline,
            ...corner,
          }}
        />
      ))}
      <MaterialCommunityIcons name="qrcode" size={56} color={editorial.onSurface} />
    </View>
  );
}

const TIPS: {
  icon: keyof typeof Ionicons.glyphMap;
  text: string;
}[] = [
  {
    icon: 'qr-code-outline',
    text: "Point the camera at the QR on the guest's ticket and hold the phone still",
  },
  {
    icon: 'scan-outline',
    text: 'Keep the whole code inside the brackets, about a hand-span away',
  },
  {
    icon: 'create-outline',
    text: "If the QR won't scan, type the 8-character ticket code or find the guest by name",
  },
];

interface ScanTipsModalProps {
  visible: boolean;
  onClose: () => void;
}

/**
 * The one piece of training a door attendant gets.
 *
 * Shown unprompted the first time the scan screen opens, because the moment
 * they need it — a guest in front of them, a queue behind — is the moment
 * they will not go looking for help.
 */
export function ScanTipsModal({ visible, onClose }: ScanTipsModalProps) {
  const { editorial } = useTheme();

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <SafeAreaView className="flex-1 bg-ed-bg">
        <View className="flex-row px-4 pt-4">
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close"
            onPress={onClose}
            hitSlop={12}
            className="h-10 w-10 items-center justify-center rounded-full"
            style={{ backgroundColor: editorial.surfaceContainer }}
          >
            <Ionicons name="close" size={20} color={editorial.onSurface} />
          </Pressable>
        </View>

        <View className="flex-1 px-6">
          <View className="items-center py-7">
            <ScanReticle />
          </View>

          <Text className="font-inter-bold text-screen-title leading-9 text-ed-on-surface">
            Scan the pass to check a guest in
          </Text>

          <View className="mt-7">
            {TIPS.map((tip) => (
              <View key={tip.icon} className="mb-5 flex-row items-start gap-4">
                {/* Soft circles, not filled ones: three solid discs down the
                    left read as buttons and drag the eye off the words they
                    are labelling. */}
                <View
                  className="h-10 w-10 shrink-0 items-center justify-center rounded-full"
                  style={{ backgroundColor: editorial.surfaceContainer }}
                >
                  <Ionicons name={tip.icon} size={20} color={editorial.onSurface} />
                </View>
                <Text className="mt-2 flex-1 font-inter text-body-sm leading-6 text-ed-on-surface">
                  {tip.text}
                </Text>
              </View>
            ))}
          </View>
        </View>

        <View className="border-t border-ed-outline-variant px-4 pb-2 pt-3">
          {/* The scanner's primary CTA colour, matching "Continue scanning"
              on the entry screen: this is the button that starts the shift's
              real work, so it should look like the one that resumes it. */}
          <Pressable
            accessibilityRole="button"
            onPress={onClose}
            className="h-14 items-center justify-center rounded-full"
            style={{ backgroundColor: ACCENT }}
          >
            <Text
              className="font-inter-bold text-body-sm uppercase tracking-[1px]"
              style={{ color: ON_ACCENT }}
            >
              Got it
            </Text>
          </Pressable>
        </View>
      </SafeAreaView>
    </Modal>
  );
}

interface ScanTipsBannerProps {
  onOpen: () => void;
  onDismiss: () => void;
}

/** Persistent way back to the tips, dismissible once the shift finds its feet. */
export function ScanTipsBanner({ onOpen, onDismiss }: ScanTipsBannerProps) {
  return (
    <View
      className="mx-4 flex-row items-center gap-3 rounded-2xl px-4 py-3"
      style={{ backgroundColor: 'rgba(255,255,255,0.16)' }}
    >
      <Ionicons name="bulb-outline" size={19} color="#FFFFFF" />
      <Text className="flex-1 font-inter text-caption text-white" numberOfLines={1}>
        Tips for scanning passes
      </Text>
      <Pressable
        accessibilityRole="button"
        onPress={onOpen}
        hitSlop={8}
        className="rounded-full px-3 py-1"
        style={{ backgroundColor: 'rgba(255,255,255,0.22)' }}
      >
        <Text className="font-inter-semibold text-caption text-white">See tips</Text>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Dismiss scanning tips"
        onPress={onDismiss}
        hitSlop={10}
      >
        <Ionicons name="close" size={17} color="rgba(255,255,255,0.75)" />
      </Pressable>
    </View>
  );
}
