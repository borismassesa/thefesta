import { avatarColorFor, initialsOf } from '@/lib/scannerRoster'

interface GuestAvatarProps {
  fullName: string
  size?: number
  /** Colour key. Pass the group tag to make one group read as one colour;
   *  omit it and each guest gets their own. */
  colorKey?: string | null
}

/**
 * Letter badge standing in for a guest photo.
 *
 * A rounded square rather than a circle: it sits beside circular status icons
 * (the arrived tick, the VIP pill) throughout the scanner, and the different
 * silhouette keeps "who" visually separate from "what happened".
 */
export function GuestAvatar({ fullName, size = 40, colorKey }: GuestAvatarProps) {
  const background = avatarColorFor(colorKey?.trim() || fullName)
  return (
    <div
      className="flex shrink-0 items-center justify-center font-bold text-white"
      style={{
        width: size,
        height: size,
        borderRadius: size * 0.3,
        backgroundColor: background,
        fontSize: size * 0.36,
      }}
    >
      {initialsOf(fullName)}
    </div>
  )
}
