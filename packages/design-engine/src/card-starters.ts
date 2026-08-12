/**
 * Polished invitation card starters for Design Studio.
 * Semantic field bindings, decorative placeholders — no QR codes or logos.
 */

import { newElementId } from './ids'
import {
  createImageElement,
  createShapeElement,
  createTextElement,
  type DesignElement,
  type DesignPage,
  type TextElement,
} from './schema'

export type CardStarterEventType =
  | 'wedding'
  | 'send_off'
  | 'kitchen_party'
  | 'bridal_shower'
  | 'save_the_date'
  | 'contribution'

export type CardStarterTheme = {
  background: string
  ink: string
  muted: string
  accent: string
  accentSoft: string
  panel: string
  swatchA: string
  swatchB: string
  swatchC: string
}

export type CardStarter = {
  key: string
  name: string
  eventType: CardStarterEventType
  eventTypeLabel: string
  description: string
  width: number
  height: number
  theme: CardStarterTheme
  /** Colours shown on the Templates thumbnail. */
  previewColors: [string, string, string]
}

export const CARD_STARTER_EVENT_TYPES: { id: CardStarterEventType | 'all'; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'wedding', label: 'Wedding' },
  { id: 'send_off', label: 'Send-Off' },
  { id: 'kitchen_party', label: 'Kitchen Party' },
  { id: 'bridal_shower', label: 'Bridal Shower' },
  { id: 'save_the_date', label: 'Save the Date' },
  { id: 'contribution', label: 'Contribution' },
]

const W = 1080
const H = 1350

const THEMES = {
  ivory: {
    background: '#F7F1E8',
    ink: '#2C2416',
    muted: '#7A6A55',
    accent: '#C4A484',
    accentSoft: '#E8D5C0',
    panel: '#FFFCF7',
    swatchA: '#2C2416',
    swatchB: '#C4A484',
    swatchC: '#E8C4C4',
  },
  navy: {
    background: '#0F1C2E',
    ink: '#F4EFE6',
    muted: '#B7C0CC',
    accent: '#D4AF37',
    accentSoft: '#1E334F',
    panel: '#15253A',
    swatchA: '#F4EFE6',
    swatchB: '#D4AF37',
    swatchC: '#8FA0B5',
  },
  lavender: {
    background: '#F4EEF8',
    ink: '#3D2E4A',
    muted: '#8B7799',
    accent: '#9B7EBD',
    accentSoft: '#E2D4EF',
    panel: '#FBF8FD',
    swatchA: '#3D2E4A',
    swatchB: '#9B7EBD',
    swatchC: '#E8C4C4',
  },
  sendOff: {
    background: '#F6EDE4',
    ink: '#3A2A1F',
    muted: '#8A6F5A',
    accent: '#B86B4B',
    accentSoft: '#E8C9B5',
    panel: '#FFF9F4',
    swatchA: '#3A2A1F',
    swatchB: '#B86B4B',
    swatchC: '#D4A574',
  },
  kitchen: {
    background: '#FFF8F0',
    ink: '#3B2A1E',
    muted: '#8B6F5C',
    accent: '#D97757',
    accentSoft: '#F3D2C0',
    panel: '#FFFFFF',
    swatchA: '#3B2A1E',
    swatchB: '#D97757',
    swatchC: '#E8B86D',
  },
  shower: {
    background: '#FDF4F6',
    ink: '#4A2F38',
    muted: '#9A7580',
    accent: '#D4A0AE',
    accentSoft: '#F0D6DD',
    panel: '#FFFBFC',
    swatchA: '#4A2F38',
    swatchB: '#D4A0AE',
    swatchC: '#E8C4C4',
  },
  saveDate: {
    background: '#F5F2EC',
    ink: '#1F1A14',
    muted: '#6F6558',
    accent: '#8B7355',
    accentSoft: '#DDD2C3',
    panel: '#FFFEFB',
    swatchA: '#1F1A14',
    swatchB: '#8B7355',
    swatchC: '#C4A484',
  },
  pledge: {
    background: '#F3EFE8',
    ink: '#1A1A1A',
    muted: '#6B6560',
    accent: '#7E5896',
    accentSoft: '#E5D6EF',
    panel: '#FFFEFA',
    swatchA: '#1A1A1A',
    swatchB: '#7E5896',
    swatchC: '#C4A484',
  },
} as const satisfies Record<string, CardStarterTheme>

type CopyPack = {
  hosts: string
  inviteLine: string
  dressLabel: string
  rsvpLine: string
  photoName: string
  honorLabel?: string
}

const COPY: Record<CardStarterEventType, CopyPack> = {
  wedding: {
    hosts: 'Together with their families',
    inviteLine: 'joyfully invite',
    dressLabel: 'Dress code',
    rsvpLine: 'Kindly RSVP',
    photoName: 'Floral / photo placeholder',
  },
  send_off: {
    hosts: 'With joyful hearts',
    inviteLine: 'invite you to their Send-Off',
    dressLabel: 'Dress code',
    rsvpLine: 'Kindly confirm attendance',
    photoName: 'Celebration photo placeholder',
  },
  kitchen_party: {
    hosts: 'You are warmly invited',
    inviteLine: 'to a Kitchen Party in honour of',
    dressLabel: 'Colour vibe',
    rsvpLine: 'Please RSVP',
    photoName: 'Party photo placeholder',
    honorLabel: 'Honouree',
  },
  bridal_shower: {
    hosts: 'Please join us',
    inviteLine: 'for a Bridal Shower celebrating',
    dressLabel: 'Palette',
    rsvpLine: 'Kindly RSVP',
    photoName: 'Shower photo placeholder',
    honorLabel: 'Bride',
  },
  save_the_date: {
    hosts: 'Save the Date',
    inviteLine: 'for the wedding of',
    dressLabel: 'Palette',
    rsvpLine: 'Formal invitation to follow',
    photoName: 'Couple photo placeholder',
  },
  contribution: {
    hosts: 'With gratitude',
    inviteLine: 'we welcome your contribution toward',
    dressLabel: 'Accent colours',
    rsvpLine: 'Thank you for your support',
    photoName: 'Artwork placeholder',
  },
}

function bg(theme: CardStarterTheme): DesignElement {
  return {
    id: newElementId(),
    type: 'artboard_background',
    name: 'Background',
    locked: true,
    visible: true,
    opacity: 1,
    fill: theme.background,
    isBasePlate: false,
    transform: { x: 0, y: 0, width: W, height: H, rotation: 0, scaleX: 1, scaleY: 1 },
  }
}

function staticText(
  name: string,
  content: string,
  theme: CardStarterTheme,
  opts: {
    x: number
    y: number
    w: number
    h: number
    size: number
    weight?: number
    color?: string
    italic?: boolean
    uppercase?: boolean
    tracking?: number
  },
): TextElement {
  return createTextElement({
    name,
    content,
    typography: {
      fontFamily: 'Cormorant Garamond',
      fontWeight: opts.weight ?? 400,
      fontSize: opts.size,
      lineHeight: 1.15,
      letterSpacing: opts.tracking ?? 0,
      textAlign: 'center',
      color: opts.color ?? theme.ink,
      opacity: 1,
      uppercase: opts.uppercase ?? false,
      italic: opts.italic ?? false,
      underline: false,
    },
    layout: {
      fit: 'shrink_wrap',
      minFontSize: Math.max(12, Math.round(opts.size * 0.45)),
      maxLines: 3,
      overflow: 'block',
      verticalAlign: 'middle',
    },
    transform: {
      x: opts.x,
      y: opts.y,
      width: opts.w,
      height: opts.h,
      rotation: 0,
      scaleX: 1,
      scaleY: 1,
    },
  })
}

function boundText(
  name: string,
  path: string,
  role: string,
  fallback: string,
  theme: CardStarterTheme,
  opts: {
    x: number
    y: number
    w: number
    h: number
    size: number
    weight?: number
    color?: string
  },
): TextElement {
  return createTextElement({
    name,
    content: `{{${path}}}`,
    binding: { type: 'variable', path, role, fallback },
    typography: {
      fontFamily: 'Cormorant Garamond',
      fontWeight: opts.weight ?? 500,
      fontSize: opts.size,
      lineHeight: 1.1,
      letterSpacing: 0,
      textAlign: 'center',
      color: opts.color ?? theme.ink,
      opacity: 1,
      uppercase: false,
      italic: false,
      underline: false,
    },
    layout: {
      fit: 'shrink_wrap',
      minFontSize: Math.max(16, Math.round(opts.size * 0.42)),
      maxLines: 2,
      overflow: 'block',
      verticalAlign: 'middle',
    },
    transform: {
      x: opts.x,
      y: opts.y,
      width: opts.w,
      height: opts.h,
      rotation: 0,
      scaleX: 1,
      scaleY: 1,
    },
  })
}

/** Soft abstract “floral” blobs — locked so they don’t steal clicks from text. */
function decorBlobs(theme: CardStarterTheme): DesignElement[] {
  return [
    createShapeElement('ellipse', {
      name: 'Floral accent · top left',
      fill: theme.accentSoft,
      opacity: 0.9,
      locked: true,
      transform: { x: -80, y: -60, width: 320, height: 280, rotation: 0, scaleX: 1, scaleY: 1 },
    }),
    createShapeElement('ellipse', {
      name: 'Floral accent · top right',
      fill: theme.accent,
      opacity: 0.35,
      locked: true,
      transform: { x: 820, y: -40, width: 340, height: 260, rotation: 0, scaleX: 1, scaleY: 1 },
    }),
    createShapeElement('ellipse', {
      name: 'Floral accent · bottom',
      fill: theme.accentSoft,
      opacity: 0.85,
      locked: true,
      transform: { x: 120, y: 1120, width: 840, height: 320, rotation: 0, scaleX: 1, scaleY: 1 },
    }),
  ]
}

function dressSwatches(theme: CardStarterTheme, y: number): DesignElement[] {
  const size = 36
  const gap = 18
  const total = size * 3 + gap * 2
  const startX = (W - total) / 2
  return [
    createShapeElement('ellipse', {
      name: 'Dress swatch A',
      fill: theme.swatchA,
      transform: { x: startX, y, width: size, height: size, rotation: 0, scaleX: 1, scaleY: 1 },
    }),
    createShapeElement('ellipse', {
      name: 'Dress swatch B',
      fill: theme.swatchB,
      transform: {
        x: startX + size + gap,
        y,
        width: size,
        height: size,
        rotation: 0,
        scaleX: 1,
        scaleY: 1,
      },
    }),
    createShapeElement('ellipse', {
      name: 'Dress swatch C',
      fill: theme.swatchC,
      transform: {
        x: startX + (size + gap) * 2,
        y,
        width: size,
        height: size,
        rotation: 0,
        scaleX: 1,
        scaleY: 1,
      },
    }),
  ]
}

function photoPlaceholder(theme: CardStarterTheme, name: string, y: number): DesignElement {
  return createImageElement({
    name,
    photoRole: 'couple_photo',
    fit: 'crop',
    cornerRadius: 18,
    opacity: 1,
    transform: {
      x: 290,
      y,
      width: 500,
      height: 280,
      rotation: 0,
      scaleX: 1,
      scaleY: 1,
    },
  })
}

function buildClassicLayout(
  theme: CardStarterTheme,
  eventType: CardStarterEventType,
): DesignElement[] {
  const copy = COPY[eventType]
  const mx = 100
  const tw = W - mx * 2

  const elements: DesignElement[] = [
    bg(theme),
    ...decorBlobs(theme),
    createShapeElement('rect', {
      name: 'Content panel',
      fill: theme.panel,
      opacity: 0.92,
      cornerRadius: 28,
      locked: true,
      transform: { x: 72, y: 110, width: W - 144, height: 980, rotation: 0, scaleX: 1, scaleY: 1 },
    }),
    staticText('Hosts', copy.hosts, theme, {
      x: mx,
      y: 150,
      w: tw,
      h: 44,
      size: 26,
      italic: true,
      color: theme.muted,
    }),
    boundText('Guest name', 'guest.full_name', 'guest_name', 'Guest', theme, {
      x: mx,
      y: 210,
      w: tw,
      h: 72,
      size: 44,
      weight: 600,
    }),
    staticText('Invite line', copy.inviteLine, theme, {
      x: mx,
      y: 295,
      w: tw,
      h: 36,
      size: 22,
      color: theme.muted,
    }),
    boundText(
      copy.honorLabel ?? 'Couple',
      eventType === 'bridal_shower' || eventType === 'kitchen_party'
        ? 'couple.bride_name'
        : 'couple.display_names',
      eventType === 'bridal_shower' || eventType === 'kitchen_party' ? 'bride_name' : 'couple_names',
      eventType === 'bridal_shower' || eventType === 'kitchen_party' ? 'Dayness' : 'Moses & Dayness',
      theme,
      {
        x: mx,
        y: 350,
        w: tw,
        h: 90,
        size: 58,
        weight: 600,
      },
    ),
    createShapeElement('line', {
      name: 'Divider',
      fill: theme.accent,
      stroke: theme.accent,
      strokeWidth: 2,
      transform: { x: 360, y: 460, width: 360, height: 2, rotation: 0, scaleX: 1, scaleY: 1 },
    }),
    boundText('Event date', 'event.date', 'event_date', '08 August 2026', theme, {
      x: mx,
      y: 490,
      w: tw,
      h: 48,
      size: 28,
      weight: 500,
    }),
    boundText('Church', 'event.church', 'church', 'St. Joseph Cathedral', theme, {
      x: mx,
      y: 545,
      w: tw,
      h: 40,
      size: 22,
      color: theme.muted,
    }),
    boundText('Venue', 'event.venue', 'venue', 'Sala Sala', theme, {
      x: mx,
      y: 590,
      w: tw,
      h: 40,
      size: 22,
      color: theme.muted,
    }),
    staticText('Dress label', copy.dressLabel, theme, {
      x: mx,
      y: 660,
      w: tw,
      h: 28,
      size: 14,
      uppercase: true,
      tracking: 3,
      color: theme.muted,
    }),
    ...dressSwatches(theme, 700),
    staticText('RSVP label', copy.rsvpLine, theme, {
      x: mx,
      y: 770,
      w: tw,
      h: 32,
      size: 18,
      color: theme.muted,
    }),
    boundText('Contact', 'contact.phone', 'contact_phone', '+255 700 000 000', theme, {
      x: mx,
      y: 810,
      w: tw,
      h: 40,
      size: 24,
      weight: 500,
    }),
    photoPlaceholder(theme, copy.photoName, 880),
  ]

  return elements
}

function buildSaveTheDate(theme: CardStarterTheme): DesignElement[] {
  const copy = COPY.save_the_date
  const mx = 90
  const tw = W - mx * 2
  return [
    bg(theme),
    ...decorBlobs(theme),
    staticText('Eyebrow', copy.hosts, theme, {
      x: mx,
      y: 220,
      w: tw,
      h: 40,
      size: 18,
      uppercase: true,
      tracking: 6,
      color: theme.muted,
    }),
    boundText('Couple', 'couple.display_names', 'couple_names', 'Moses & Dayness', theme, {
      x: mx,
      y: 300,
      w: tw,
      h: 120,
      size: 72,
      weight: 600,
    }),
    staticText('Invite line', copy.inviteLine, theme, {
      x: mx,
      y: 440,
      w: tw,
      h: 36,
      size: 22,
      italic: true,
      color: theme.muted,
    }),
    boundText('Event date', 'event.date', 'event_date', '08 August 2026', theme, {
      x: mx,
      y: 520,
      w: tw,
      h: 64,
      size: 36,
      weight: 500,
    }),
    boundText('Venue', 'event.venue', 'venue', 'Sala Sala', theme, {
      x: mx,
      y: 600,
      w: tw,
      h: 44,
      size: 24,
      color: theme.muted,
    }),
    photoPlaceholder(theme, copy.photoName, 720),
    staticText('Footer', copy.rsvpLine, theme, {
      x: mx,
      y: 1060,
      w: tw,
      h: 36,
      size: 18,
      color: theme.muted,
    }),
  ]
}

function buildContribution(theme: CardStarterTheme): DesignElement[] {
  const copy = COPY.contribution
  const mx = 100
  const tw = W - mx * 2
  return [
    bg(theme),
    createShapeElement('rect', {
      name: 'Header band',
      fill: theme.accentSoft,
      locked: true,
      transform: { x: 0, y: 0, width: W, height: 220, rotation: 0, scaleX: 1, scaleY: 1 },
    }),
    staticText('Hosts', copy.hosts, theme, {
      x: mx,
      y: 70,
      w: tw,
      h: 40,
      size: 20,
      uppercase: true,
      tracking: 4,
      color: theme.muted,
    }),
    boundText('Guest name', 'guest.full_name', 'guest_name', 'Guest', theme, {
      x: mx,
      y: 120,
      w: tw,
      h: 64,
      size: 40,
      weight: 600,
    }),
    staticText('Invite line', copy.inviteLine, theme, {
      x: mx,
      y: 280,
      w: tw,
      h: 40,
      size: 22,
      color: theme.muted,
    }),
    boundText('Couple', 'couple.display_names', 'couple_names', 'Moses & Dayness', theme, {
      x: mx,
      y: 340,
      w: tw,
      h: 90,
      size: 52,
      weight: 600,
    }),
    boundText('Event date', 'event.date', 'event_date', '08 August 2026', theme, {
      x: mx,
      y: 450,
      w: tw,
      h: 48,
      size: 26,
    }),
    boundText('Venue', 'event.venue', 'venue', 'Sala Sala', theme, {
      x: mx,
      y: 510,
      w: tw,
      h: 40,
      size: 22,
      color: theme.muted,
    }),
    createShapeElement('rect', {
      name: 'Pledge panel',
      fill: theme.panel,
      stroke: theme.accentSoft,
      strokeWidth: 2,
      cornerRadius: 20,
      locked: true,
      transform: { x: 140, y: 600, width: 800, height: 220, rotation: 0, scaleX: 1, scaleY: 1 },
    }),
    staticText('Pledge prompt', 'Your contribution makes this celebration possible', theme, {
      x: 180,
      y: 640,
      w: 720,
      h: 70,
      size: 24,
      italic: true,
    }),
    staticText('RSVP label', copy.rsvpLine, theme, {
      x: mx,
      y: 880,
      w: tw,
      h: 36,
      size: 18,
      color: theme.muted,
    }),
    boundText('Contact', 'contact.phone', 'contact_phone', '+255 700 000 000', theme, {
      x: mx,
      y: 930,
      w: tw,
      h: 44,
      size: 26,
      weight: 500,
    }),
    ...dressSwatches(theme, 1020),
  ]
}

export const CARD_STARTERS: CardStarter[] = [
  {
    key: 'wedding_ivory',
    name: 'Wedding · Ivory',
    eventType: 'wedding',
    eventTypeLabel: 'Wedding',
    description: 'Classic ivory invitation with guest, couple, venues & dress swatches',
    width: W,
    height: H,
    theme: THEMES.ivory,
    previewColors: [THEMES.ivory.background, THEMES.ivory.accent, THEMES.ivory.ink],
  },
  {
    key: 'wedding_navy',
    name: 'Wedding · Navy',
    eventType: 'wedding',
    eventTypeLabel: 'Wedding',
    description: 'Evening navy card with gold accents',
    width: W,
    height: H,
    theme: THEMES.navy,
    previewColors: [THEMES.navy.background, THEMES.navy.accent, THEMES.navy.ink],
  },
  {
    key: 'wedding_lavender',
    name: 'Wedding · Lavender',
    eventType: 'wedding',
    eventTypeLabel: 'Wedding',
    description: 'Soft lavender celebration layout',
    width: W,
    height: H,
    theme: THEMES.lavender,
    previewColors: [THEMES.lavender.background, THEMES.lavender.accent, THEMES.lavender.ink],
  },
  {
    key: 'send_off',
    name: 'Send-Off',
    eventType: 'send_off',
    eventTypeLabel: 'Send-Off',
    description: 'Warm send-off invitation with bound guest & venues',
    width: W,
    height: H,
    theme: THEMES.sendOff,
    previewColors: [THEMES.sendOff.background, THEMES.sendOff.accent, THEMES.sendOff.ink],
  },
  {
    key: 'kitchen_party',
    name: 'Kitchen Party',
    eventType: 'kitchen_party',
    eventTypeLabel: 'Kitchen Party',
    description: 'Kitchen party honouring the bride — bound fields, no QR',
    width: W,
    height: H,
    theme: THEMES.kitchen,
    previewColors: [THEMES.kitchen.background, THEMES.kitchen.accent, THEMES.kitchen.ink],
  },
  {
    key: 'bridal_shower',
    name: 'Bridal Shower',
    eventType: 'bridal_shower',
    eventTypeLabel: 'Bridal Shower',
    description: 'Bridal shower layout with honouree + RSVP bindings',
    width: W,
    height: H,
    theme: THEMES.shower,
    previewColors: [THEMES.shower.background, THEMES.shower.accent, THEMES.shower.ink],
  },
  {
    key: 'save_the_date',
    name: 'Save the Date',
    eventType: 'save_the_date',
    eventTypeLabel: 'Save the Date',
    description: 'Minimal save-the-date with couple, date & photo frame',
    width: W,
    height: H,
    theme: THEMES.saveDate,
    previewColors: [THEMES.saveDate.background, THEMES.saveDate.accent, THEMES.saveDate.ink],
  },
  {
    key: 'contribution_pledge',
    name: 'Contribution / Pledge',
    eventType: 'contribution',
    eventTypeLabel: 'Contribution',
    description: 'Contribution ask with guest binding — no logos or QR',
    width: W,
    height: H,
    theme: THEMES.pledge,
    previewColors: [THEMES.pledge.background, THEMES.pledge.accent, THEMES.pledge.ink],
  },
]

export function buildCardStarterElements(starter: CardStarter): DesignElement[] {
  if (starter.eventType === 'save_the_date') return buildSaveTheDate(starter.theme)
  if (starter.eventType === 'contribution') return buildContribution(starter.theme)
  return buildClassicLayout(starter.theme, starter.eventType)
}

/** Replace the active page content with a finished-looking starter layout. */
export function applyCardStarterToPage(page: DesignPage, starter: CardStarter): DesignPage {
  return {
    ...page,
    name: starter.eventTypeLabel,
    width: starter.width,
    height: starter.height,
    unit: 'px',
    background: starter.theme.background,
    elements: buildCardStarterElements(starter),
  }
}

export function getCardStarter(key: string): CardStarter | undefined {
  return CARD_STARTERS.find((s) => s.key === key)
}
