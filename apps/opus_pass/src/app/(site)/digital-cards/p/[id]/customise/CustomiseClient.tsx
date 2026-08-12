'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import {
  Users, CalendarDays, Shirt, QrCode, Palette, Check, Sparkles, Plus, X,
  ZoomIn, ZoomOut, Lightbulb, HelpCircle, Pencil, Eye, EyeOff, LayoutGrid,
  MessageSquare, Upload, Layers, Text, ChevronUp, ChevronDown, Ticket,
  Mail, ClipboardCheck, FileText, UtensilsCrossed, BookOpen, Hash, Gift,
  CheckCircle, AlignLeft, AlignCenter, AlignRight,
} from 'lucide-react'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'
import { useCart } from '@/components/providers/CartProvider'
import type { FontStyle, SectionStyles } from '@/components/guests/InvitationVisual'
import { assetPath } from '@/lib/asset-path'
import DOMPurify from 'dompurify'
import type { SectionStyle } from '@/components/guests/invitation-templates/_types'
import type { CatalogProduct } from '@/data/digital-cards-products'
import { OverlayEditor } from './OverlayEditor'
import type { OverlayItem } from './_overlay-types'
import { STICKERS } from './_overlay-types'

// ─── Types ────────────────────────────────────────────────────────────────────

type MainTab =
  | 'invitation'
  | 'rsvp-card'
  | 'envelope'
  | 'ticket'
  | 'enclosure'
  | 'menu'
  | 'program'
  | 'table-numbers'
  | 'swag'
  | 'review'

type DigitalCardPanel = 'event' | 'details' | 'dress' | 'rsvp' | 'message' | 'elements' | 'theme'

// ─── Config ───────────────────────────────────────────────────────────────────

const MAIN_TABS: {
  id: MainTab
  label: string
  shortLabel: string
  icon: React.ReactNode
  optional?: boolean
}[] = [
  { id: 'invitation',    label: 'Invitation Card',      shortLabel: 'Invitation',  icon: <Mail size={13} /> },
  { id: 'rsvp-card',     label: 'RSVP Card',            shortLabel: 'RSVP Card',   icon: <ClipboardCheck size={13} /> },
  { id: 'envelope',      label: 'Envelope',             shortLabel: 'Envelope',    icon: <Mail size={13} /> },
  { id: 'ticket',        label: 'Wedding Ticket',       shortLabel: 'Ticket',      icon: <Ticket size={13} /> },
  { id: 'enclosure',     label: 'Enclosure Card',       shortLabel: 'Enclosure',   icon: <FileText size={13} />,         optional: true },
  { id: 'menu',          label: 'Menu',                 shortLabel: 'Menu',        icon: <UtensilsCrossed size={13} /> },
  { id: 'program',       label: 'Program',              shortLabel: 'Program',     icon: <BookOpen size={13} /> },
  { id: 'table-numbers', label: 'Table Numbers & Sign', shortLabel: 'Table Nos.',  icon: <Hash size={13} /> },
  { id: 'swag',          label: 'Wedding Swag',         shortLabel: 'Swag',        icon: <Gift size={13} />,             optional: true },
  { id: 'review',        label: 'Review',               shortLabel: 'Review',      icon: <CheckCircle size={13} /> },
]

const TAB_ORDER = MAIN_TABS.map((t) => t.id)

const DIGITAL_CARD_PANELS: { id: DigitalCardPanel; label: string; icon: React.ReactNode }[] = [
  { id: 'event',    label: 'Event',    icon: <Users size={16} /> },
  { id: 'details',  label: 'Details',  icon: <CalendarDays size={16} /> },
  { id: 'dress',    label: 'Dress',    icon: <Shirt size={16} /> },
  { id: 'rsvp',     label: 'RSVP',     icon: <QrCode size={16} /> },
  { id: 'message',  label: 'Message',  icon: <MessageSquare size={16} /> },
  { id: 'elements', label: 'Elements', icon: <Layers size={16} /> },
  { id: 'theme',    label: 'Theme',    icon: <Palette size={16} /> },
]

const DEFAULT_ticketAccentColors = [
  { name: 'Gold',      value: '#8B7355' },
  { name: 'Champagne', value: '#C4A76B' },
  { name: 'Blush',     value: '#B07070' },
  { name: 'Navy',      value: '#2B3A5C' },
  { name: 'Sage',      value: '#5C6B4D' },
  { name: 'Charcoal',  value: '#3A3A3A' },
]

const FONT_STYLES: { id: FontStyle; label: string; fontFamily: string; fontStyle: string }[] = [
  { id: 'serif',      label: 'Classic Serif',    fontFamily: "Georgia, 'Times New Roman', serif",             fontStyle: 'normal' },
  { id: 'script',     label: 'Serif Italic',     fontFamily: "Georgia, 'Times New Roman', serif",             fontStyle: 'italic' },
  { id: 'playfair',   label: 'Playfair Display', fontFamily: "var(--font-playfair), Georgia, serif",          fontStyle: 'normal' },
  { id: 'cormorant',  label: 'Cormorant Garant', fontFamily: "var(--font-cormorant), Georgia, serif",         fontStyle: 'italic' },
  { id: 'dancing',    label: 'Dancing Script',   fontFamily: "var(--font-dancing), cursive",                  fontStyle: 'normal' },
  { id: 'garamond',   label: 'EB Garamond',      fontFamily: "var(--font-garamond), Georgia, serif",          fontStyle: 'normal' },
  { id: 'montserrat', label: 'Montserrat',       fontFamily: "var(--font-montserrat), system-ui, sans-serif", fontStyle: 'normal' },
  { id: 'modern',     label: 'System Modern',    fontFamily: 'system-ui, -apple-system, sans-serif',          fontStyle: 'normal' },
]

const SWAG_CATALOG: { id: string; label: string; emoji: string; description: string; unitPrice: number }[] = [
  { id: 'shirts',     label: 'Shirts',      emoji: '👕', description: 'Custom-printed wedding tees',        unitPrice: 25000 },
  { id: 'mugs',       label: 'Mugs',        emoji: '☕', description: 'Ceramic keepsake mugs',              unitPrice: 8000  },
  { id: 'napkins',    label: 'Napkins',      emoji: '🧻', description: 'Monogrammed cocktail napkins',       unitPrice: 3000  },
  { id: 'tote-bags',  label: 'Tote bags',   emoji: '🛍️', description: 'Canvas tote with monogram',          unitPrice: 12000 },
  { id: 'koozies',    label: 'Koozies',     emoji: '🥤', description: 'Drink sleeves for the reception',    unitPrice: 5000  },
  { id: 'fans',       label: 'Fans',        emoji: '🪭', description: 'Printed paper fans for outdoor ceremonies', unitPrice: 4000 },
  { id: 'matchbooks', label: 'Matchbooks',  emoji: '🔥', description: 'Custom matchbooks with date',        unitPrice: 2500  },
  { id: 'stickers',   label: 'Stickers',    emoji: '✨', description: 'Die-cut wedding stickers',           unitPrice: 1500  },
]

const PIECE_SPECS: Record<string, { size: string; includes: string[]; backNote?: string }> = {
  'invitation': {
    size: '300 × 400 px',
    includes: ['Couple names', 'Date & time', 'Venue', 'Reception (if set)', 'Dress code', 'RSVP contact', 'Quote / verse'],
    backNote: 'Optional back print available (+TZS 1,500)',
  },
  'rsvp-card': {
    size: '300 × 200 px · A6 landscape',
    includes: ['Couple names', 'Reply-by date', 'RSVP contact', 'Meal selection (optional)', 'Dietary note line'],
    backNote: 'Optional back print available (+TZS 1,500)',
  },
  'envelope': {
    size: '400 × 280 px · C5 landscape',
    includes: ['Guest address area', 'Return address', 'Palette motif / border', 'Liner graphic (back flap)', 'Seal placeholder'],
    backNote: 'Liner design on back flap included',
  },
  'ticket': {
    size: '560 × 200 px · Boarding-pass landscape',
    includes: ['Couple names', 'Date & time', 'Venue & address', 'Stub accent colour', 'Barcode / QR entry code', 'RSVP contact'],
    backNote: 'Optional back print available (+TZS 1,500)',
  },
  'enclosure': {
    size: '300 × 200 px',
    includes: ['Directions / map link', 'Accommodation details', 'Registry information', 'Note from the couple'],
    backNote: 'Optional back print available (+TZS 1,500)',
  },
  'menu': {
    size: '300 × 400 px',
    includes: ['Course list (from your notes)', 'Vegetarian / dietary markers', 'Couple names & date', 'Palette motif'],
    backNote: 'Optional back print available (+TZS 1,500)',
  },
  'program': {
    size: '300 × 400 px',
    includes: ['Order of events', 'Bridal party list with roles', 'Songs / readings', 'Couple names & date'],
    backNote: 'Optional back print available (+TZS 1,500)',
  },
  'table-numbers': {
    size: 'Table card: 150 × 100 px · Sign: A2 (420 × 594 px)',
    includes: ['Table number cards (qty from your count)', 'Welcome sign with couple names & date', 'Seating-chart reference (if requested)'],
    backNote: 'Optional back print available (+TZS 1,500)',
  },
}

const SWAG_PRINT_SPECS: Record<string, { size: string; notes: string }> = {
  shirts:     { size: 'Chest print: 25 × 25 cm',     notes: 'DTG / screen-print · include sizing breakdown in notes' },
  mugs:       { size: 'Wrap: 21 × 9 cm',             notes: 'Sublimation · 5 mm safe zone each side' },
  napkins:    { size: '25 × 25 cm (folded 12.5 × 12.5)', notes: 'Single-colour preferred' },
  'tote-bags':{ size: 'Front panel: 30 × 30 cm',     notes: 'Natural canvas · 2 cm border' },
  koozies:    { size: 'Wrap: 21 × 8 cm',             notes: 'Standard can koozie template' },
  fans:       { size: '20 × 20 cm fan face',          notes: 'Include fold guide if applicable' },
  matchbooks: { size: 'Cover: 5 × 3.5 cm',           notes: 'Cover + inside-cover layout' },
  stickers:   { size: 'Die-cut · supply path',        notes: '0.5 mm bleed · white underbase layer' },
}

const MESSAGE_MAX = 120

// ─── Guest code helpers ───────────────────────────────────────────────────────

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

function generateGuestCode(): string {
  return Array.from({ length: 8 }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join('')
}


// ─── Types ────────────────────────────────────────────────────────────────────

export type CoupleProfile = {
  coupleNames: string | null
  weddingDate: string | null
  venue: string | null
  ceremonyStartsAt: string | null
  dressCode: string | null
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function CustomiseClient({
  product,
  ticketAccentOptions,
  coupleProfile,
}: {
  product: CatalogProduct
  ticketAccentOptions?: { name: string; value: string }[]
  coupleProfile?: CoupleProfile | null
}) {
  const router = useRouter()
  const { addItem } = useCart()
  const [activeTab, setActiveTab] = useState<MainTab>('invitation')
  const [activePanel, setActivePanel] = useState<DigitalCardPanel>('event')
  const [zoom, setZoom] = useState(1)
  const [canvasVisible, setCanvasVisible] = useState(true)

  const tabNavRef = useRef<HTMLDivElement>(null)

  // Couple fields — seeded from user's couple profile when signed in
  const [celebrant, setCelebrant] = useState(coupleProfile?.coupleNames ?? 'Amani & Neema')
  const [familyIntro, setFamilyIntro] = useState('')
  const [dateISO, setDateISO] = useState(coupleProfile?.weddingDate ?? '2026-08-22')
  const [time, setTime] = useState(() => {
    if (coupleProfile?.ceremonyStartsAt) {
      const d = new Date(coupleProfile.ceremonyStartsAt)
      return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`
    }
    return ''
  })
  const [venue, setVenue] = useState(coupleProfile?.venue ?? 'Bagamoyo, Tanzania')

  // Reception details
  const [receptionVenue, setReceptionVenue] = useState('')
  const [receptionTime, setReceptionTime] = useState('')

  // Dress code + palette swatches
  const [dressCode, setDressCode] = useState(coupleProfile?.dressCode ?? '')
  const [palette, setPalette] = useState<string[]>([])

  // RSVP + QR
  const defaultRsvp = (product.treatment === 'save-the-date' || product.treatment === 'save-the-date-photo')
    ? ['+255 795 682 205']
    : ['']
  const [rsvpContacts, setRsvpContacts] = useState<string[]>(defaultRsvp)
  const [qrLabel, setQrLabel] = useState<'SINGLE' | 'DOUBLE'>('SINGLE')

  // Message / quote
  const [message, setMessage] = useState('')
  const [messageAttr, setMessageAttr] = useState('')

  // Font style + per-section typography overrides
  const [fontStyle, setFontStyle] = useState<FontStyle>('serif')
  const [sectionStyles, setSectionStyles] = useState<SectionStyles>({})
  const updateSectionStyle = (key: keyof SectionStyles, patch: Partial<SectionStyle>) =>
    setSectionStyles((prev) => {
      const merged = { ...prev[key], ...patch }
      const hasValues = Object.values(merged).some((v) => v !== undefined)
      if (!hasValues) { const next = { ...prev }; delete next[key]; return next }
      return { ...prev, [key]: merged }
    })

  // Photo upload + overlay opacity
  const [photoSrc, setPhotoSrc] = useState<string | undefined>()
  const [photoOpacity, setPhotoOpacity] = useState(0.85)
  const photoInputRef = useRef<HTMLInputElement>(null)

  // Overlay elements
  const [overlayItems, setOverlayItems] = useState<OverlayItem[]>([])
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null)
  const cardRef = useRef<HTMLDivElement>(null)
  const elemImageInputRef = useRef<HTMLInputElement>(null)

  // Product palette selection
  const [paletteIndex, setPaletteIndex] = useState(0)

  // Fetch design SVG client-side so basePath and Supabase storage URLs are
  // resolved correctly in the browser.
  // When no couple profile is present we also extract the SVG's existing text
  // to pre-populate the form fields with the template's placeholder values.
  const [designSvg, setDesignSvg] = useState<string | null>(null)
  useEffect(() => {
    if (!product.imageUrl) return
    fetch(assetPath(product.imageUrl))
      .then((r) => r.text())
      .then((text) => {
        const t = text.trimStart()
        if (!t.startsWith('<svg') && !t.startsWith('<?xml')) return
        const sanitized = DOMPurify.sanitize(t, { USE_PROFILES: { svg: true, svgFilters: true } })
        setDesignSvg(sanitized)

        // Extract text from named layers to seed form fields.
        // Profile values take precedence field-by-field — SVG fills in what the profile lacks.
        const parser = new DOMParser()
        const doc = parser.parseFromString(sanitized, 'image/svg+xml')

        const extractText = (selector: string) =>
          doc.querySelector(selector)?.querySelector('text')?.textContent?.trim() ?? ''

        const svgDressCode = extractText('#Dress_code')

        const svgNames  = extractText('#Names')
        const svgDate   = extractText('#Date')
        const svgTime   = extractText('#Time')
        const svgVenue  = extractText('#Venue')
        const svgIntro  = extractText('#Intro')
        const svgRsvp   = extractText('#Rsvp')

        // Apply: profile wins where it has a value, SVG fills the rest.
        if (!coupleProfile?.coupleNames    && svgNames) setCelebrant(svgNames)
        if (!coupleProfile?.ceremonyStartsAt && svgTime)  setTime(svgTime)
        if (!coupleProfile?.venue          && svgVenue) setVenue(svgVenue)
        if (!coupleProfile?.dressCode      && svgDressCode) setDressCode(svgDressCode)
        if (svgIntro) setFamilyIntro(svgIntro)
        if (svgRsvp) setRsvpContacts((prev) => prev.every((c) => !c) ? [svgRsvp] : prev)

        if (!coupleProfile?.weddingDate && svgDate) {
          // SVG dates may be formatted as DD · MM · YYYY — convert back to YYYY-MM-DD
          const parts = svgDate.split(/[\s·\/\-]+/).filter(Boolean)
          if (parts.length === 3) {
            const [d, m, y] = parts
            const iso = `${y}-${m!.padStart(2, '0')}-${d!.padStart(2, '0')}`
            if (!Number.isNaN(Date.parse(iso))) setDateISO(iso)
          }
        }
      })
      .catch(() => null)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [product.imageUrl])

  // Inject user-edited field values into the SVG's named layers so the canvas
  // reflects live edits. Each named group (#Names, #Date, etc.) gets its
  // <text> element's content replaced with the current state value.
  const renderedSvg = useMemo(() => {
    if (!designSvg || typeof document === 'undefined') return designSvg

    const parser = new DOMParser()
    const doc = parser.parseFromString(designSvg, 'image/svg+xml')

    const patchText = (selector: string, value: string) => {
      if (!value) return
      const group = doc.querySelector(selector)
      if (!group) return
      const textEl = group.tagName.toLowerCase() === 'text' ? group : group.querySelector('text')
      if (textEl) textEl.textContent = value
    }

    // Names — when the template uses separate tspans for each partner name with
    // a styled & in between, only update the name tspans.
    // The & tspan in Illustrator SVGs often has fill:none from a shared shape
    // class (e.g. .st1), making it invisible in the browser. Force fill:inherit
    // so it reads the fill from the parent <text> element instead.
    const namesGroup = doc.querySelector('#Names')
    if (namesGroup && celebrant) {
      const textEl = namesGroup.querySelector('text')
      if (textEl) {
        const tspans = Array.from(textEl.querySelectorAll('tspan'))
        const parts = celebrant.split(/\s*&\s*/)
        if (tspans.length >= 3 && parts.length === 2) {
          tspans[0]!.textContent = parts[0]!.trim()
          // Illustrator shape classes (e.g. .st1) set fill:none which hides text.
          // Inline fill="inherit" overrides that so the & adopts the text colour.
          tspans[1]!.setAttribute('fill', 'inherit')
          tspans[2]!.textContent = parts[1]!.trim()
        } else if (tspans.length === 1) {
          tspans[0]!.textContent = celebrant
        } else {
          textEl.textContent = celebrant
        }
      }
    }

    const formattedDate = dateISO ? dateISO.split('-').reverse().join(' · ') : ''
    patchText('#Date text', formattedDate)
    patchText('#Time text', time)
    patchText('#Venue text', venue)
    patchText('#Intro text', familyIntro)
    patchText('#Dress_code text', dressCode)

    const rsvpVal = rsvpContacts.filter(Boolean).join(' · ')
    patchText('#Rsvp text', rsvpVal)

    // Apply per-section style overrides to the SVG text elements.
    const LETTER_SPACING_MAP: Record<string, string> = {
      tight: '-0.04em', normal: '0', wide: '0.1em', wider: '0.2em',
    }
    const SECTION_SELECTORS: Partial<Record<keyof SectionStyles, string[]>> = {
      names:       ['#Names text'],
      familyIntro: ['#Intro text'],
      date:        ['#Date text'],
      time:        ['#Time text'],
      venue:       ['#Venue text'],
      dressCode:   ['#Dress_code text'],
      rsvpContact: ['#Rsvp text'],
      message:     ['#Message text'],
      messageAttr: ['#MessageAttr text'],
    }
    for (const [key, selectors] of Object.entries(SECTION_SELECTORS) as [keyof SectionStyles, string[]][]) {
      const style = sectionStyles[key]
      if (!style) continue
      for (const sel of selectors) {
        const textEl = doc.querySelector(sel)
        if (!textEl) continue
        if (style.italic !== undefined)
          textEl.setAttribute('font-style', style.italic ? 'italic' : 'normal')
        if (style.fontWeight !== undefined)
          textEl.setAttribute('font-weight', style.fontWeight)
        if (style.letterSpacing !== undefined)
          textEl.setAttribute('letter-spacing', LETTER_SPACING_MAP[style.letterSpacing] ?? '0')
        if (style.color)
          textEl.setAttribute('fill', style.color)
        if (style.opacity !== undefined)
          textEl.setAttribute('opacity', String(style.opacity))
        if (style.uppercase && textEl.textContent)
          textEl.textContent = textEl.textContent.toUpperCase()
      }
    }

    // Serialize without a second DOMPurify pass — the SVG was already sanitized
    // on fetch. Re-sanitizing mangled &amp; entities in text nodes.
    const serializer = new XMLSerializer()
    return serializer.serializeToString(doc.documentElement)
  }, [designSvg, celebrant, dateISO, time, venue, familyIntro, dressCode, rsvpContacts, sectionStyles])

  // Wedding ticket customisation
  const ticketAccentColors = ticketAccentOptions ?? DEFAULT_ticketAccentColors
  const [ticketType, setTicketType] = useState<'qr' | 'barcode'>(product.treatment === 'ticket-barcode' ? 'barcode' : 'qr')
  const [ticketAccentColor, setTicketAccentColor] = useState(() => ticketAccentColors[0]?.value ?? '#8B7355')
  const [ticketAddress, setTicketAddress] = useState(venue)
  const ticketAddressEdited = useRef(false)
  const [ticketStubLabel, setTicketStubLabel] = useState('BOARDING PASS TO OUR WEDDING')
  const [sampleGuestCode, setSampleGuestCode] = useState(() => generateGuestCode())

  // Per-tab notes for the design team
  const [rsvpCardNotes, setRsvpCardNotes] = useState('')
  const [envelopeNotes, setEnvelopeNotes] = useState('')
  const [enclosureNotes, setEnclosureNotes] = useState('')
  const [menuNotes, setMenuNotes] = useState('')
  const [programNotes, setProgramNotes] = useState('')
  const [tableNumbersNotes, setTableNumbersNotes] = useState('')
  // swagSelections: item id → quantity (absent or 0 = not selected)
  const [swagSelections, setSwagSelections] = useState<Record<string, number>>({})
  const [swagNotes, setSwagNotes] = useState('')

  const toggleSwag = (id: string) =>
    setSwagSelections((prev) => {
      if (prev[id]) { const next = { ...prev }; delete next[id]; return next }
      return { ...prev, [id]: 1 }
    })
  const setSwagQty = (id: string, q: number) =>
    setSwagSelections((prev) => q < 1 ? prev : { ...prev, [id]: q })

  const selectedSwagItems = SWAG_CATALOG.filter((s) => (swagSelections[s.id] ?? 0) > 0)
  const swagTotal = selectedSwagItems.reduce((sum, s) => sum + s.unitPrice * (swagSelections[s.id] ?? 0), 0)

  // Back-print option per card tab — 'same' = print same design on back (+TZS 1,500), 'blank' = leave blank
  type BackPrint = 'same' | 'blank'
  const BACK_PRINT_TABS: MainTab[] = ['invitation', 'rsvp-card', 'envelope', 'ticket', 'enclosure', 'menu', 'program', 'table-numbers']
  const [backPrint, setBackPrint] = useState<Partial<Record<MainTab, BackPrint>>>({})
  const setBackPrintFor = (tab: MainTab, v: BackPrint) => setBackPrint((prev) => ({ ...prev, [tab]: v }))

  // Quantity per card tab
  const [qty, setQty] = useState<Partial<Record<MainTab, number>>>({})
  const setQtyFor = (tab: MainTab, v: number) => setQty((prev) => ({ ...prev, [tab]: Math.max(1, v) }))

  // Keep ticketAddress in sync with ceremony venue unless the user has manually overridden it
  useEffect(() => {
    if (!ticketAddressEdited.current) setTicketAddress(venue)
  }, [venue])

  // Front / back side toggle — resets to front when tab changes
  const [cardSide, setCardSide] = useState<'front' | 'back'>('front')
  useEffect(() => { setCardSide('front') }, [activeTab])

  // Sidebar overlay drawers
  const [drawer, setDrawer] = useState<'contact' | 'tips' | null>(null)

  // Change-design confirmation popover
  const [confirmLeave, setConfirmLeave] = useState(false)
  const confirmRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!confirmLeave) return
    const handler = (e: MouseEvent) => {
      if (confirmRef.current && !confirmRef.current.contains(e.target as Node)) {
        setConfirmLeave(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [confirmLeave])

  // Scroll active tab into view
  useEffect(() => {
    const nav = tabNavRef.current
    if (!nav) return
    const btn = nav.querySelector(`[data-tab="${activeTab}"]`) as HTMLElement | null
    btn?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' })
  }, [activeTab])

  const selectedPalette = product.palettes[paletteIndex] ?? product.palettes[0] ?? {
    background: '#FFFFFF', surface: '#FFFFFF', accent: '#1A1A1A',
    textPrimary: '#1A1A1A', textSecondary: '#6B6B6B', muted: '#8D8D8D',
  }

  const couple = useMemo(
    () => ({
      names: celebrant.replace(/\s*&\s*/g, '  &  '),
      date: dateISO ? dateISO.split('-').reverse().join(' · ') : '',
      venue,
      time: time || undefined,
    }),
    [celebrant, dateISO, venue, time],
  )

  const dateDisplay = couple.date ? couple.date.replace(/ · /g, ' / ') : '—'

  const handleSave = () =>
    toast.success('Draft saved', { description: 'Jump back to this design any time.' })

  const handleContinue = () => {
    const summaryParts = [celebrant, dateISO && dateDisplay, venue].filter(Boolean)
    const invitationQty = qty['invitation'] ?? 50
    const orderTotal = product.digitalUnitPrice * invitationQty
    addItem({
      id: product.id,
      name: product.name,
      designer: product.designer,
      treatment: product.treatment,
      summary: summaryParts.join(' · '),
      total: orderTotal,
    })
    toast.success('Added to cart', {
      description: `${product.name} — TZS ${orderTotal.toLocaleString('en-US')}`,
    })
    router.push('/digital-cards/cart')
  }

  const goNextTab = () => {
    const idx = TAB_ORDER.indexOf(activeTab)
    if (idx < TAB_ORDER.length - 1) {
      setActiveTab(TAB_ORDER[idx + 1]!)
    } else {
      handleContinue()
    }
  }

  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => setPhotoSrc(ev.target?.result as string)
    reader.readAsDataURL(file)
  }

  const setPaletteAt = (i: number, v: string) => setPalette((p) => p.map((c, idx) => (idx === i ? v : c)))
  const setContactAt = (i: number, v: string) => setRsvpContacts((c) => c.map((x, idx) => (idx === i ? v : x)))

  const addTextItem = () => {
    setOverlayItems((prev) => [...prev, {
      id: crypto.randomUUID(), type: 'text', x: 40, y: 40,
      content: 'Your text', fontSize: 14, color: '#1A1A1A',
      rotation: 0, opacity: 1, zIndex: prev.length,
    }])
  }

  const addStickerItem = (char: string) => {
    setOverlayItems((prev) => [...prev, {
      id: crypto.randomUUID(), type: 'sticker', x: 45, y: 45,
      content: char, fontSize: 24, color: '#1A1A1A',
      rotation: 0, opacity: 1, zIndex: prev.length,
    }])
  }

  const addImageItem = (dataUrl: string) => {
    setOverlayItems((prev) => [...prev, {
      id: crypto.randomUUID(), type: 'image', x: 30, y: 30,
      content: dataUrl, fontSize: 14, color: '',
      rotation: 0, opacity: 1, zIndex: prev.length,
    }])
  }

  const updateOverlayItem = (id: string, patch: Partial<OverlayItem>) =>
    setOverlayItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...patch } : it)))

  const deleteOverlayItem = (id: string) => {
    setOverlayItems((prev) => prev.filter((it) => it.id !== id))
    if (selectedItemId === id) setSelectedItemId(null)
  }

  const duplicateOverlayItem = (id: string) => {
    const item = overlayItems.find((it) => it.id === id)
    if (!item) return
    setOverlayItems((prev) => [...prev, {
      ...item, id: crypto.randomUUID(),
      x: Math.min(90, item.x + 5), y: Math.min(90, item.y + 5),
      zIndex: prev.length,
    }])
  }

  const handleElemImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => addImageItem(ev.target?.result as string)
    reader.readAsDataURL(file)
    e.target.value = ''
  }

  const moveOverlayItem = (id: string, dir: 'up' | 'down') => {
    setOverlayItems((prev) => {
      const idx = prev.findIndex((it) => it.id === id)
      if (idx < 0) return prev
      const next = [...prev]
      const swapIdx = dir === 'up' ? idx - 1 : idx + 1
      if (swapIdx < 0 || swapIdx >= next.length) return prev
      ;[next[idx], next[swapIdx]] = [next[swapIdx]!, next[idx]!]
      return next
    })
  }

  const panelDone: Record<DigitalCardPanel, boolean> = {
    event:    celebrant.trim().length > 0,
    details:  Boolean(dateISO) && venue.trim().length > 0,
    dress:    Boolean(dressCode.trim()) || palette.length > 0,
    rsvp:     rsvpContacts.filter(Boolean).length > 0,
    message:  message.trim().length > 0,
    elements: overlayItems.length > 0,
    theme:    true,
  }

  const goEdit = (panel: DigitalCardPanel) => {
    setActiveTab('invitation')
    setActivePanel(panel)
  }

  const isReview = activeTab === 'review'

  return (
    <div className="flex min-h-screen flex-col bg-[#FAFAF8] text-[#1A1A1A]">

      {/* ─── Header ─── */}
      <header className="sticky top-0 z-20 border-b border-gray-200 bg-white">

        {/* Row 1: product name + actions */}
        <div className="flex items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div className="flex min-w-0 max-w-[40%] items-center">
            <p className="truncate text-[13px] font-bold text-gray-900">{product.name}</p>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <button data-opus-button="control"
              type="button"
              onClick={() => setCanvasVisible((v) => !v)}
              aria-label={canvasVisible ? 'Hide preview' : 'Show preview'}
              className="grid h-8 w-8 place-items-center rounded-full text-gray-600 transition hover:bg-gray-100 hover:text-gray-900 lg:hidden"
            >
              {canvasVisible ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>

            <div className="relative" ref={confirmRef}>
              <button data-opus-button="control"
                type="button"
                onClick={() => setConfirmLeave((v) => !v)}
                aria-expanded={confirmLeave}
                aria-haspopup="dialog"
                className={cn(
                  'flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12px] font-bold transition',
                  confirmLeave
                    ? 'border-[#1A1A1A] bg-[#1A1A1A] text-white'
                    : 'border-gray-300 bg-white text-gray-700 hover:border-gray-500 hover:text-gray-900',
                )}
              >
                <LayoutGrid size={13} />
                <span className="hidden sm:inline">Change design</span>
              </button>

              {confirmLeave && (
                <div
                  role="dialog"
                  aria-label="Leave customiser?"
                  className="absolute right-0 top-full z-30 mt-2 w-64 rounded-xl border border-gray-200 bg-white p-4 shadow-[0_8px_32px_-8px_rgba(0,0,0,0.18)]"
                >
                  <p className="text-[13px] font-semibold text-gray-900">Leave this design?</p>
                  <p className="mt-1 text-[12px] leading-relaxed text-gray-500">
                    Your changes won&apos;t be saved. Browse the catalog to pick a different design.
                  </p>
                  <div className="mt-3 flex gap-2">
                    <Link
                      href="/digital-cards/catalog"
                      className="flex-1 rounded-lg bg-[#1A1A1A] px-3 py-2 text-center text-[12px] font-bold text-white transition hover:bg-black"
                    >
                      Browse catalog
                    </Link>
                    <button data-opus-button="control"
                      type="button"
                      onClick={() => setConfirmLeave(false)}
                      className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-[12px] font-bold text-gray-700 transition hover:bg-gray-50"
                    >
                      Stay here
                    </button>
                  </div>
                </div>
              )}
            </div>

            <button data-opus-button="control"
              type="button"
              onClick={handleSave}
              className="rounded-full border border-gray-300 px-4 py-1.5 text-[12px] font-bold text-gray-800 transition hover:bg-gray-50 sm:px-5"
            >
              Save
            </button>
            <button data-opus-button="primary" data-opus-button-size="small"
              type="button"
              onClick={isReview ? handleContinue : goNextTab}
              className="rounded-full bg-[#1A1A1A] px-4 py-1.5 text-[12px] font-bold text-white transition hover:bg-black sm:px-5"
            >
              {isReview ? 'Continue to send' : 'Next'}
            </button>
            <Link
              href={`/digital-cards/p/${product.id}`}
              aria-label="Close customiser"
              className="ml-0.5 grid h-8 w-8 place-items-center rounded-full text-gray-600 transition hover:bg-gray-100 hover:text-gray-900"
            >
              <X size={18} />
            </Link>
          </div>
        </div>

        {/* Row 2: scrollable tab bar */}
        <div
          ref={tabNavRef}
          className="flex overflow-x-auto border-t border-gray-100 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          role="tablist"
          aria-label="Stationery items"
        >
          {MAIN_TABS.map((tab) => {
            const active = activeTab === tab.id
            return (
              <button data-opus-button="control"
                key={tab.id}
                data-tab={tab.id}
                role="tab"
                type="button"
                aria-selected={active}
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  'relative flex shrink-0 items-center gap-1.5 whitespace-nowrap px-4 py-2.5 text-[11px] font-bold uppercase tracking-[0.1em] transition',
                  active
                    ? 'text-[#1A1A1A] after:absolute after:bottom-0 after:left-0 after:right-0 after:h-[2px] after:bg-[#1A1A1A]'
                    : 'text-gray-400 hover:text-gray-700',
                )}
              >
                {tab.icon}
                {tab.shortLabel}
                {tab.optional && (
                  <span className={cn(
                    'rounded-sm px-1 py-px text-[9px] font-bold uppercase tracking-[0.06em]',
                    active ? 'bg-gray-200 text-gray-600' : 'bg-gray-100 text-gray-400',
                  )}>
                    opt
                  </span>
                )}
              </button>
            )
          })}
        </div>
      </header>

      {/* ─── Editor body ─── */}
      <div className="grid flex-1 grid-cols-1 lg:grid-cols-[340px_1fr]">

        {/* ─── Left sidebar ─── */}
        <aside className="order-2 flex h-[55vh] flex-col overflow-hidden border-t border-gray-200 bg-white lg:order-1 lg:h-[calc(100vh-101px)] lg:border-r lg:border-t-0">

          {/* Sidebar header */}
          <div className="shrink-0 border-b border-gray-200 px-5 pt-4 pb-4">
            <div className="flex items-center justify-between">
              <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-gray-500">
                {MAIN_TABS.find((t) => t.id === activeTab)?.label}
              </p>

              {!isReview && (
                <div className="flex items-center rounded-full border border-gray-200 bg-gray-100 p-0.5">
                  {(['front', 'back'] as const).map((side) => (
                    <button data-opus-button="control"
                      key={side}
                      type="button"
                      onClick={() => setCardSide(side)}
                      aria-pressed={cardSide === side}
                      className={cn(
                        'rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-[0.08em] transition',
                        cardSide === side
                          ? 'bg-white text-gray-900 shadow-sm'
                          : 'text-gray-400 hover:text-gray-700',
                      )}
                    >
                      {side}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {activeTab === 'invitation' && (
              <div className="mt-3 grid grid-cols-4 gap-1">
                {DIGITAL_CARD_PANELS.map((p) => {
                  const active = activePanel === p.id
                  const done = panelDone[p.id]
                  return (
                    <button data-opus-button="control"
                      key={p.id}
                      type="button"
                      onClick={() => setActivePanel(p.id)}
                      aria-pressed={active}
                      className={cn(
                        'relative flex flex-col items-center gap-1 rounded-md py-2 text-[10px] font-bold uppercase tracking-[0.08em] transition',
                        active ? 'bg-[#1A1A1A] text-white' : 'text-gray-500 hover:bg-gray-100 hover:text-gray-800',
                      )}
                    >
                      {p.icon}
                      {p.label}
                      {done && !active && (
                        <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-[#5C6B4D]" aria-hidden="true" />
                      )}
                    </button>
                  )
                })}
              </div>
            )}
          </div>

          <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-5 sm:p-6">

            {/* ── REVIEW ── */}
            {isReview && (
              <>
                <ReviewRow label="Celebrant" value={celebrant} onEdit={() => goEdit('event')} />
                <ReviewRow label="Date & time" value={`${dateDisplay}${time ? ` · ${time}` : ''}`} onEdit={() => goEdit('details')} />
                <ReviewRow label="Venue" value={venue} onEdit={() => goEdit('details')} />
                {(receptionVenue || receptionTime) && (
                  <ReviewRow
                    label="Reception"
                    value={[receptionVenue, receptionTime].filter(Boolean).join(' · ') || '—'}
                    onEdit={() => goEdit('details')}
                  />
                )}
                <ReviewRow label="Dress code" value={dressCode || '—'} onEdit={() => goEdit('dress')}>
                  {palette.length > 0 && (
                    <span className="flex items-center gap-1">
                      {palette.map((c, i) => (
                        <span key={i} className="h-3 w-3 rounded-full ring-1 ring-black/10" style={{ backgroundColor: c }} />
                      ))}
                    </span>
                  )}
                </ReviewRow>
                <ReviewRow label="RSVP" value={rsvpContacts.filter(Boolean).join(', ') || '—'} onEdit={() => goEdit('rsvp')} />
                <ReviewRow label="QR entry" value={qrLabel} onEdit={() => goEdit('rsvp')} />
                {message && (
                  <>
                    <ReviewRow label="Quote" value={message} onEdit={() => goEdit('message')} />
                    {messageAttr && <ReviewRow label="Attribution" value={messageAttr} onEdit={() => goEdit('message')} />}
                  </>
                )}
                {overlayItems.length > 0 && (
                  <ReviewRow
                    label="Elements"
                    value={`${overlayItems.length} overlay item${overlayItems.length > 1 ? 's' : ''}`}
                    onEdit={() => goEdit('elements')}
                  />
                )}
                <ReviewRow label="Font" value={FONT_STYLES.find((f) => f.id === fontStyle)?.label ?? fontStyle} onEdit={() => goEdit('theme')} />
                <ReviewRow label="Palette" value={selectedPalette.name ?? '—'} onEdit={() => goEdit('theme')} />
                <ReviewRow
                  label="Ticket colour"
                  value={ticketAccentColors.find((c) => c.value === ticketAccentColor)?.name ?? 'Custom'}
                  onEdit={() => setActiveTab('ticket')}
                >
                  <span className="h-3 w-3 rounded-full ring-1 ring-black/10" style={{ backgroundColor: ticketAccentColor }} />
                </ReviewRow>
                {ticketAddress && <ReviewRow label="Ticket address" value={ticketAddress} onEdit={() => setActiveTab('ticket')} />}
                {photoSrc && (
                  <div className="flex items-center justify-between border-b border-gray-100 pb-3">
                    <span className="text-[12px] font-bold uppercase tracking-[0.12em] text-gray-500">Photo</span>
                    <div className="flex items-center gap-2">
                      <img src={photoSrc} alt="Uploaded photo" className="h-8 w-8 rounded object-cover ring-1 ring-black/10" />
                      <button data-opus-button="control" type="button" onClick={() => goEdit('theme')} aria-label="Edit photo" className="text-gray-400 hover:text-gray-900">
                        <Pencil size={12} />
                      </button>
                    </div>
                  </div>
                )}
                {rsvpCardNotes && <ReviewRow label="RSVP card notes" value={rsvpCardNotes} onEdit={() => setActiveTab('rsvp-card')} />}
                {envelopeNotes && <ReviewRow label="Envelope notes" value={envelopeNotes} onEdit={() => setActiveTab('envelope')} />}
                {enclosureNotes && <ReviewRow label="Enclosure notes" value={enclosureNotes} onEdit={() => setActiveTab('enclosure')} />}
                {menuNotes && <ReviewRow label="Menu notes" value={menuNotes} onEdit={() => setActiveTab('menu')} />}
                {programNotes && <ReviewRow label="Program notes" value={programNotes} onEdit={() => setActiveTab('program')} />}
                {tableNumbersNotes && <ReviewRow label="Table numbers notes" value={tableNumbersNotes} onEdit={() => setActiveTab('table-numbers')} />}
                {selectedSwagItems.length > 0 && (
                  <ReviewRow
                    label="Wedding swag"
                    value={`${selectedSwagItems.map((s) => `${s.label} ×${swagSelections[s.id]}`).join(', ')} · TZS ${swagTotal.toLocaleString('en-US')}`}
                    onEdit={() => setActiveTab('swag')}
                  />
                )}
                {(BACK_PRINT_TABS).map((tab) => {
                  const q = qty[tab]
                  const bp = backPrint[tab]
                  if (!q && !bp) return null
                  const tabLabel = MAIN_TABS.find((t) => t.id === tab)?.label ?? tab
                  return (
                    <ReviewRow
                      key={tab}
                      label={tabLabel}
                      value={[q ? `Qty: ${q}` : null, bp === 'same' ? 'Print on back +TZS 1,500' : bp === 'blank' ? 'Blank back' : null].filter(Boolean).join(' · ')}
                      onEdit={() => setActiveTab(tab)}
                    />
                  )
                })}
                <p className="rounded-md border border-[#E8D9A7]/60 bg-[#F5EFE3]/60 px-3.5 py-3 text-[12px] leading-snug text-gray-700">
                  Looks good? Continue to send your invite by WhatsApp or SMS, with a live RSVP page for every guest.
                </p>
              </>
            )}

            {/* ── INVITATION CARD ── */}
            {activeTab === 'invitation' && (
              <>
                {activePanel === 'event' && (
                  <>
                    <Field label="Celebrant names" hint="The large script line on the card">
                      <Input value={celebrant} onChange={setCelebrant} placeholder="e.g. Amani & Neema" />
                      <TextStyleBar sectionKey="names" sectionStyles={sectionStyles} onUpdate={updateSectionStyle} />
                    </Field>
                    <Field label="Family introduction" hint={'Swahili lead — "Familia ya …"'}>
                      <textarea
                        value={familyIntro}
                        onChange={(e) => setFamilyIntro(e.target.value)}
                        rows={3}
                        placeholder="Familia ya … pamoja na Familia ya …"
                        className="w-full resize-none rounded-md border border-gray-300 px-3.5 py-2.5 text-[14px] leading-relaxed focus:border-[#1A1A1A] focus:outline-none focus:ring-1 focus:ring-[#1A1A1A]"
                      />
                      <TextStyleBar sectionKey="familyIntro" sectionStyles={sectionStyles} onUpdate={updateSectionStyle} />
                    </Field>
                  </>
                )}

                {activePanel === 'details' && (
                  <>
                    <Field label="Wedding date">
                      <input
                        type="date"
                        value={dateISO}
                        onChange={(e) => setDateISO(e.target.value)}
                        className="h-11 w-full rounded-md border border-gray-300 px-3.5 text-[14px] focus:border-[#1A1A1A] focus:outline-none focus:ring-1 focus:ring-[#1A1A1A]"
                      />
                      <TextStyleBar sectionKey="date" sectionStyles={sectionStyles} onUpdate={updateSectionStyle} />
                    </Field>
                    <Field label="Ceremony time">
                      <Input value={time} onChange={setTime} placeholder="e.g. 4:00 PM" />
                      <TextStyleBar sectionKey="time" sectionStyles={sectionStyles} onUpdate={updateSectionStyle} />
                    </Field>
                    <Field label="Ceremony venue">
                      <Input value={venue} onChange={setVenue} placeholder="e.g. Bagamoyo, Tanzania" />
                      <TextStyleBar sectionKey="venue" sectionStyles={sectionStyles} onUpdate={updateSectionStyle} />
                    </Field>
                    <div className="border-t border-gray-100 pt-4">
                      <p className="mb-3 text-[11px] font-bold uppercase tracking-[0.16em] text-gray-400">Reception (optional)</p>
                      <div className="space-y-4">
                        <Field label="Reception venue" hint="If different from ceremony">
                          <Input value={receptionVenue} onChange={setReceptionVenue} placeholder="e.g. Grand Ballroom, Dar es Salaam" />
                        </Field>
                        <Field label="Reception time">
                          <Input value={receptionTime} onChange={setReceptionTime} placeholder="e.g. 7:00 PM" />
                        </Field>
                      </div>
                      <TextStyleBar sectionKey="reception" sectionStyles={sectionStyles} onUpdate={updateSectionStyle} />
                    </div>
                  </>
                )}

                {activePanel === 'dress' && (
                  <>
                    <Field label="Dress code" hint={'Shown as "Mavazi · …"'}>
                      <Input value={dressCode} onChange={setDressCode} placeholder="e.g. Cocktail" />
                      <TextStyleBar sectionKey="dressCode" sectionStyles={sectionStyles} onUpdate={updateSectionStyle} />
                    </Field>
                    <Field label="Colour palette" hint="The dress-code colours shown as dots">
                      <div className="flex items-center gap-3">
                        {palette.map((c, i) => (
                          <div key={i} className="flex flex-col items-center gap-1">
                            <input
                              type="color"
                              value={c}
                              onChange={(e) => setPaletteAt(i, e.target.value)}
                              aria-label={`Palette colour ${i + 1}`}
                              className="h-10 w-12 cursor-pointer rounded-md border border-gray-300 bg-white p-1"
                            />
                            {palette.length > 1 && (
                              <button data-opus-button="control"
                                type="button"
                                onClick={() => setPalette((p) => p.filter((_, idx) => idx !== i))}
                                className="text-gray-500 hover:text-gray-900"
                                aria-label={`Remove colour ${i + 1}`}
                              >
                                <X size={13} />
                              </button>
                            )}
                          </div>
                        ))}
                        {palette.length < 4 && (
                          <button data-opus-button="control"
                            type="button"
                            onClick={() => setPalette((p) => [...p, '#C8A35C'])}
                            className="grid h-10 w-10 place-items-center rounded-md border border-dashed border-gray-300 text-gray-500 hover:border-gray-500 hover:text-gray-900"
                            aria-label="Add palette colour"
                          >
                            <Plus size={16} />
                          </button>
                        )}
                      </div>
                    </Field>
                  </>
                )}

                {activePanel === 'rsvp' && (
                  <>
                    <Field label="RSVP contacts" hint="Phone numbers guests can reach">
                      <div className="space-y-2">
                        {rsvpContacts.map((c, i) => (
                          <div key={i} className="flex items-center gap-2">
                            <input
                              type="tel"
                              value={c}
                              onChange={(e) => setContactAt(i, e.target.value)}
                              placeholder="+255 7XX XXX XXX"
                              className="h-11 w-full rounded-md border border-gray-300 px-3.5 text-[14px] tabular-nums focus:border-[#1A1A1A] focus:outline-none focus:ring-1 focus:ring-[#1A1A1A]"
                            />
                            <button data-opus-button="control"
                              type="button"
                              onClick={() => setRsvpContacts((list) => list.filter((_, idx) => idx !== i))}
                              disabled={rsvpContacts.length <= 1}
                              className="shrink-0 text-gray-400 hover:text-gray-900 disabled:opacity-30 disabled:cursor-not-allowed"
                              aria-label={`Remove contact ${i + 1}`}
                            >
                              <X size={16} />
                            </button>
                          </div>
                        ))}
                        {rsvpContacts.length < 3 && (
                          <button data-opus-button="control"
                            type="button"
                            onClick={() => setRsvpContacts((list) => [...list, ''])}
                            className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-gray-700 hover:text-gray-900"
                          >
                            <Plus size={14} /> Add contact
                          </button>
                        )}
                      </div>
                      <TextStyleBar sectionKey="rsvpContact" sectionStyles={sectionStyles} onUpdate={updateSectionStyle} />
                    </Field>
                    <Field label="QR entry label" hint="Tagged on the QR code at the door">
                      <div className="flex gap-2">
                        {(['SINGLE', 'DOUBLE'] as const).map((opt) => (
                          <button data-opus-button="control"
                            key={opt}
                            type="button"
                            onClick={() => setQrLabel(opt)}
                            aria-pressed={qrLabel === opt}
                            className={cn(
                              'flex-1 rounded-md border px-3 py-2.5 text-[12px] font-bold uppercase tracking-[0.12em] transition',
                              qrLabel === opt
                                ? 'border-[#1A1A1A] bg-[#1A1A1A] text-white'
                                : 'border-gray-300 bg-white text-gray-700 hover:border-gray-500',
                            )}
                          >
                            {opt}
                          </button>
                        ))}
                      </div>
                    </Field>
                  </>
                )}

                {activePanel === 'message' && (
                  <>
                    <Field label="Quote or verse" hint="Appears on the card — keep it short">
                      <div className="relative">
                        <textarea
                          value={message}
                          onChange={(e) => setMessage(e.target.value.slice(0, MESSAGE_MAX))}
                          rows={4}
                          placeholder="e.g. Love is patient, love is kind…"
                          className="w-full resize-none rounded-md border border-gray-300 px-3.5 py-2.5 text-[14px] leading-relaxed focus:border-[#1A1A1A] focus:outline-none focus:ring-1 focus:ring-[#1A1A1A]"
                        />
                        <span className={cn(
                          'absolute bottom-2.5 right-3 text-[11px] tabular-nums',
                          message.length >= MESSAGE_MAX ? 'text-red-500' : 'text-gray-400',
                        )}>
                          {message.length}/{MESSAGE_MAX}
                        </span>
                      </div>
                      <TextStyleBar sectionKey="message" sectionStyles={sectionStyles} onUpdate={updateSectionStyle} />
                    </Field>
                    <Field label="Attribution" hint="e.g. — 1 Corinthians 13:4">
                      <Input value={messageAttr} onChange={setMessageAttr} placeholder="— Source or author" />
                      <TextStyleBar sectionKey="messageAttr" sectionStyles={sectionStyles} onUpdate={updateSectionStyle} />
                    </Field>
                  </>
                )}

                {activePanel === 'elements' && (
                  <>
                    <div className="flex gap-2">
                      <button data-opus-button="control"
                        type="button"
                        onClick={addTextItem}
                        className="flex flex-1 items-center justify-center gap-1.5 rounded-md border border-gray-300 px-3 py-2.5 text-[12px] font-semibold text-gray-700 transition hover:border-gray-500 hover:text-gray-900"
                      >
                        <Text size={14} /> Add text
                      </button>
                      <button data-opus-button="control"
                        type="button"
                        onClick={() => elemImageInputRef.current?.click()}
                        className="flex flex-1 items-center justify-center gap-1.5 rounded-md border border-gray-300 px-3 py-2.5 text-[12px] font-semibold text-gray-700 transition hover:border-gray-500 hover:text-gray-900"
                      >
                        <Upload size={14} /> Add image
                      </button>
                      <input
                        ref={elemImageInputRef}
                        type="file"
                        accept="image/*"
                        onChange={handleElemImageChange}
                        className="hidden"
                        aria-label="Upload overlay image"
                      />
                    </div>

                    <div>
                      <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.18em] text-gray-400">Stickers</p>
                      {STICKERS.map((group) => (
                        <div key={group.group} className="mb-3">
                          <p className="mb-1.5 text-[11px] font-semibold text-gray-500">{group.group}</p>
                          <div className="flex flex-wrap gap-1">
                            {group.items.map((char) => (
                              <button data-opus-button="control"
                                key={char}
                                type="button"
                                onClick={() => addStickerItem(char)}
                                aria-label={`Add ${char} sticker`}
                                className="grid h-9 w-9 place-items-center rounded-md border border-gray-200 text-[18px] transition hover:border-gray-400 hover:bg-gray-50"
                              >
                                {char}
                              </button>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>

                    {overlayItems.length > 0 && (
                      <div>
                        <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.18em] text-gray-400">
                          On card ({overlayItems.length})
                        </p>
                        <div className="space-y-1">
                          {overlayItems.map((item, i) => (
                            <div
                              key={item.id}
                              className={cn(
                                'flex items-center gap-2 rounded-md border px-2.5 py-2 text-[12px] transition cursor-pointer',
                                selectedItemId === item.id
                                  ? 'border-[#1A1A1A] bg-gray-50'
                                  : 'border-gray-200 hover:border-gray-400',
                              )}
                              onClick={() => { setSelectedItemId(item.id); setActivePanel('elements') }}
                            >
                              <span className="shrink-0 text-[16px]">
                                {item.type === 'text' ? 'T' : item.type === 'image' ? '🖼' : item.content}
                              </span>
                              <span className="min-w-0 flex-1 truncate text-gray-700">
                                {item.type === 'image' ? 'Image' : item.content}
                              </span>
                              <div className="flex shrink-0 items-center gap-0.5">
                                <button data-opus-button="control"
                                  type="button"
                                  aria-label="Move up"
                                  onClick={(e) => { e.stopPropagation(); moveOverlayItem(item.id, 'up') }}
                                  disabled={i === 0}
                                  className="grid h-6 w-6 place-items-center rounded text-gray-400 hover:bg-gray-100 hover:text-gray-900 disabled:opacity-30"
                                >
                                  <ChevronUp size={12} />
                                </button>
                                <button data-opus-button="control"
                                  type="button"
                                  aria-label="Move down"
                                  onClick={(e) => { e.stopPropagation(); moveOverlayItem(item.id, 'down') }}
                                  disabled={i === overlayItems.length - 1}
                                  className="grid h-6 w-6 place-items-center rounded text-gray-400 hover:bg-gray-100 hover:text-gray-900 disabled:opacity-30"
                                >
                                  <ChevronDown size={12} />
                                </button>
                                <button data-opus-button="control"
                                  type="button"
                                  aria-label="Delete element"
                                  onClick={(e) => { e.stopPropagation(); deleteOverlayItem(item.id) }}
                                  className="grid h-6 w-6 place-items-center rounded text-gray-400 hover:bg-red-50 hover:text-red-500"
                                >
                                  <X size={12} />
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </>
                )}

                {activePanel === 'theme' && (
                  <>
                    {product.treatment === 'save-the-date-photo' && !photoSrc && (
                      <div className="rounded-md border-2 border-dashed border-[#00a79d]/40 bg-[#00a79d]/5 p-4">
                        <p className="mb-2 text-[12px] font-bold text-gray-900">Upload your couple photo</p>
                        <p className="mb-3 text-[11px] leading-relaxed text-gray-500">
                          This design uses your photo as a background with a teal colour overlay — upload to see the full effect.
                        </p>
                        <button data-opus-button="primary" data-opus-button-size="medium"
                          type="button"
                          onClick={() => photoInputRef.current?.click()}
                          className="flex w-full items-center justify-center gap-2 rounded-md bg-[#1A1A1A] px-4 py-2.5 text-[12px] font-bold text-white transition hover:bg-black"
                        >
                          <Upload size={14} /> Upload photo
                        </button>
                      </div>
                    )}

                    <Field label="Colour palette" hint="Pick the palette for this design">
                      <div className="flex flex-wrap gap-3">
                        {product.palettes.map((p, i) => {
                          const active = paletteIndex === i
                          return (
                            <button data-opus-button="control"
                              key={i}
                              type="button"
                              onClick={() => setPaletteIndex(i)}
                              aria-pressed={active}
                              title={p.name}
                              className={cn(
                                'flex flex-col items-center gap-1.5 rounded-md border p-2 text-left transition',
                                active ? 'border-[#1A1A1A] ring-1 ring-[#1A1A1A]' : 'border-gray-300 hover:border-gray-500',
                              )}
                            >
                              <span
                                className="h-10 w-10 rounded-full ring-1 ring-black/10"
                                style={{ backgroundColor: p.accent, border: `3px solid ${p.background}`, outline: `1px solid ${p.textSecondary}` }}
                                aria-hidden="true"
                              />
                              <span className="text-[10px] font-bold text-gray-700">{p.name}</span>
                              {active && <Check size={11} className="text-[#1A1A1A]" aria-hidden="true" />}
                            </button>
                          )
                        })}
                      </div>
                    </Field>

                    <Field label="Font style" hint="Changes the name typography on the card">
                      {(() => {
                        const active = FONT_STYLES.find((f) => f.id === fontStyle) ?? FONT_STYLES[0]!
                        return (
                          <div className="space-y-2">
                            <select
                              value={fontStyle}
                              onChange={(e) => setFontStyle(e.target.value as FontStyle)}
                              className="h-11 w-full rounded-md border border-gray-300 px-3 text-[14px] focus:border-[#1A1A1A] focus:outline-none focus:ring-1 focus:ring-[#1A1A1A]"
                            >
                              {FONT_STYLES.map((f) => (
                                <option key={f.id} value={f.id}>{f.label}</option>
                              ))}
                            </select>
                            <p
                              className="rounded-md border border-gray-100 bg-gray-50 px-3.5 py-2.5 text-[20px] text-gray-800"
                              style={{ fontFamily: active.fontFamily, fontStyle: active.fontStyle }}
                            >
                              {celebrant || 'Amani & Neema'}
                            </p>
                          </div>
                        )
                      })()}
                    </Field>

                    <Field
                      label="Couple photo"
                      hint={product.treatment === 'save-the-date-photo'
                        ? 'Shown behind the teal overlay on this design — upload to see the effect'
                        : 'Used as background on photo designs; our team places it on others'}
                    >
                      <input
                        ref={photoInputRef}
                        type="file"
                        accept="image/*"
                        onChange={handlePhotoChange}
                        className="hidden"
                        aria-label="Upload couple photo"
                      />
                      {photoSrc ? (
                        <div className="flex items-center gap-3">
                          <img src={photoSrc} alt="Uploaded couple photo" className="h-16 w-16 rounded-md object-cover ring-1 ring-black/10" />
                          <div className="flex flex-col gap-1.5">
                            <button data-opus-button="control"
                              type="button"
                              onClick={() => photoInputRef.current?.click()}
                              className="text-[12px] font-semibold text-gray-700 underline-offset-2 hover:underline"
                            >
                              Change photo
                            </button>
                            <button data-opus-button="control"
                              type="button"
                              onClick={() => setPhotoSrc(undefined)}
                              className="text-left text-[12px] text-gray-400 hover:text-gray-700"
                            >
                              Remove
                            </button>
                          </div>
                        </div>
                      ) : (
                        <button data-opus-button="control"
                          type="button"
                          onClick={() => photoInputRef.current?.click()}
                          className="flex w-full items-center justify-center gap-2 rounded-md border border-dashed border-gray-300 px-4 py-5 text-[13px] font-semibold text-gray-600 transition hover:border-gray-500 hover:text-gray-900"
                        >
                          <Upload size={15} /> Upload photo
                        </button>
                      )}
                    </Field>

                    {photoSrc && (
                      <Field label="Photo opacity" hint="How much the colour overlay covers the photo">
                        <div className="flex items-center gap-3">
                          <input
                            type="range" min={0} max={1} step={0.05}
                            value={photoOpacity}
                            onChange={(e) => setPhotoOpacity(Number(e.target.value))}
                            aria-label="Photo opacity"
                            className="flex-1 accent-[#1A1A1A]"
                          />
                          <span className="w-9 text-right text-[12px] tabular-nums text-gray-500">
                            {Math.round(photoOpacity * 100)}%
                          </span>
                        </div>
                      </Field>
                    )}
                  </>
                )}

                <div className="flex items-start gap-2.5 rounded-md border border-[#E8D9A7]/60 bg-[#F5EFE3]/60 px-3.5 py-3">
                  <Sparkles size={16} className="mt-0.5 shrink-0 text-[#7A1F2B]" aria-hidden="true" />
                  <p className="text-[12px] leading-snug text-gray-700">
                    Free design assistance and one round of revisions are included — our team polishes your card before it goes out.
                  </p>
                </div>
                <QuantityField value={qty['invitation'] ?? 50} onChange={(v) => setQtyFor('invitation', v)} />
                <BackPrintToggle value={backPrint['invitation']} onChange={(v) => setBackPrintFor('invitation', v)} />

              </>
            )}

            {/* ── RSVP CARD ── */}
            {activeTab === 'rsvp-card' && (
              <>
                <StationeryPlaceholder
                  title="RSVP Card"
                  description="Our design team will create a matching RSVP card using your card details — names, date, and return address included."
                  icon={<ClipboardCheck size={26} className="text-gray-400" />}
                  spec={PIECE_SPECS['rsvp-card']}
                />
                <Field label="Notes for the design team" hint="Any specific preferences for your RSVP card layout">
                  <NotesArea value={rsvpCardNotes} onChange={setRsvpCardNotes} placeholder="e.g. Include a meal selection checkbox, add a dietary note line…" />
                </Field>
                <QuantityField value={qty['rsvp-card'] ?? 50} onChange={(v) => setQtyFor('rsvp-card', v)} />
                <BackPrintToggle value={backPrint['rsvp-card']} onChange={(v) => setBackPrintFor('rsvp-card', v)} />
              </>
            )}

            {/* ── ENVELOPE ── */}
            {activeTab === 'envelope' && (
              <>
                <StationeryPlaceholder
                  title="Envelope"
                  description="We'll design a coordinating envelope with your chosen palette and addressing style. Digital addressing is available for bulk print orders."
                  icon={<Mail size={26} className="text-gray-400" />}
                  spec={PIECE_SPECS['envelope']}
                />
                <Field label="Notes for the design team" hint="Addressing preferences, return address, liner details">
                  <NotesArea value={envelopeNotes} onChange={setEnvelopeNotes} placeholder="e.g. Calligraphy addressing, add a wax seal graphic, cream envelope liner…" />
                </Field>
                <QuantityField value={qty['envelope'] ?? 50} onChange={(v) => setQtyFor('envelope', v)} />
                <BackPrintToggle value={backPrint['envelope']} onChange={(v) => setBackPrintFor('envelope', v)} />
              </>
            )}

            {/* ── WEDDING TICKET ── */}
            {activeTab === 'ticket' && (
              <>
                <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50 px-4 py-4 space-y-2.5">
                  <p className="text-[12px] leading-relaxed text-gray-600">
                    Customise the boarding-pass-style wedding ticket your guests receive for door scanning.
                  </p>
                  {(() => {
                    const spec = PIECE_SPECS['ticket']!
                    return (
                      <div className="border-t border-gray-200 pt-2.5 space-y-2">
                        <div className="flex items-center gap-2">
                          <span className="text-[9px] font-bold uppercase tracking-[0.16em] text-gray-400 w-14 shrink-0">Size</span>
                          <span className="rounded bg-gray-200 px-2 py-0.5 font-mono text-[10px] text-gray-700">{spec.size}</span>
                        </div>
                        <div className="flex items-start gap-2">
                          <span className="text-[9px] font-bold uppercase tracking-[0.16em] text-gray-400 w-14 shrink-0 pt-0.5">Includes</span>
                          <div className="flex flex-wrap gap-1">
                            {spec.includes.map((field) => (
                              <span key={field} className="rounded-sm border border-gray-200 bg-white px-1.5 py-0.5 text-[10px] text-gray-600">{field}</span>
                            ))}
                          </div>
                        </div>
                        {spec.backNote && <p className="text-[10px] leading-snug text-gray-400">{spec.backNote}</p>}
                      </div>
                    )
                  })()}
                </div>

                <Field label="Ticket type" hint="Choose between a QR code or barcode scan ticket">
                  <div className="flex gap-3">
                    {([
                      { id: 'qr' as const,      label: 'QR Code',  hint: 'Modern square QR' },
                      { id: 'barcode' as const,  label: 'Barcode',  hint: 'Classic linear scan' },
                    ] as const).map((opt) => (
                      <button data-opus-button="control"
                        key={opt.id}
                        type="button"
                        onClick={() => setTicketType(opt.id)}
                        aria-pressed={ticketType === opt.id}
                        className={cn(
                          'flex flex-1 flex-col items-center gap-1 rounded-md border p-3 text-center transition',
                          ticketType === opt.id
                            ? 'border-[#1A1A1A] ring-1 ring-[#1A1A1A] bg-white'
                            : 'border-gray-300 hover:border-gray-500 bg-gray-50',
                        )}
                      >
                        <span className="text-[12px] font-bold text-gray-900">{opt.label}</span>
                        <span className="text-[10px] text-gray-500">{opt.hint}</span>
                        {ticketType === opt.id && <Check size={11} className="text-[#1A1A1A]" aria-hidden="true" />}
                      </button>
                    ))}
                  </div>
                </Field>

                <Field label="Stub accent colour" hint="The coloured left-hand stub of the ticket">
                  <div className="flex flex-wrap gap-2">
                    {ticketAccentColors.map((c, i) => (
                      <button data-opus-button="control"
                        key={`${c.value}-${i}`}
                        type="button"
                        onClick={() => setTicketAccentColor(c.value)}
                        aria-pressed={ticketAccentColor === c.value}
                        title={c.name}
                        className={cn(
                          'flex flex-col items-center gap-1 rounded-md border p-2 transition',
                          ticketAccentColor === c.value
                            ? 'border-[#1A1A1A] ring-1 ring-[#1A1A1A]'
                            : 'border-gray-300 hover:border-gray-500',
                        )}
                      >
                        <span
                          className="h-8 w-8 rounded-full ring-1 ring-black/10"
                          style={{ backgroundColor: c.value }}
                          aria-hidden="true"
                        />
                        <span className="text-[10px] font-bold text-gray-700">{c.name}</span>
                        {ticketAccentColor === c.value && <Check size={11} className="text-[#1A1A1A]" aria-hidden="true" />}
                      </button>
                    ))}
                  </div>
                </Field>

                <Field label="Venue address" hint="Auto-filled from your ceremony venue — edit here to override">
                  <Input
                    value={ticketAddress}
                    onChange={(v) => { ticketAddressEdited.current = true; setTicketAddress(v) }}
                    placeholder="e.g. 45 Ocean Rd, Dar es Salaam"
                  />
                </Field>

                <Field label="Stub label" hint="Vertical text on the left stub">
                  <Input value={ticketStubLabel} onChange={setTicketStubLabel} placeholder="BOARDING PASS TO OUR WEDDING" />
                </Field>

                <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-[12px] font-bold text-gray-900">Guest invite code</p>
                      <p className="mt-0.5 text-[11px] leading-relaxed text-gray-500">
                        Each ticket gets a unique 8-character code and barcode for door scanning. The preview shows a sample — real codes are generated when you send your cards.
                      </p>
                      <p
                        className="mt-2 font-mono text-[15px] font-bold tracking-[0.22em] text-gray-900"
                        aria-label={`Sample guest code: ${sampleGuestCode}`}
                      >
                        {sampleGuestCode}
                      </p>
                    </div>
                    <button data-opus-button="control"
                      type="button"
                      onClick={() => setSampleGuestCode(generateGuestCode())}
                      aria-label="Generate new sample code"
                      className="mt-0.5 shrink-0 rounded-md border border-gray-300 px-2.5 py-1.5 text-[11px] font-bold text-gray-600 transition hover:border-gray-500 hover:text-gray-900"
                    >
                      Shuffle
                    </button>
                  </div>
                </div>

                <QuantityField value={qty['ticket'] ?? 50} onChange={(v) => setQtyFor('ticket', v)} />
                <BackPrintToggle value={backPrint['ticket']} onChange={(v) => setBackPrintFor('ticket', v)} />
              </>
            )}

            {/* ── ENCLOSURE ── */}
            {activeTab === 'enclosure' && (
              <>
                <StationeryPlaceholder
                  title="Enclosure Card"
                  description="An optional insert with extra information — directions, accommodation, registry details, or a note from the couple."
                  icon={<FileText size={26} className="text-gray-400" />}
                  optional
                  spec={PIECE_SPECS['enclosure']}
                />
                <Field label="Notes for the design team" hint="What to include on the enclosure card">
                  <NotesArea value={enclosureNotes} onChange={setEnclosureNotes} placeholder="e.g. Hotel accommodation details, registry at Jumia and Karibu, directions to venue…" />
                </Field>
                <QuantityField value={qty['enclosure'] ?? 50} onChange={(v) => setQtyFor('enclosure', v)} />
                <BackPrintToggle value={backPrint['enclosure']} onChange={(v) => setBackPrintFor('enclosure', v)} />
              </>
            )}

            {/* ── MENU ── */}
            {activeTab === 'menu' && (
              <>
                <StationeryPlaceholder
                  title="Menu"
                  description="A printed or digital menu card for each table setting, designed to match your digital card suite."
                  icon={<UtensilsCrossed size={26} className="text-gray-400" />}
                  spec={PIECE_SPECS['menu']}
                />
                <Field label="Notes for the design team" hint="Courses, dietary notes, or layout preferences">
                  <NotesArea value={menuNotes} onChange={setMenuNotes} placeholder="e.g. 3-course dinner, include vegetarian options, Swahili and English…" />
                </Field>
                <QuantityField value={qty['menu'] ?? 50} onChange={(v) => setQtyFor('menu', v)} />
                <BackPrintToggle value={backPrint['menu']} onChange={(v) => setBackPrintFor('menu', v)} />
              </>
            )}

            {/* ── PROGRAM ── */}
            {activeTab === 'program' && (
              <>
                <StationeryPlaceholder
                  title="Program"
                  description="A ceremony or reception program listing the order of events, wedding party, and any readings or songs."
                  icon={<BookOpen size={26} className="text-gray-400" />}
                  spec={PIECE_SPECS['program']}
                />
                <Field label="Notes for the design team" hint="Order of events, wedding party names, songs, readings">
                  <NotesArea value={programNotes} onChange={setProgramNotes} placeholder="e.g. Processional at 4pm, 3 readings, list of bridal party with roles…" />
                </Field>
                <QuantityField value={qty['program'] ?? 50} onChange={(v) => setQtyFor('program', v)} />
                <BackPrintToggle value={backPrint['program']} onChange={(v) => setBackPrintFor('program', v)} />
              </>
            )}

            {/* ── TABLE NUMBERS & SIGN ── */}
            {activeTab === 'table-numbers' && (
              <>
                <StationeryPlaceholder
                  title="Table Numbers & Sign"
                  description="Matching table number cards and a welcome sign for print, sized for easel or frame display."
                  icon={<Hash size={26} className="text-gray-400" />}
                  spec={PIECE_SPECS['table-numbers']}
                />
                <Field label="Notes for the design team" hint="Number of tables, sign dimensions, welcome text">
                  <NotesArea value={tableNumbersNotes} onChange={setTableNumbersNotes} placeholder="e.g. 12 tables, A3 welcome sign, include seating chart reference…" />
                </Field>
                <QuantityField value={qty['table-numbers'] ?? 12} onChange={(v) => setQtyFor('table-numbers', v)} />
                <BackPrintToggle value={backPrint['table-numbers']} onChange={(v) => setBackPrintFor('table-numbers', v)} />
              </>
            )}

            {/* ── WEDDING SWAG ── */}
            {activeTab === 'swag' && (
              <>
                {/* Product grid */}
                <div className="grid grid-cols-2 gap-3">
                  {SWAG_CATALOG.map((item) => {
                    const q = swagSelections[item.id] ?? 0
                    const selected = q > 0
                    return (
                      <div
                        key={item.id}
                        className={cn(
                          'flex flex-col overflow-hidden rounded-xl border transition',
                          selected ? 'border-[#1A1A1A] ring-1 ring-[#1A1A1A]' : 'border-gray-200 hover:border-gray-400',
                        )}
                      >
                        {/* Emoji preview */}
                        <button data-opus-button="control"
                          type="button"
                          onClick={() => toggleSwag(item.id)}
                          aria-pressed={selected}
                          className={cn(
                            'flex h-20 w-full items-center justify-center text-4xl transition',
                            selected ? 'bg-[#1A1A1A]' : 'bg-gray-50 hover:bg-gray-100',
                          )}
                        >
                          {item.emoji}
                        </button>

                        {/* Info */}
                        <div className="flex flex-col gap-1 px-3 py-2.5">
                          <div className="flex items-start justify-between gap-1">
                            <p className="text-[12px] font-bold text-gray-900 leading-tight">{item.label}</p>
                            <button data-opus-button="control"
                              type="button"
                              onClick={() => toggleSwag(item.id)}
                              aria-pressed={selected}
                              className={cn(
                                'mt-0.5 h-4 w-4 shrink-0 rounded-full border-2 transition',
                                selected ? 'border-[#1A1A1A] bg-[#1A1A1A]' : 'border-gray-300',
                              )}
                            >
                              {selected && <Check size={10} className="text-white m-auto mt-px" />}
                            </button>
                          </div>
                          <p className="text-[10px] leading-snug text-gray-400">{item.description}</p>
                          <p className="text-[11px] font-bold text-gray-700">
                            TZS {item.unitPrice.toLocaleString('en-US')} <span className="font-normal text-gray-400">/ pc</span>
                          </p>

                          {/* Qty stepper — visible when selected */}
                          {selected && (
                            <div className="mt-1.5 flex items-center gap-1.5 border-t border-gray-100 pt-2">
                              <button data-opus-button="control"
                                type="button"
                                onClick={() => setSwagQty(item.id, q - 1)}
                                disabled={q <= 1}
                                className="grid h-6 w-6 shrink-0 place-items-center rounded-md border border-gray-300 text-gray-600 transition hover:bg-gray-50 disabled:opacity-40"
                              >
                                <span className="text-[14px] leading-none">−</span>
                              </button>
                              <input
                                type="number"
                                value={q}
                                min={1}
                                onChange={(e) => setSwagQty(item.id, Math.max(1, Number(e.target.value) || 1))}
                                className="h-6 flex-1 rounded-md border border-gray-300 text-center text-[12px] font-bold tabular-nums focus:border-[#1A1A1A] focus:outline-none"
                              />
                              <button data-opus-button="control"
                                type="button"
                                onClick={() => setSwagQty(item.id, q + 1)}
                                className="grid h-6 w-6 shrink-0 place-items-center rounded-md border border-gray-300 text-gray-600 transition hover:bg-gray-50"
                              >
                                <span className="text-[14px] leading-none">+</span>
                              </button>
                            </div>
                          )}

                          {/* Subtotal */}
                          {selected && (
                            <p className="text-[11px] font-bold text-[#5C6B4D]">
                              = TZS {(item.unitPrice * q).toLocaleString('en-US')}
                            </p>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>

                {/* Order total */}
                {selectedSwagItems.length > 0 && (
                  <div className="flex items-center justify-between rounded-lg border border-gray-200 bg-gray-50 px-4 py-3">
                    <p className="text-[12px] font-bold text-gray-900">
                      Swag total ({selectedSwagItems.length} item{selectedSwagItems.length > 1 ? 's' : ''})
                    </p>
                    <p className="text-[13px] font-bold text-gray-900">
                      TZS {swagTotal.toLocaleString('en-US')}
                    </p>
                  </div>
                )}

                {/* Print specs for selected swag */}
                {selectedSwagItems.length > 0 && (
                  <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50 px-4 py-4 space-y-2">
                    <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-gray-400">Print specs</p>
                    <div className="divide-y divide-gray-200">
                      {selectedSwagItems.map((item) => {
                        const ps = SWAG_PRINT_SPECS[item.id]
                        if (!ps) return null
                        return (
                          <div key={item.id} className="flex items-start gap-3 py-2.5 first:pt-0 last:pb-0">
                            <span className="text-[16px] leading-none mt-0.5 shrink-0">{item.emoji}</span>
                            <div className="min-w-0">
                              <p className="text-[11px] font-bold text-gray-800">{item.label}</p>
                              <p className="font-mono text-[10px] text-gray-500">{ps.size}</p>
                              <p className="text-[10px] text-gray-400">{ps.notes}</p>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}

                <Field label="Notes for the design team" hint="Preferred colours, sizing breakdown, custom text">
                  <NotesArea value={swagNotes} onChange={setSwagNotes} placeholder="e.g. Shirts: 20×S, 40×M, 20×L — sage green, include wedding date on back…" />
                </Field>
              </>
            )}

          </div>

          {/* Sidebar footer — helper links */}
          <div className="relative shrink-0">
            {drawer === 'contact' && (
              <div className="absolute bottom-full left-0 right-0 z-10 border-t border-gray-200 bg-white shadow-[0_-8px_24px_-8px_rgba(0,0,0,0.12)]">
                <div className="flex items-center justify-between border-b border-gray-100 px-5 py-3">
                  <p className="text-[12px] font-bold uppercase tracking-[0.16em] text-gray-900">Contact us</p>
                  <button data-opus-button="control" type="button" onClick={() => setDrawer(null)} aria-label="Close" className="text-gray-400 hover:text-gray-900">
                    <X size={15} />
                  </button>
                </div>
                <div className="space-y-3 px-5 py-4">
                  <p className="text-[12px] leading-relaxed text-gray-600">
                    Our design team is here to help — free assistance and one round of revisions are included with every order.
                  </p>
                  <a
                    href="https://wa.me/255700000000?text=Hi%2C%20I%20need%20help%20with%20my%20digital%20card%20design"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2.5 rounded-md border border-[#25D366]/40 bg-[#F0FBF3] px-3.5 py-2.5 text-[13px] font-semibold text-[#1A7A3C] transition hover:bg-[#E3F7E9]"
                  >
                    <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0 fill-[#25D366]" aria-hidden="true">
                      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413Z" />
                    </svg>
                    WhatsApp our team
                  </a>
                  <a
                    href="mailto:design@opusfesta.com"
                    className="flex items-center gap-2.5 rounded-md border border-gray-200 bg-gray-50 px-3.5 py-2.5 text-[13px] font-semibold text-gray-700 transition hover:bg-gray-100"
                  >
                    <HelpCircle size={15} className="shrink-0 text-gray-500" aria-hidden="true" />
                    Email design@opusfesta.com
                  </a>
                </div>
              </div>
            )}

            {drawer === 'tips' && (
              <div className="absolute bottom-full left-0 right-0 z-10 border-t border-gray-200 bg-white shadow-[0_-8px_24px_-8px_rgba(0,0,0,0.12)]">
                <div className="flex items-center justify-between border-b border-gray-100 px-5 py-3">
                  <p className="text-[12px] font-bold uppercase tracking-[0.16em] text-gray-900">Design tips</p>
                  <button data-opus-button="control" type="button" onClick={() => setDrawer(null)} aria-label="Close" className="text-gray-400 hover:text-gray-900">
                    <X size={15} />
                  </button>
                </div>
                <ul className="divide-y divide-gray-100 px-5 py-2">
                  {[
                    { heading: 'Names first', body: 'Lead with the celebrant names — guests scan the card top to bottom.' },
                    { heading: 'Short venue', body: 'Keep venue to a city or landmark. Full addresses go on the details card.' },
                    { heading: 'Dress code matters', body: 'A specific code (Cocktail, Black Tie) saves guests guesswork and photographs better.' },
                    { heading: 'Two RSVP contacts', body: 'Add a backup number — one contact is often unavailable during wedding prep.' },
                    { heading: 'QR label', body: 'Use DOUBLE for couples or families sharing one card, SINGLE for individual guests.' },
                    { heading: 'Keep quotes brief', body: 'One line reads well on a card. Long quotes shrink to fit and lose impact.' },
                  ].map((tip) => (
                    <li key={tip.heading} className="py-3">
                      <p className="text-[12px] font-bold text-gray-900">{tip.heading}</p>
                      <p className="mt-0.5 text-[12px] leading-relaxed text-gray-500">{tip.body}</p>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="flex items-center gap-5 border-t border-gray-200 px-5 py-3 text-[12px] font-semibold text-gray-600">
              <button data-opus-button="control"
                type="button"
                onClick={() => setDrawer((d) => (d === 'contact' ? null : 'contact'))}
                className={cn('inline-flex items-center gap-1.5 transition hover:text-gray-900', drawer === 'contact' && 'text-gray-900')}
              >
                <HelpCircle size={15} /> Contact us
              </button>
              <button data-opus-button="control"
                type="button"
                onClick={() => setDrawer((d) => (d === 'tips' ? null : 'tips'))}
                className={cn('inline-flex items-center gap-1.5 transition hover:text-gray-900', drawer === 'tips' && 'text-gray-900')}
              >
                <Lightbulb size={15} /> Tips
              </button>
            </div>
          </div>
        </aside>

        {/* ─── Canvas ─── */}
        <div className={cn(
          'order-1 flex flex-col bg-[#E9E7E3] lg:order-2 lg:sticky lg:top-[101px] lg:h-[calc(100vh-101px)]',
          !canvasVisible && 'hidden lg:flex',
        )}>
          <div className="flex flex-1 items-center justify-center overflow-auto p-6 sm:p-10">

            {isReview ? (
              <ReviewCardGrid
                product={product}
                couple={couple}
                selectedPalette={selectedPalette}
                message={message}
                messageAttr={messageAttr}
                fontStyle={fontStyle}
                sectionStyles={sectionStyles}
                familyIntro={familyIntro}
                dressCodeColors={palette}
                photoSrc={photoSrc}
                photoOpacity={photoOpacity}
                dressCode={dressCode}
                rsvpContacts={rsvpContacts}
                receptionVenue={receptionVenue}
                receptionTime={receptionTime}
                celebrant={celebrant}
                ticketType={ticketType}
                ticketAccentColor={ticketAccentColor}
                ticketAddress={ticketAddress}
                ticketStubLabel={ticketStubLabel}
                guestCode={sampleGuestCode}
                dateISO={dateISO}
                time={time}
                venue={venue}
                rsvpCardNotes={rsvpCardNotes}
                envelopeNotes={envelopeNotes}
                enclosureNotes={enclosureNotes}
                menuNotes={menuNotes}
                programNotes={programNotes}
                tableNumbersNotes={tableNumbersNotes}
                swagItems={selectedSwagItems.map((s) => s.label)}
                swagNotes={swagNotes}
                designSvg={renderedSvg}
                onEdit={setActiveTab}
              />
            ) : activeTab === 'ticket' && cardSide === 'front' ? (
              <div className="w-full max-w-xl origin-center transition-transform" style={{ transform: `scale(${zoom})` }}>
                <TicketSvgFile
                  type={ticketType}
                  accentColor={ticketAccentColor}
                  coupleNames={celebrant || 'Amani & Neema'}
                  dateISO={dateISO}
                  time={time}
                  address={ticketAddress}
                  message={message}
                  rsvpContacts={rsvpContacts.filter(Boolean)}
                  stubLabel={ticketStubLabel || 'ACCESS PASS TO OUR WEDDING'}
                />
              </div>
            ) : activeTab === 'invitation' && cardSide === 'front' ? (
              <div className="w-full max-w-sm origin-center transition-transform" style={{ transform: `scale(${zoom})` }}>
                <div ref={cardRef} className="relative aspect-[5/7] overflow-hidden rounded-[4px] bg-white shadow-[0_24px_60px_-20px_rgba(0,0,0,0.45)] ring-1 ring-black/5">
                  {renderedSvg ? (
                    <div
                      className="absolute inset-0"
                      style={{
                        '--iv-bg':   selectedPalette.background,
                        '--iv-surf': selectedPalette.surface,
                        '--iv-acc':  selectedPalette.accent,
                        '--iv-tp':   selectedPalette.textPrimary,
                        '--iv-ts':   selectedPalette.textSecondary,
                        '--iv-mut':  selectedPalette.muted,
                      } as React.CSSProperties}
                      dangerouslySetInnerHTML={{ __html: renderedSvg }}
                    />
                  ) : (
                    <div
                      className="absolute inset-0 flex items-center justify-center"
                      style={{ backgroundColor: selectedPalette.background }}
                    >
                      <span className="text-[11px] font-medium text-gray-400">Loading design…</span>
                    </div>
                  )}
                  <CardClickLayer
                    containerRef={cardRef}
                    onEdit={(panel) => {
                      setActivePanel(panel)
                      setSelectedItemId(null)
                    }}
                  />
                  <OverlayEditor
                    containerRef={cardRef}
                    items={overlayItems}
                    selectedId={selectedItemId}
                    onSelect={setSelectedItemId}
                    onMove={(id, x, y) => updateOverlayItem(id, { x, y })}
                    onUpdate={updateOverlayItem}
                    onDelete={deleteOverlayItem}
                    onDuplicate={duplicateOverlayItem}
                  />
                </div>
              </div>
            ) : activeTab === 'swag' && selectedSwagItems.length > 0 ? (
              <SwagPreview
                items={selectedSwagItems}
                selections={swagSelections}
                total={swagTotal}
                coupleNames={celebrant}
                palette={selectedPalette}
              />
            ) : (
              <CanvasPlaceholder
                tab={activeTab}
                palette={selectedPalette}
                coupleNames={celebrant}
                side={cardSide}
              />
            )}

          </div>

          {/* Zoom control — hidden in review */}
          {!isReview && (
            <div className="flex items-center justify-center gap-3 border-t border-black/5 px-6 py-3">
              <ZoomOut size={16} className="text-gray-500" aria-hidden="true" />
              <input
                type="range" min={0.6} max={1.4} step={0.05}
                value={zoom}
                onChange={(e) => setZoom(Number(e.target.value))}
                aria-label="Zoom preview"
                className="w-44 accent-[#1A1A1A] sm:w-56"
              />
              <ZoomIn size={16} className="text-gray-500" aria-hidden="true" />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Review card grid ─────────────────────────────────────────────────────────

type ReviewCardGridProps = {
  product: CatalogProduct
  couple: { names: string; date: string; venue: string; time?: string }
  selectedPalette: { background: string; surface: string; accent: string; textPrimary: string; textSecondary: string; muted: string; name?: string }
  message: string
  messageAttr: string
  fontStyle: FontStyle
  sectionStyles: SectionStyles
  familyIntro: string
  dressCodeColors: string[]
  photoSrc: string | undefined
  photoOpacity: number
  dressCode: string
  rsvpContacts: string[]
  receptionVenue: string
  receptionTime: string
  celebrant: string
  ticketType: 'qr' | 'barcode'
  ticketAccentColor: string
  ticketAddress: string
  ticketStubLabel: string
  guestCode: string
  dateISO: string
  time: string
  venue: string
  rsvpCardNotes: string
  envelopeNotes: string
  enclosureNotes: string
  menuNotes: string
  programNotes: string
  tableNumbersNotes: string
  swagItems: string[]
  swagNotes: string
  designSvg?: string | null
  onEdit: (tab: MainTab) => void
}

function ReviewCardGrid(props: ReviewCardGridProps) {
  const {
    product, couple, selectedPalette, message, messageAttr, fontStyle,
    sectionStyles, familyIntro, dressCodeColors,
    photoSrc, photoOpacity, dressCode, rsvpContacts, receptionVenue, receptionTime,
    celebrant, ticketType, ticketAccentColor, ticketAddress, ticketStubLabel, guestCode, dateISO, time, venue,
    rsvpCardNotes, envelopeNotes, enclosureNotes, menuNotes, programNotes,
    tableNumbersNotes, swagItems, swagNotes, designSvg, onEdit,
  } = props

  // Cards to show: invitation + ticket always; others only if the user added notes/selections
  const cards: { tab: MainTab; label: string; alwaysShow: boolean; hasContent: boolean }[] = (
    [
      { tab: 'invitation'    as MainTab, label: 'Invitation Card',      alwaysShow: true,  hasContent: true },
      { tab: 'rsvp-card'     as MainTab, label: 'RSVP Card',            alwaysShow: false, hasContent: !!rsvpCardNotes },
      { tab: 'envelope'      as MainTab, label: 'Envelope',             alwaysShow: false, hasContent: !!envelopeNotes },
      { tab: 'ticket'        as MainTab, label: 'Wedding Ticket',       alwaysShow: true,  hasContent: true },
      { tab: 'enclosure'     as MainTab, label: 'Enclosure Card',       alwaysShow: false, hasContent: !!enclosureNotes },
      { tab: 'menu'          as MainTab, label: 'Menu',                 alwaysShow: false, hasContent: !!menuNotes },
      { tab: 'program'       as MainTab, label: 'Program',              alwaysShow: false, hasContent: !!programNotes },
      { tab: 'table-numbers' as MainTab, label: 'Table Numbers & Sign', alwaysShow: false, hasContent: !!tableNumbersNotes },
      { tab: 'swag'          as MainTab, label: 'Wedding Swag',         alwaysShow: false, hasContent: swagItems.length > 0 || !!swagNotes },
    ] as const
  ).filter((c) => c.alwaysShow || c.hasContent)

  return (
    <div className="h-full overflow-y-auto px-6 py-8">
      <div className="grid grid-cols-2 gap-6 sm:gap-8">
        {cards.map((card) => (
          <ReviewCardItem
            key={card.tab}
            tab={card.tab}
            label={card.label}
            product={product}
            couple={couple}
            selectedPalette={selectedPalette}
            message={message}
            messageAttr={messageAttr}
            fontStyle={fontStyle}
            sectionStyles={sectionStyles}
            familyIntro={familyIntro}
            dressCodeColors={dressCodeColors}
            photoSrc={photoSrc}
            photoOpacity={photoOpacity}
            dressCode={dressCode}
            rsvpContacts={rsvpContacts}
            receptionVenue={receptionVenue}
            receptionTime={receptionTime}
            celebrant={celebrant}
            ticketType={ticketType}
            ticketAccentColor={ticketAccentColor}
            ticketAddress={ticketAddress}
            ticketStubLabel={ticketStubLabel}
            guestCode={guestCode}
            dateISO={dateISO}
            time={time}
            venue={venue}
            designSvg={designSvg}
            onEdit={onEdit}
          />
        ))}
      </div>
    </div>
  )
}

function ReviewCardItem({
  tab, label, product, couple, selectedPalette, message, messageAttr, fontStyle,
  sectionStyles, familyIntro, dressCodeColors,
  photoSrc, photoOpacity, dressCode, rsvpContacts, receptionVenue, receptionTime,
  celebrant, ticketType, ticketAccentColor, ticketAddress, ticketStubLabel, dateISO, time,
  designSvg,
  onEdit,
}: Omit<ReviewCardGridProps, 'rsvpCardNotes' | 'envelopeNotes' | 'enclosureNotes' | 'menuNotes' | 'programNotes' | 'tableNumbersNotes' | 'swagItems' | 'swagNotes'> & {
  tab: MainTab
  label: string
}) {
  const [side, setSide] = useState<'front' | 'back'>('front')
  const isTicket = tab === 'ticket'

  return (
    <div className={cn('flex flex-col gap-3', isTicket && 'col-span-2')}>
      {/* Card preview */}
      <div className={cn(
        'relative overflow-hidden rounded-[4px] shadow-[0_16px_48px_-16px_rgba(0,0,0,0.4)] ring-1 ring-black/8',
        isTicket ? 'w-full' : 'aspect-[5/7] w-full',
      )}>
        {tab === 'ticket' && side === 'front' ? (
          <TicketSvgFile
            type={ticketType}
            accentColor={ticketAccentColor}
            coupleNames={celebrant || 'Amani & Neema'}
            dateISO={dateISO}
            time={time}
            address={ticketAddress}
            message={message}
            rsvpContacts={rsvpContacts.filter(Boolean)}
            stubLabel={ticketStubLabel || 'ACCESS PASS TO OUR WEDDING'}
          />
        ) : tab === 'invitation' && side === 'front' && designSvg ? (
          <div
            className="absolute inset-0"
            style={{
              '--iv-bg':   selectedPalette.background,
              '--iv-surf': selectedPalette.surface,
              '--iv-acc':  selectedPalette.accent,
              '--iv-tp':   selectedPalette.textPrimary,
              '--iv-ts':   selectedPalette.textSecondary,
              '--iv-mut':  selectedPalette.muted,
            } as React.CSSProperties}
            dangerouslySetInnerHTML={{ __html: designSvg }}
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center" style={{ backgroundColor: side === 'back' ? selectedPalette.accent : selectedPalette.background }}>
            <CanvasPlaceholder tab={tab} palette={selectedPalette} coupleNames={celebrant} side={side} />
          </div>
        )}
      </div>

      {/* Label row: card name + front/back toggle + edit */}
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-gray-700">{label}</p>
        <div className="flex items-center gap-2">
          {/* Front / Back toggle */}
          <div className="flex items-center rounded-full border border-gray-200 bg-gray-100 p-0.5">
            {(['front', 'back'] as const).map((s) => (
              <button data-opus-button="control"
                key={s}
                type="button"
                onClick={() => setSide(s)}
                aria-pressed={side === s}
                className={cn(
                  'rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.08em] transition',
                  side === s ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-400 hover:text-gray-600',
                )}
              >
                {s}
              </button>
            ))}
          </div>
          {/* Edit button */}
          <button data-opus-button="control"
            type="button"
            onClick={() => onEdit(tab)}
            className="flex items-center gap-1 rounded-full border border-gray-300 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.08em] text-gray-600 transition hover:border-gray-500 hover:text-gray-900"
          >
            <Pencil size={9} /> Edit
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Swag canvas preview ─────────────────────────────────────────────────────

function SwagPreview({
  items, selections, total, coupleNames, palette,
}: {
  items: typeof SWAG_CATALOG
  selections: Record<string, number>
  total: number
  coupleNames: string
  palette: { background: string; accent: string; textPrimary: string; textSecondary: string }
}) {
  return (
    <div className="flex w-full max-w-sm flex-col gap-5">
      {/* Monogram label */}
      <div
        className="flex flex-col items-center gap-1 rounded-xl px-5 py-4 text-center"
        style={{ backgroundColor: palette.background }}
      >
        <p className="text-[9px] font-bold uppercase tracking-[0.28em]" style={{ color: palette.textSecondary }}>
          Wedding Swag
        </p>
        <p
          className="text-[20px] font-bold leading-snug"
          style={{ color: palette.textPrimary, fontFamily: "Georgia, 'Times New Roman', serif", fontStyle: 'italic' }}
        >
          {coupleNames || 'Amani & Neema'}
        </p>
        <div className="mt-1 h-px w-10 opacity-30" style={{ backgroundColor: palette.accent }} aria-hidden="true" />
      </div>

      {/* Item cards */}
      <div className="grid grid-cols-2 gap-3">
        {items.map((item) => {
          const q = selections[item.id] ?? 0
          return (
            <div
              key={item.id}
              className="flex flex-col items-center gap-2 rounded-xl border border-black/8 bg-white px-3 py-4 text-center shadow-[0_4px_16px_-8px_rgba(0,0,0,0.15)]"
            >
              <span className="text-4xl leading-none">{item.emoji}</span>
              <p className="text-[11px] font-bold text-gray-900">{item.label}</p>
              <div className="flex flex-col items-center gap-0.5">
                <p className="text-[10px] tabular-nums text-gray-500">×{q}</p>
                <p className="text-[11px] font-bold" style={{ color: palette.accent }}>
                  TZS {(item.unitPrice * q).toLocaleString('en-US')}
                </p>
              </div>
            </div>
          )
        })}
      </div>

      {/* Total */}
      <div
        className="flex items-center justify-between rounded-xl px-4 py-3"
        style={{ backgroundColor: palette.accent }}
      >
        <p className="text-[11px] font-bold uppercase tracking-[0.12em]" style={{ color: palette.background }}>
          Total
        </p>
        <p className="text-[14px] font-bold tabular-nums" style={{ color: palette.background }}>
          TZS {total.toLocaleString('en-US')}
        </p>
      </div>
    </div>
  )
}

// ─── Canvas placeholder for stationery tabs without live preview ──────────────

function CanvasPlaceholder({
  tab,
  palette,
  coupleNames,
  side = 'front',
}: {
  tab: MainTab
  palette: { background: string; accent: string; textPrimary: string; textSecondary: string; name?: string }
  coupleNames: string
  side?: 'front' | 'back'
}) {
  const tabMeta = MAIN_TABS.find((t) => t.id === tab)!
  const isWide = tab === 'envelope'
  const isSmall = tab === 'rsvp-card' || tab === 'table-numbers'
  const isLandscape = tab === 'menu' || tab === 'program'
  const isBack = side === 'back'

  return (
    <div className="flex flex-col items-center gap-5">
      <div
        className={cn(
          'relative flex origin-center flex-col items-center justify-center overflow-hidden rounded-[4px] shadow-[0_24px_60px_-20px_rgba(0,0,0,0.45)] ring-1 ring-black/10',
          isLandscape ? 'aspect-[7/5] w-full max-w-md' :
          isSmall     ? 'aspect-[5/7] w-48' :
          isWide      ? 'aspect-[5/3] w-full max-w-sm' :
                        'aspect-[5/7] w-full max-w-xs',
        )}
        style={{ backgroundColor: isBack ? palette.accent : palette.background }}
      >
        {/* Top rule */}
        <div
          className="absolute inset-x-0 top-0 h-1.5"
          style={{ backgroundColor: isBack ? palette.background : palette.accent, opacity: isBack ? 0.4 : 1 }}
          aria-hidden="true"
        />

        {isBack ? (
          /* Back side — clean, minimal */
          <div className="flex flex-col items-center gap-4 px-8 py-6 text-center">
            <div
              className="flex h-12 w-12 items-center justify-center rounded-full"
              style={{ backgroundColor: `${palette.background}30` }}
              aria-hidden="true"
            >
              {tabMeta.icon}
            </div>
            <p
              className="text-[20px] font-bold leading-snug"
              style={{ color: palette.background, fontFamily: "Georgia, 'Times New Roman', serif", fontStyle: 'italic' }}
            >
              {coupleNames || 'Amani & Neema'}
            </p>
            <div className="h-px w-12 opacity-40" style={{ backgroundColor: palette.background }} aria-hidden="true" />
            <p className="text-[10px] font-bold uppercase tracking-[0.24em]" style={{ color: `${palette.background}99` }}>
              {tabMeta.label} · Back
            </p>
          </div>
        ) : (
          /* Front side */
          <div className="flex flex-col items-center gap-3 px-8 py-6 text-center">
            <div
              className="flex h-10 w-10 items-center justify-center rounded-full opacity-25"
              style={{ backgroundColor: palette.accent }}
              aria-hidden="true"
            >
              {tabMeta.icon}
            </div>
            <p className="text-[11px] font-bold uppercase tracking-[0.28em]" style={{ color: palette.textSecondary }}>
              {tabMeta.label}
            </p>
            <p
              className="text-[18px] font-bold leading-snug"
              style={{ color: palette.textPrimary, fontFamily: "Georgia, 'Times New Roman', serif", fontStyle: 'italic' }}
            >
              {coupleNames || 'Amani & Neema'}
            </p>
            {tabMeta.optional && (
              <span
                className="mt-1 rounded-sm px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.12em]"
                style={{ backgroundColor: `${palette.accent}22`, color: palette.textSecondary }}
              >
                Optional
              </span>
            )}
          </div>
        )}

        {/* Bottom rule */}
        <div
          className="absolute inset-x-0 bottom-0 h-1"
          style={{ backgroundColor: isBack ? palette.background : palette.accent, opacity: 0.35 }}
          aria-hidden="true"
        />
      </div>
      <p className="max-w-xs text-center text-[12px] leading-relaxed text-gray-500">
        Preview generated by the design team after checkout
      </p>
    </div>
  )
}

// ─── Quantity field ───────────────────────────────────────────────────────────

function QuantityField({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-gray-200 bg-gray-50 px-4 py-3">
      <div>
        <p className="text-[12px] font-bold text-gray-900">Quantity</p>
        <p className="text-[11px] text-gray-400">How many copies do you need?</p>
      </div>
      <div className="flex items-center gap-1">
        <button data-opus-button="neutral" data-opus-button-size="small"
          type="button"
          onClick={() => onChange(value - (value > 100 ? 10 : 1))}
          aria-label="Decrease quantity"
          className="grid h-8 w-8 place-items-center rounded-md border border-gray-300 text-gray-700 transition hover:border-gray-500 hover:bg-white disabled:opacity-40"
          disabled={value <= 1}
        >
          <span className="text-[16px] leading-none">−</span>
        </button>
        <input
          type="number"
          value={value}
          min={1}
          onChange={(e) => onChange(Math.max(1, Number(e.target.value) || 1))}
          aria-label="Quantity"
          className="h-8 w-16 rounded-md border border-gray-300 text-center text-[14px] font-bold tabular-nums text-gray-900 focus:border-[#1A1A1A] focus:outline-none focus:ring-1 focus:ring-[#1A1A1A]"
        />
        <button data-opus-button="neutral" data-opus-button-size="small"
          type="button"
          onClick={() => onChange(value + (value >= 100 ? 10 : 1))}
          aria-label="Increase quantity"
          className="grid h-8 w-8 place-items-center rounded-md border border-gray-300 text-gray-700 transition hover:border-gray-500 hover:bg-white"
        >
          <span className="text-[16px] leading-none">+</span>
        </button>
      </div>
    </div>
  )
}

// ─── Back-print option ───────────────────────────────────────────────────────

function BackPrintToggle({
  value,
  onChange,
}: {
  value: 'same' | 'blank' | undefined
  onChange: (v: 'same' | 'blank') => void
}) {
  return (
    <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
      <p className="mb-3 text-[12px] font-bold text-gray-900">Back of card</p>
      <div className="flex flex-col gap-2">
        {([
          { v: 'blank', label: 'Leave back blank', sub: 'No additional cost' },
          { v: 'same',  label: 'Print same on back', sub: '+TZS 1,500 per item' },
        ] as const).map(({ v, label, sub }) => {
          const selected = (value ?? 'blank') === v
          return (
          <button data-opus-button="control"
            key={v}
            type="button"
            onClick={() => onChange(v)}
            aria-pressed={selected}
            className={cn(
              'flex items-start gap-3 rounded-md border px-3.5 py-3 text-left transition',
              selected
                ? 'border-[#1A1A1A] bg-white ring-1 ring-[#1A1A1A]'
                : 'border-gray-200 bg-white hover:border-gray-400',
            )}
          >
            <span className={cn(
              'mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2 transition',
              selected ? 'border-[#1A1A1A] bg-[#1A1A1A]' : 'border-gray-300',
            )}>
              {selected && <span className="h-1.5 w-1.5 rounded-full bg-white" />}
            </span>
            <span>
              <span className="block text-[13px] font-semibold text-gray-900">{label}</span>
              <span className={cn(
                'text-[11px]',
                v === 'same' ? 'font-bold text-[#5C6B4D]' : 'text-gray-400',
              )}>{sub}</span>
            </span>
          </button>
        )})}

      </div>
    </div>
  )
}

// ─── Stationery info placeholder ──────────────────────────────────────────────

function StationeryPlaceholder({
  title, description, icon, optional, spec,
}: {
  title: string
  description: string
  icon: React.ReactNode
  optional?: boolean
  spec?: { size: string; includes: string[]; backNote?: string }
}) {
  return (
    <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50 px-4 py-5 space-y-3">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 shrink-0">{icon}</div>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-[13px] font-bold text-gray-900">{title}</p>
            {optional && (
              <span className="rounded-sm bg-gray-200 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-[0.1em] text-gray-500">
                Optional
              </span>
            )}
          </div>
          <p className="mt-1 text-[12px] leading-relaxed text-gray-500">{description}</p>
        </div>
      </div>

      {spec && (
        <div className="border-t border-gray-200 pt-3 space-y-2.5">
          {/* Print size */}
          <div className="flex items-center gap-2">
            <span className="text-[9px] font-bold uppercase tracking-[0.16em] text-gray-400 w-14 shrink-0">Size</span>
            <span className="rounded bg-gray-200 px-2 py-0.5 font-mono text-[10px] text-gray-700">{spec.size}</span>
          </div>

          {/* Included fields */}
          <div className="flex items-start gap-2">
            <span className="text-[9px] font-bold uppercase tracking-[0.16em] text-gray-400 w-14 shrink-0 pt-0.5">Includes</span>
            <div className="flex flex-wrap gap-1">
              {spec.includes.map((field) => (
                <span
                  key={field}
                  className="rounded-sm border border-gray-200 bg-white px-1.5 py-0.5 text-[10px] text-gray-600"
                >
                  {field}
                </span>
              ))}
            </div>
          </div>

          {/* Back note */}
          {spec.backNote && (
            <p className="text-[10px] leading-snug text-gray-400">{spec.backNote}</p>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Notes textarea ───────────────────────────────────────────────────────────

function NotesArea({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      rows={4}
      placeholder={placeholder}
      className="w-full resize-none rounded-md border border-gray-300 px-3.5 py-2.5 text-[14px] leading-relaxed focus:border-[#1A1A1A] focus:outline-none focus:ring-1 focus:ring-[#1A1A1A]"
    />
  )
}

// ─── Ticket SVG file preview ──────────────────────────────────────────────────

// Replaces text content of the nth <text> inside a named SVG group, collapsing to one tspan
function setSvgGroupText(doc: Document, groupId: string, textIndex: number, value: string) {
  const g = doc.getElementById(groupId)
  if (!g) return
  const texts = g.querySelectorAll('text')
  const el = texts[textIndex]
  if (!el) return
  const tspans = el.querySelectorAll('tspan')
  if (tspans.length > 0) {
    tspans[0].textContent = value
    for (let i = 1; i < tspans.length; i++) tspans[i].parentNode?.removeChild(tspans[i])
  } else {
    el.textContent = value
  }
}

function injectTicketData(
  rawSvg: string,
  type: 'qr' | 'barcode',
  coupleNames: string, dateISO: string, time: string,
  address: string, message: string, rsvpContacts: string[], stubLabel: string,
): string {
  const [first, second] = coupleNames.split(/\s*&\s*/)
  const firstName  = (first?.trim()  || 'BRIDE').toUpperCase()
  const secondName = (second?.trim() || 'GROOM').toUpperCase()
  const dateDisplay = dateISO
    ? new Date(dateISO + 'T00:00:00').toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' }).toUpperCase()
    : 'TBD'
  const dateShort = dateISO
    ? new Date(dateISO + 'T00:00:00').toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' })
    : '—'
  const attribution = `— ${first?.trim() || 'Bride'} & ${second?.trim() || 'Groom'}`
  const rsvp1 = rsvpContacts[0] || '+255 7XX XXX XXX'
  const rsvp2 = rsvpContacts[1] || rsvp1

  const parser = new DOMParser()
  const doc = parser.parseFromString(rawSvg, 'image/svg+xml')

  // Couple names (texts[0]=first name, texts[1]="and", texts[2]=second name)
  setSvgGroupText(doc, 'Ticket_Title', 0, firstName)
  setSvgGroupText(doc, 'Ticket_Title', 2, secondName)

  // Date
  setSvgGroupText(doc, 'Ticket_Date', 0, `DATE: ${dateDisplay}`)
  if (type === 'barcode') setSvgGroupText(doc, 'Ticket_Date', 1, dateShort)

  // Time — hide group if empty
  const timeG = doc.getElementById('Ticket_Time')
  if (timeG) {
    if (time) {
      setSvgGroupText(doc, 'Ticket_Time', 0, `TIME: ${time}`)
    } else {
      timeG.setAttribute('visibility', 'hidden')
    }
  }

  // Venue / address (auto-populated from ceremony venue)
  setSvgGroupText(doc, 'Ticket_Venue', 0, `ADDRESS: ${(address || '').slice(0, 28)}`)

  // Personal message
  setSvgGroupText(doc, 'Message', 0, (message || 'We are delighted to invite you to our special day.').slice(0, 52))

  // Attribution
  setSvgGroupText(doc, 'Attribution', 0, attribution)

  // RSVP contacts — auto-populated from invitation RSVP contacts
  // texts[0] = "RSVP" label, texts[1] = first number, texts[2] = second number
  setSvgGroupText(doc, 'Rsvp_Contact', 1, rsvp1)
  setSvgGroupText(doc, 'Rsvp_Contact', 2, rsvp2)

  // Stub label
  setSvgGroupText(doc, 'Stub_Label', 0, (stubLabel || 'ACCESS PASS TO OUR WEDDING').slice(0, 26))

  return new XMLSerializer().serializeToString(doc.documentElement)
}

const STORAGE_BASE = 'https://ppdapuqehwlfwofbpbvb.supabase.co/storage/v1/object/public/website-media'
const TICKET_SVG_URLS = {
  qr:      `${STORAGE_BASE}/invitation-svgs/model-wedding-package/ticket-front.svg`,
  barcode: `${STORAGE_BASE}/invitation-svgs/model-wedding-package/ticket-barcode-front.svg`,
}

function TicketSvgFile({
  type, accentColor, coupleNames, dateISO, time, address, message, rsvpContacts, stubLabel,
}: {
  type: 'qr' | 'barcode'
  accentColor: string
  coupleNames: string
  dateISO: string
  time: string
  address: string
  message: string
  rsvpContacts: string[]
  stubLabel: string
}) {
  const [rawSvg, setRawSvg] = useState('')
  const src = TICKET_SVG_URLS[type]

  // Fetch the SVG template once per type switch — no re-fetch on data changes
  useEffect(() => {
    fetch(src)
      .then((r) => r.text())
      .then((text) => setRawSvg(text.replace(/<\?xml[^?]*\?>/, '')))
  }, [src])

  // Inject live data whenever rawSvg or any data prop changes — no network call needed
  const html = useMemo(
    () => rawSvg ? injectTicketData(rawSvg, type, coupleNames, dateISO, time, address, message, rsvpContacts, stubLabel) : '',
    [rawSvg, type, coupleNames, dateISO, time, address, message, rsvpContacts, stubLabel],
  )

  return (
    <div
      className="w-full"
      style={{
        '--iv-acc': accentColor,
        '--iv-bg': '#f5f0ea',
        '--iv-ts': accentColor,
        '--iv-tp': '#3a2d1f',
        '--iv-mut': `${accentColor}cc`,
      } as React.CSSProperties}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}


// ─── Card click-to-edit hotspot layer ────────────────────────────────────────

const SECTION_PANEL_MAP: Record<string, { label: string; panel: DigitalCardPanel }> = {
  names:       { label: 'Names',        panel: 'event'   },
  familyIntro: { label: 'Family intro', panel: 'event'   },
  date:        { label: 'Date',         panel: 'details' },
  time:        { label: 'Time',         panel: 'details' },
  venue:       { label: 'Venue',        panel: 'details' },
  reception:   { label: 'Reception',    panel: 'details' },
  dressCode:   { label: 'Dress code',   panel: 'dress'   },
  message:     { label: 'Quote',        panel: 'message' },
  rsvpContact: { label: 'RSVP',         panel: 'rsvp'    },
}

type MeasuredHotspot = { key: string; label: string; panel: DigitalCardPanel; top: number; height: number }

function CardClickLayer({
  containerRef,
  onEdit,
}: {
  containerRef: React.RefObject<HTMLDivElement | null>
  onEdit: (panel: DigitalCardPanel) => void
}) {
  const [hotspots, setHotspots] = useState<MeasuredHotspot[]>([])

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const measure = () => {
      const cr = container.getBoundingClientRect()
      if (cr.height === 0) return

      // Compute union bounding box per section key
      const boxes = new Map<string, { top: number; bottom: number }>()
      container.querySelectorAll<Element>('[data-section]').forEach((el) => {
        const key = el.getAttribute('data-section')!
        const r = el.getBoundingClientRect()
        if (r.width === 0 && r.height === 0) return
        const top = r.top - cr.top
        const bottom = r.bottom - cr.top
        const existing = boxes.get(key)
        boxes.set(key, existing
          ? { top: Math.min(existing.top, top), bottom: Math.max(existing.bottom, bottom) }
          : { top, bottom }
        )
      })

      const pad = 5
      const next: MeasuredHotspot[] = []
      boxes.forEach((box, key) => {
        const meta = SECTION_PANEL_MAP[key]
        if (!meta) return
        next.push({ key, label: meta.label, panel: meta.panel, top: Math.max(0, box.top - pad), height: box.bottom - box.top + pad * 2 })
      })
      setHotspots(next)
    }

    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(container)
    const mo = new MutationObserver(measure)
    mo.observe(container, { subtree: true, childList: true, attributes: false })
    return () => { ro.disconnect(); mo.disconnect() }
  }, [containerRef])

  return (
    <div className="absolute inset-0 z-10 pointer-events-none">
      {hotspots.map((h) => (
        <button data-opus-button="control"
          key={h.key}
          type="button"
          onClick={() => onEdit(h.panel)}
          aria-label={`Edit ${h.label}`}
          className={cn(
            'group absolute left-2 right-2 pointer-events-auto',
            'rounded transition-all duration-150',
            'hover:bg-[#1A1A1A]/6 hover:ring-1 hover:ring-[#1A1A1A]/20',
          )}
          style={{ top: h.top, height: h.height }}
        >
          <span className={cn(
            'absolute right-1.5 top-1/2 -translate-y-1/2',
            'flex items-center gap-1 rounded px-1.5 py-0.5',
            'bg-[#1A1A1A] text-white text-[9px] font-bold uppercase tracking-[0.12em]',
            'opacity-0 transition-opacity duration-150 group-hover:opacity-100',
            'pointer-events-none select-none',
          )}>
            <Pencil size={8} />
            {h.label}
          </span>
        </button>
      ))}
    </div>
  )
}

// ─── Inline text style bar — shown beneath each relevant field ────────────────

function TextStyleBar({
  sectionKey,
  sectionStyles,
  onUpdate,
}: {
  sectionKey: keyof SectionStyles
  sectionStyles: SectionStyles
  onUpdate: (key: keyof SectionStyles, patch: Partial<SectionStyle>) => void
}) {
  const s = sectionStyles[sectionKey]
  const activeScale = s?.scale ?? 1
  const activeAlign = s?.align
  const isBold = s?.fontWeight === 'bold'
  const isItalic = s?.italic ?? false
  const isUppercase = s?.uppercase ?? false
  const activeSpacing = s?.letterSpacing
  const activeColor = s?.color ?? ''
  const activeOpacity = s?.opacity ?? 1

  const hasOverride = !!(s?.scale !== undefined || s?.fontWeight || s?.align ||
    s?.italic || s?.uppercase || s?.letterSpacing || s?.color || s?.opacity !== undefined)

  const toggle = <K extends keyof SectionStyle>(k: K, on: SectionStyle[K], off: SectionStyle[K]) =>
    onUpdate(sectionKey, { [k]: (s?.[k] === on ? off : on) } as Partial<SectionStyle>)

  return (
    <div className="mt-2 space-y-1.5 rounded-md border border-gray-100 bg-gray-50 px-2.5 py-2">

      {/* Row 1: size + alignment */}
      <div className="flex items-center gap-1 flex-wrap">
        {([0.75, 1, 1.25, 1.5] as const).map((scale) => {
          const label = scale === 0.75 ? 'S' : scale === 1 ? 'M' : scale === 1.25 ? 'L' : 'XL'
          return (
            <button data-opus-button="control" key={scale} type="button"
              onClick={() => onUpdate(sectionKey, { scale })}
              aria-pressed={activeScale === scale}
              className={cn(
                'h-6 w-7 rounded border text-[10px] font-bold transition',
                activeScale === scale ? 'border-[#1A1A1A] bg-[#1A1A1A] text-white' : 'border-gray-200 text-gray-500 hover:border-gray-400',
              )}
            >{label}</button>
          )
        })}

        <span className="mx-0.5 h-4 w-px bg-gray-200" aria-hidden="true" />

        {([
          { value: 'left' as const,   icon: <AlignLeft   size={10} /> },
          { value: 'center' as const, icon: <AlignCenter size={10} /> },
          { value: 'right' as const,  icon: <AlignRight  size={10} /> },
        ]).map(({ value, icon }) => (
          <button data-opus-button="control" key={value} type="button"
            onClick={() => onUpdate(sectionKey, { align: activeAlign === value ? undefined : value })}
            aria-pressed={activeAlign === value}
            aria-label={`Align ${value}`}
            className={cn(
              'flex h-6 w-7 items-center justify-center rounded border transition',
              activeAlign === value ? 'border-[#1A1A1A] bg-[#1A1A1A] text-white' : 'border-gray-200 text-gray-500 hover:border-gray-400',
            )}
          >{icon}</button>
        ))}
      </div>

      {/* Row 2: weight / style / case */}
      <div className="flex items-center gap-1 flex-wrap">
        <button data-opus-button="control" type="button"
          onClick={() => onUpdate(sectionKey, { fontWeight: isBold ? 'normal' : 'bold' })}
          aria-pressed={isBold}
          aria-label={isBold ? 'Remove bold' : 'Bold'}
          className={cn(
            'h-6 w-7 rounded border text-[11px] font-black transition',
            isBold ? 'border-[#1A1A1A] bg-[#1A1A1A] text-white' : 'border-gray-200 text-gray-700 hover:border-gray-400',
          )}
        >B</button>

        <button data-opus-button="control" type="button"
          onClick={() => toggle('italic', true, false)}
          aria-pressed={isItalic}
          aria-label={isItalic ? 'Remove italic' : 'Italic'}
          className={cn(
            'h-6 w-7 rounded border text-[11px] font-bold italic transition',
            isItalic ? 'border-[#1A1A1A] bg-[#1A1A1A] text-white' : 'border-gray-200 text-gray-700 hover:border-gray-400',
          )}
        >I</button>

        <button data-opus-button="control" type="button"
          onClick={() => toggle('uppercase', true, false)}
          aria-pressed={isUppercase}
          aria-label={isUppercase ? 'Remove uppercase' : 'Uppercase'}
          className={cn(
            'h-6 rounded border px-1.5 text-[9px] font-black tracking-[0.06em] transition',
            isUppercase ? 'border-[#1A1A1A] bg-[#1A1A1A] text-white' : 'border-gray-200 text-gray-700 hover:border-gray-400',
          )}
        >AA</button>

        <span className="mx-0.5 h-4 w-px bg-gray-200" aria-hidden="true" />

        {/* Letter spacing */}
        {([
          { value: 'tight'  as const, label: 'A·' },
          { value: 'normal' as const, label: 'A·  ·' },
          { value: 'wide'   as const, label: 'A·   ·' },
          { value: 'wider'  as const, label: 'A·    ·' },
        ]).map(({ value, label }) => (
          <button data-opus-button="control" key={value} type="button"
            onClick={() => onUpdate(sectionKey, { letterSpacing: activeSpacing === value ? undefined : value })}
            aria-pressed={activeSpacing === value}
            aria-label={`Letter spacing: ${value}`}
            title={`Spacing: ${value}`}
            className={cn(
              'h-6 rounded border px-1.5 font-mono text-[9px] tracking-tight transition',
              activeSpacing === value ? 'border-[#1A1A1A] bg-[#1A1A1A] text-white' : 'border-gray-200 text-gray-500 hover:border-gray-400',
            )}
          >{label}</button>
        ))}
      </div>

      {/* Row 3: colour + opacity */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex items-center gap-1.5">
          <label className="text-[10px] font-bold uppercase tracking-[0.12em] text-gray-400">Colour</label>
          <div className="relative flex h-6 w-10 overflow-hidden rounded border border-gray-300 hover:border-gray-500">
            <input
              type="color"
              value={activeColor || '#1A1A1A'}
              onChange={(e) => onUpdate(sectionKey, { color: e.target.value })}
              aria-label="Text colour"
              className="absolute inset-0 h-10 w-14 -translate-x-1 -translate-y-1 cursor-pointer border-0 bg-transparent p-0 opacity-0"
            />
            <span
              className="pointer-events-none absolute inset-0 rounded"
              style={{ backgroundColor: activeColor || 'transparent', border: activeColor ? 'none' : '1px dashed #d1d5db' }}
            />
            {!activeColor && <span className="m-auto text-[9px] text-gray-400">+</span>}
          </div>
          {activeColor && (
            <button data-opus-button="control" type="button"
              onClick={() => onUpdate(sectionKey, { color: undefined })}
              aria-label="Clear colour"
              className="text-gray-400 hover:text-gray-700"
            ><X size={11} /></button>
          )}
        </div>

        <div className="flex items-center gap-1.5">
          <label className="text-[10px] font-bold uppercase tracking-[0.12em] text-gray-400">Opacity</label>
          <input
            type="range" min={0.1} max={1} step={0.05}
            value={activeOpacity}
            onChange={(e) => onUpdate(sectionKey, { opacity: Number(e.target.value) })}
            aria-label="Text opacity"
            className="w-20 accent-[#1A1A1A]"
          />
          <span className="w-7 text-right font-mono text-[10px] text-gray-500">
            {Math.round(activeOpacity * 100)}%
          </span>
        </div>
      </div>

      {/* Reset */}
      {hasOverride && (
        <button data-opus-button="control" type="button"
          onClick={() => onUpdate(sectionKey, {
            scale: undefined, fontWeight: undefined, align: undefined,
            italic: undefined, uppercase: undefined, letterSpacing: undefined,
            color: undefined, opacity: undefined,
          })}
          aria-label="Reset all style overrides"
          className="text-[10px] font-semibold text-gray-400 underline underline-offset-2 hover:text-gray-600"
        >Reset</button>
      )}
    </div>
  )
}

// ─── Shared primitives ────────────────────────────────────────────────────────

function Input({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="h-11 w-full rounded-md border border-gray-300 px-3.5 text-[14px] focus:border-[#1A1A1A] focus:outline-none focus:ring-1 focus:ring-[#1A1A1A]"
    />
  )
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-[13px] font-bold text-gray-900">{label}</label>
      {hint && <p className="mb-1.5 mt-0.5 text-[11px] text-gray-500">{hint}</p>}
      <div className={hint ? '' : 'mt-1.5'}>{children}</div>
    </div>
  )
}

function ReviewRow({
  label, value, onEdit, children,
}: {
  label: string; value: string; onEdit?: () => void; children?: React.ReactNode
}) {
  return (
    <div className="group flex items-start justify-between gap-4 border-b border-gray-100 pb-3">
      <span className="text-[12px] font-bold uppercase tracking-[0.12em] text-gray-500">{label}</span>
      <span className="flex items-center gap-2 text-right text-[13px] font-medium text-gray-900">
        {children}
        {value}
        {onEdit && (
          <button data-opus-button="control"
            type="button"
            onClick={onEdit}
            aria-label={`Edit ${label}`}
            className="ml-0.5 shrink-0 text-gray-400 opacity-0 transition hover:text-gray-900 group-hover:opacity-100"
          >
            <Pencil size={12} />
          </button>
        )}
      </span>
    </div>
  )
}
