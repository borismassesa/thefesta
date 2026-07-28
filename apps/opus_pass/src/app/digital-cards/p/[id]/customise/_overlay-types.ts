export type OverlayItemType = 'text' | 'sticker' | 'image'

export type OverlayItem = {
  id: string
  type: OverlayItemType
  x: number        // percent of card width (0–100)
  y: number        // percent of card height (0–100)
  content: string  // text string | sticker char | image data URL
  fontSize: number // card-relative px units
  color: string    // hex
  rotation: number // degrees
  opacity: number  // 0–1
  zIndex: number
}

export const STICKERS: { group: string; items: string[] }[] = [
  { group: 'Florals',  items: ['✿', '❀', '✾', '❁', '🌸', '🌺', '🌿', '🍃'] },
  { group: 'Hearts',   items: ['♡', '♥', '❤', '❣', '💕', '💗', '💖', '🤍'] },
  { group: 'Sparkle',  items: ['✦', '✧', '★', '☆', '✨', '⭐', '✶', '✵'] },
  { group: 'Wedding',  items: ['💍', '🕊', '🥂', '🎊', '🎀', '☽', '∞', '◈'] },
]
