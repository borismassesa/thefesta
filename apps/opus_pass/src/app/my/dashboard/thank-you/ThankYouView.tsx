'use client'

import { Fragment, useEffect, useMemo, useState, useTransition } from 'react'
import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import Image from 'next/image'
import Link from 'next/link'
import { toast } from 'sonner'
import { useBodyLock } from '@/hooks/useBodyLock'
import {
  MessageCircle,
  ArrowRight,
  Eye,
  X,
  RotateCcw,
  Loader2,
  Lock,
  Clock,
  HeartHandshake,
  Check,
  CalendarHeart,
  CalendarCheck,
  Ticket,
  ClipboardCheck,
  ListChecks,
  Pencil,
} from 'lucide-react'
import {
  sendThankYouMessages,
  sendThankYouTestMessage,
  setThankYouCoverImage,
  applyThankYouCardTemplate,
  type ThankYouSendSummary,
  type WhatsAppSendResult,
} from '@/lib/dashboard/actions'
import { greetingNameOf } from '@/lib/dashboard/share'
import { THANK_YOU_TEMPLATE } from '@/lib/whatsapp/types'
import type { ThankYouData, ThankYouGuestRow } from '@/lib/dashboard/queries'
import { TEMPLATE_CARD_PRICE, parseTemplateCardItemId, type PledgeCardCatalogItem } from '@/lib/dashboard/pledge-card-templates'
import type { DashboardThankYouStrings, CheckoutFormStrings, CheckoutPaymentStrings, DashboardEventScopeStrings } from '@/lib/cms/ui-strings-fallback'
import { EventPicker } from '@/components/dashboard/EventScope'
import TemplatePurchaseModal, { type TemplatePurchaseTarget } from '@/components/dashboard/TemplatePurchaseModal'
import PaymentSummaryModal from '@/components/dashboard/PaymentSummaryModal'
import Confetti from '@/components/digital-cards/Confetti'
import { getLastOrder, setLastOrder, getOrders, getPendingTemplateIds, type StoredOrder } from '@/lib/cart-storage'

/** Substitute `{var}` placeholders in a CMS template with runtime values. */
const fmt = (t: string, v: Record<string, string | number>) =>
  t.replace(/\{(\w+)\}/g, (m, k) => (k in v ? String(v[k]) : m))

/** Render WhatsApp-flavoured text: *bold* spans and newlines. */
function waText(text: string) {
  return text.split('\n').map((line, i) => (
    <Fragment key={i}>
      {i > 0 ? <br /> : null}
      {line.split(/(\*[^*]+\*)/g).map((part, j) =>
        part.startsWith('*') && part.endsWith('*') && part.length > 2 ? (
          <b key={j}>{part.slice(1, -1)}</b>
        ) : (
          <Fragment key={j}>{part}</Fragment>
        ),
      )}
    </Fragment>
  ))
}

/** A queued bulk send awaiting the couple's confirmation. */
interface PendingSend {
  ids?: string[]
  recipients: number
}

export default function ThankYouView({
  data,
  strings,
  coverImageUrl,
  coverIsFullTemplate,
  templateId,
  templateName,
  cardCatalog,
  purchasedTemplateIds,
  contactEmail,
  contactPhone,
  checkoutFormStrings,
  checkoutPaymentStrings,
  scopeStrings,
}: {
  data: ThankYouData
  strings: DashboardThankYouStrings
  scopeStrings: DashboardEventScopeStrings
  coverImageUrl: string | null
  coverIsFullTemplate: boolean
  templateId: string | null
  templateName: string | null
  cardCatalog: PledgeCardCatalogItem[]
  purchasedTemplateIds: string[]
  contactEmail: string
  contactPhone: string | null
  checkoutFormStrings: CheckoutFormStrings
  checkoutPaymentStrings: CheckoutPaymentStrings
}) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const { event, guests, events, selectedEventId, hasFreeCardAccess, whatsappLive } = data
  const eventId = selectedEventId ?? undefined

  const [pending, startTransition] = useTransition()
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<'all' | 'notsent' | 'thanked'>('all')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [confirmSend, setConfirmSend] = useState<PendingSend | null>(null)
  const [report, setReport] = useState<ThankYouSendSummary | null>(null)
  const [previewOpen, setPreviewOpen] = useState(false)
  const [testPhone, setTestPhone] = useState(data.testPhone ?? '')
  const [testSending, setTestSending] = useState(false)

  // Thank-you card: a design applied from the catalog (used as the WhatsApp
  // message's header image) — mirrors the Pledges card-template picker.
  const [cover, setCover] = useState<{
    url: string | null
    isTemplate: boolean
    templateId: string | null
    templateName: string | null
  }>({
    url: coverImageUrl,
    isTemplate: coverIsFullTemplate,
    templateId,
    templateName,
  })
  const [savingCover, startCoverSave] = useTransition()
  const [applyingTemplateId, setApplyingTemplateId] = useState<string | null>(null)
  const [appliedTemplateId, setAppliedTemplateId] = useState<string | null>(null)

  // Cards bought individually (Classic/Essential) — seeded from the paid
  // orders fetched server-side, grown optimistically the moment a purchase
  // resolves so the picker unlocks without a full reload.
  const [purchasedIds, setPurchasedIds] = useState<Set<string>>(() => new Set(purchasedTemplateIds))
  // Cards paid for but still awaiting finance's manual approval — seeded from
  // this device's local order history (see getPendingTemplateIds; the server
  // only tracks paid orders).
  const [pendingTemplateIds, setPendingTemplateIds] = useState<Set<string>>(new Set())
  const [purchaseTarget, setPurchaseTarget] = useState<TemplatePurchaseTarget | null>(null)
  // The order just paid for / submitted — drives the post-purchase summary.
  const [summaryOrder, setSummaryOrder] = useState<StoredOrder | null>(null)
  const canUseCard = (t: PledgeCardCatalogItem) => hasFreeCardAccess || purchasedIds.has(t.id)

  // Resync from the server-fetched prop after router.refresh() (e.g. the
  // card-redirect purchase_ref effect below) — the useState initializer only
  // runs on mount, so without this a card purchase would still show "Locked"
  // until a full page reload even though the server now knows it's paid.
  useEffect(() => {
    setPurchasedIds(new Set(purchasedTemplateIds))
  }, [purchasedTemplateIds])
  // Fires the confetti overlay — a fresh timestamp key so it can re-trigger
  // (and remount) on a second purchase in the same session.
  const [celebrateAt, setCelebrateAt] = useState<number | null>(null)

  useBodyLock(Boolean(confirmSend || report || previewOpen))

  // Seed the "under review" badges from local order history, then re-check
  // each pending order once — approvals happen out-of-band in the finance
  // dashboard, so a couple returning later (no purchase_ref in the URL)
  // still needs to see a design unlock once it's been confirmed.
  useEffect(() => {
    const pendingIds = getPendingTemplateIds('thank_you_card', selectedEventId)
    setPendingTemplateIds(pendingIds)
    if (pendingIds.size === 0) return
    let cancelled = false
    ;(async () => {
      for (const order of getOrders()) {
        if (order.paymentStatus !== 'verifying') continue
        if (selectedEventId && order.eventId !== selectedEventId) continue
        for (const item of order.items) {
          const parsed = parseTemplateCardItemId(item.id)
          if (!parsed || parsed.type !== 'thank_you_card') continue
          try {
            const res = await fetch(`/api/payments/status?ref=${encodeURIComponent(order.ref)}`, { cache: 'no-store' })
            if (!res.ok) continue
            const data = (await res.json()) as { status: string }
            if (cancelled) return
            if (data.status === 'paid') {
              setLastOrder({ ...order, paymentStatus: 'paid' })
              setPurchasedIds((prev) => new Set(prev).add(parsed.templateId))
              setPendingTemplateIds((prev) => {
                const next = new Set(prev)
                next.delete(parsed.templateId)
                return next
              })
            } else if (data.status === 'failed' || data.status === 'expired') {
              setPendingTemplateIds((prev) => {
                const next = new Set(prev)
                next.delete(parsed.templateId)
                return next
              })
            }
          } catch {
            /* transient — leave it pending, next visit will retry */
          }
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  // After a card-redirect purchase, Selcom bounces the buyer back here with
  // `?purchase_ref=...` — confirm it landed and unlock the design.
  useEffect(() => {
    const ref = searchParams.get('purchase_ref')
    if (!ref) return
    let cancelled = false
    ;(async () => {
      for (let attempt = 0; attempt < 5 && !cancelled; attempt++) {
        try {
          const res = await fetch(`/api/payments/status?ref=${encodeURIComponent(ref)}`, { cache: 'no-store' })
          if (res.ok) {
            const data = (await res.json()) as { status: string }
            if (data.status === 'paid') {
              // Promote the local order snapshot (recorded by TemplatePurchaseModal
              // before the Selcom card redirect) so it shows paid on Orders.
              const stored = getLastOrder()
              const paidOrder = stored && stored.ref === ref ? { ...stored, paymentStatus: 'paid' as const } : null
              if (paidOrder) {
                setLastOrder(paidOrder)
                setSummaryOrder(paidOrder)
                for (const item of paidOrder.items) {
                  const parsed = parseTemplateCardItemId(item.id)
                  if (!parsed || parsed.type !== 'thank_you_card') continue
                  if (selectedEventId && paidOrder.eventId !== selectedEventId) continue
                  setPurchasedIds((prev) => new Set(prev).add(parsed.templateId))
                  setPendingTemplateIds((prev) => {
                    const next = new Set(prev)
                    next.delete(parsed.templateId)
                    return next
                  })
                }
              }
              toast.success('Card design unlocked')
              setCelebrateAt(Date.now())
              router.refresh()
              break
            }
            if (data.status === 'failed' || data.status === 'expired') {
              toast.error('That payment did not go through')
              break
            }
          }
        } catch {
          /* transient — retry */
        }
        await new Promise((r) => setTimeout(r, 2500))
      }
      if (!cancelled) {
        const url = new URL(window.location.href)
        url.searchParams.delete('purchase_ref')
        router.replace(`${url.pathname}${url.search}`)
      }
    })()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function useCardTemplate(item: PledgeCardCatalogItem) {
    if (!selectedEventId) return
    setApplyingTemplateId(item.id)
    startCoverSave(async () => {
      try {
        await applyThankYouCardTemplate(selectedEventId, item.imageUrl, item.id, item.name)
        setCover({ url: item.imageUrl, isTemplate: true, templateId: item.id, templateName: item.name })
        setAppliedTemplateId(item.id)
        toast.success(strings.card_applied_toast)
      } catch (err) {
        toast.error(err instanceof Error ? err.message : strings.card_apply_failed)
      } finally {
        setApplyingTemplateId(null)
      }
    })
  }

  function removeCardTemplate(item: PledgeCardCatalogItem) {
    setApplyingTemplateId(item.id)
    setCover({ url: null, isTemplate: false, templateId: null, templateName: null })
    setAppliedTemplateId(null)
    startCoverSave(async () => {
      try {
        await setThankYouCoverImage(selectedEventId, null, false)
        toast.success(strings.card_removed_toast)
      } catch (err) {
        toast.error(err instanceof Error ? err.message : strings.card_remove_failed)
      } finally {
        setApplyingTemplateId(null)
      }
    })
  }

  /** Clear a legacy non-template cover (an uploaded photo, not a catalog
   *  pick) — no catalog item involved, unlike removeCardTemplate. */
  function clearCover() {
    setCover({ url: null, isTemplate: false, templateId: null, templateName: null })
    setAppliedTemplateId(null)
    startCoverSave(async () => {
      try {
        await setThankYouCoverImage(selectedEventId, null, false)
        toast.success(strings.card_removed_toast)
      } catch (err) {
        toast.error(err instanceof Error ? err.message : strings.card_remove_failed)
      }
    })
  }

  const hasPhone = (g: ThankYouGuestRow) => Boolean(g.whatsappPhone || g.phone)

  const notSentCount = guests.filter((g) => !g.thankYouSent).length
  const thankedCount = guests.length - notSentCount

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase()
    return guests.filter((g) => {
      if (filter === 'notsent' && g.thankYouSent) return false
      if (filter === 'thanked' && !g.thankYouSent) return false
      if (!q) return true
      return g.name.toLowerCase().includes(q)
    })
  }, [filter, guests, search])

  const allVisibleSelected = visible.length > 0 && visible.every((g) => selected.has(g.id))
  function toggleAllVisible() {
    setSelected((prev) => {
      const next = new Set(prev)
      if (allVisibleSelected) visible.forEach((g) => next.delete(g.id))
      else visible.forEach((g) => next.add(g.id))
      return next
    })
  }
  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function stageSend(ids?: string[]) {
    const pool = ids ? guests.filter((g) => ids.includes(g.id)) : guests
    const eligible = pool.filter(hasPhone)
    if (eligible.length === 0) {
      toast.error(strings.toast_nothing_sent)
      return
    }
    setConfirmSend({ ids, recipients: eligible.length })
  }

  function runSend() {
    const ids = confirmSend?.ids
    setConfirmSend(null)
    startTransition(async () => {
      try {
        const res = await sendThankYouMessages(ids, eventId)
        if (res.sent === 0 && res.failed === 0 && res.skipped === 0) {
          toast.error(strings.toast_nothing_sent)
          setSelected(new Set())
          return
        }
        const parts = [`${res.sent} ${res.dryRun ? strings.send_verb_dryrun : strings.send_verb_sent}`]
        if (res.failed > 0) parts.push(fmt(strings.send_failed_n, { n: res.failed }))
        if (res.skipped > 0) parts.push(fmt(strings.send_no_phone, { n: res.skipped }))
        const summaryLine = parts.join(' · ')
        if (res.sent > 0) toast.success(summaryLine)
        else toast.error(summaryLine)
        setReport(res)
        setSelected(new Set())
        router.refresh()
      } catch (err) {
        toast.error(err instanceof Error ? err.message : strings.toast_nothing_sent)
      }
    })
  }

  function retryFailed() {
    const ids = report?.results.filter((r) => r.outcome === 'failed').map((r) => r.id)
    setReport(null)
    if (ids && ids.length) stageSend(ids)
  }

  async function sendTest() {
    if (!testPhone.trim()) return
    setTestSending(true)
    try {
      const res = await sendThankYouTestMessage(testPhone, eventId)
      if (res.ok) toast.success(res.dryRun ? strings.toast_test_dryrun : strings.toast_test_sent)
      else toast.error(res.error || strings.toast_test_failed)
    } finally {
      setTestSending(false)
    }
  }

  const sampleGuest = greetingNameOf(guests[0]?.name ?? 'Amina')
  const previewBody = THANK_YOU_TEMPLATE.body
    .replace('{{1}}', sampleGuest)
    .replace('{{2}}', event.coupleName)
    .replace('{{3}}', event.eventCategorySw)
  const selectedCatalogCard = cover.templateId
    ? cardCatalog.find((t) => t.id === cover.templateId) ?? null
    : cover.url
      ? cardCatalog.find((t) => t.imageUrl === cover.url) ?? null
      : null
  const selectedThankYouCard = cover.url
    ? {
        id: selectedCatalogCard?.id ?? cover.templateId ?? null,
        name: selectedCatalogCard?.name ?? cover.templateName ?? (cover.isTemplate ? strings.card_heading : strings.card_uploaded_label),
        imageUrl: cover.url,
      }
    : null
  const selectedCardEditHref = selectedThankYouCard?.id
    ? `/digital-cards/p/${selectedThankYouCard.id}/customise${
        selectedEventId ? `?event=${encodeURIComponent(selectedEventId)}` : ''
      }`
    : null

  const inviteHref = (tab: 'saveDates' | 'cards' | 'responses' | 'followups' | 'ticket' | 'checkins') => {
    const qs = new URLSearchParams()
    qs.set('tab', tab)
    if (selectedEventId) qs.set('event', selectedEventId)
    return `/my/dashboard/invitations?${qs.toString()}`
  }

  const reportGroups: { label: string; outcome: WhatsAppSendResult['outcome'] }[] = [
    { label: strings.results_failed, outcome: 'failed' },
    { label: strings.results_skipped, outcome: 'skipped' },
    { label: strings.results_sent, outcome: 'sent' },
  ]

  return (
    <div className="ty">
      <style>{css}</style>

      <div className="head dash-header-safe">
        <div className="headcopy">
          <h1>{strings.heading}</h1>
          <div className="subrow">
            <p className="sub">{strings.subheading}</p>
            <EventPicker
              events={events}
              selectedId={selectedEventId ?? ''}
              strings={scopeStrings}
              disabled={pending}
              className="headpicker"
            />
          </div>
        </div>
      </div>

      <div className="sendtabs" role="tablist">
        <Link role="tab" aria-selected={false} className="stb" href={inviteHref('saveDates')}>
          <CalendarHeart size={14} /> Save the dates
        </Link>
        <Link role="tab" aria-selected={false} className="stb" href={inviteHref('cards')}>
          <MessageCircle size={14} /> Digital Cards
        </Link>
        <Link role="tab" aria-selected={false} className="stb" href={inviteHref('responses')}>
          <ClipboardCheck size={14} /> Guest Responses
        </Link>
        <Link role="tab" aria-selected={false} className="stb" href={inviteHref('followups')}>
          <ListChecks size={14} /> Follow-up Questions
        </Link>
        <Link role="tab" aria-selected={false} className="stb" href={inviteHref('ticket')}>
          <Ticket size={14} /> Entrance Pass Ticket
        </Link>
        <Link role="tab" aria-selected={false} className="stb" href={inviteHref('checkins')}>
          <CalendarCheck size={14} /> Live Check-ins
        </Link>
        <button role="tab" aria-selected className="stb on" type="button">
          <HeartHandshake size={14} /> Thank you
          {guests.length > 0 ? <span className="stbcnt">{guests.length}</span> : null}
        </button>
      </div>

      {/* Thank-you card: a design pulled from the invitation catalog, used as
          the WhatsApp message's header image — same picker as the Pledges
          page's card templates. Sending itself is never gated (see below);
          only picking a free template card is, with the same
          request-to-unlock flow Pledges uses for Classic/Essential. */}
      <div className="cardpicker">
        <div className="cphead">
          <h2>{strings.card_heading} Templates</h2>
          <p className="mutedp">{strings.card_desc}</p>
        </div>
        {cover.url && !cover.isTemplate ? (
          <div className="curcover">
            <div className="curthumb">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={cover.url} alt="" />
            </div>
            <div>
              <p>{strings.card_uploaded_label}</p>
              <button type="button" className="linkbtn" disabled={savingCover} onClick={clearCover}>
                {strings.card_remove}
              </button>
            </div>
          </div>
        ) : null}
        {cardCatalog.length ? (
          <div className="cardgridwrap">
            <div className="cardgrid">
              {cardCatalog.map((t) => {
                const isApplying = applyingTemplateId === t.id && savingCover
                const isApplied = appliedTemplateId === t.id || (cover.isTemplate && cover.url === t.imageUrl)
                const usable = canUseCard(t)
                const isPending = !usable && pendingTemplateIds.has(t.id)
                return (
                  <div
                    key={t.id}
                    title={t.name}
                    className={`cardtile ${isApplied ? 'on' : ''} ${!usable ? 'locked' : ''}`}
                  >
                    <div className="cardimg">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={t.imageUrl} alt={t.name} />
                      {isPending ? (
                        <span className="cardlockbadge pending"><Clock size={12} /> Under review</span>
                      ) : !usable ? (
                        <span className="cardlockbadge"><Lock size={12} /> {strings.card_locked_badge}</span>
                      ) : isApplied ? (
                        <span className="cardcheck"><Check size={12} strokeWidth={3} /></span>
                      ) : null}
                    </div>
                    <p className="cardname">{t.name}</p>
                    {usable ? (
                      <button
                        type="button"
                        className="cardbtn"
                        disabled={savingCover}
                        onClick={() => (isApplied ? removeCardTemplate(t) : useCardTemplate(t))}
                      >
                        {isApplying ? (
                          <Loader2 size={12} className="spin" />
                        ) : isApplied ? (
                          strings.card_applied
                        ) : (
                          strings.card_use
                        )}
                      </button>
                    ) : isPending ? (
                      <button type="button" className="cardbtn cardpendingbtn" disabled>
                        <Clock size={12} /> Payment under review
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="cardbtn cardbuybtn"
                        onClick={() =>
                          setPurchaseTarget({
                            templateId: t.id,
                            templateName: t.name,
                            templateImageUrl: t.imageUrl,
                            templateType: 'thank_you_card',
                          })
                        }
                      >
                        {fmt(strings.card_unlock_cta, { fee: TEMPLATE_CARD_PRICE.toLocaleString() })}
                      </button>
                    )}
                  </div>
                )
              })}
            </div>
            {cardCatalog.length > 6 ? <div className="cardfade" aria-hidden /> : null}
          </div>
        ) : (
          <p className="mutedp">{strings.card_none}</p>
        )}
      </div>

      {selectedThankYouCard ? (
        <div className="selectedcard">
          <div className="selectedmedia">
            <Image
              src={selectedThankYouCard.imageUrl}
              alt={`${selectedThankYouCard.name} thank-you card`}
              fill
              sizes="220px"
              quality={90}
              className="object-cover"
              unoptimized
            />
            <span className="selectedbadge">
              <Check size={12} /> Your thank-you card
            </span>
          </div>
          <div className="selectedmain">
            <div className="selectedtop">
              <div>
                <h3>Your thank-you card</h3>
                <p>
                  This card appears at the top of the thank-you WhatsApp message before it is sent to attending guests.
                </p>
              </div>
            </div>

            <div className="selectedlinkrow">
              <div className="selectedlink">
                <span>Selected design</span>
                <b>{selectedThankYouCard.name}</b>
              </div>
            </div>

            <div className="selectedtools">
              <div className="selectedactions">
                {selectedCardEditHref ? (
                  <Link className="btn ghost" href={selectedCardEditHref}>
                    <Pencil size={14} /> Edit card
                  </Link>
                ) : null}
                <button className="btn ghost" disabled={pending} onClick={() => setPreviewOpen(true)}>
                  <Eye size={14} /> {strings.preview_test}
                </button>
                <button
                  type="button"
                  className="btn ghost"
                  disabled={savingCover}
                  onClick={() => (selectedCatalogCard ? removeCardTemplate(selectedCatalogCard) : clearCover())}
                >
                  <X size={14} /> {strings.card_remove}
                </button>
              </div>
              <div className="selectednote">
                <span>{event.eventName ?? event.coupleName}</span>
                <span>{guests.length} attending guests</span>
                <span>{notSentCount} not sent</span>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {purchaseTarget ? (
        <TemplatePurchaseModal
          target={purchaseTarget}
          price={TEMPLATE_CARD_PRICE}
          eventId={selectedEventId}
          contact={{ name: event.coupleName, email: contactEmail, phone: contactPhone }}
          returnPath={`${pathname}${selectedEventId ? `?event=${selectedEventId}` : ''}`}
          formStrings={checkoutFormStrings}
          paymentStrings={checkoutPaymentStrings}
          onClose={() => setPurchaseTarget(null)}
          onPurchaseSubmitted={(result) => {
            if (result.status === 'paid') {
              setPurchasedIds((prev) => new Set(prev).add(purchaseTarget.templateId))
              setCelebrateAt(Date.now())
            }
            if (result.status === 'processing') {
              setPendingTemplateIds((prev) => new Set(prev).add(purchaseTarget.templateId))
            }
            if (result.order) setSummaryOrder(result.order)
            setPurchaseTarget(null)
          }}
        />
      ) : null}

      {celebrateAt ? <Confetti key={celebrateAt} /> : null}

      {summaryOrder ? <PaymentSummaryModal order={summaryOrder} onClose={() => setSummaryOrder(null)} /> : null}

      <div className="gt">
        <div className="tyguesthead">
          <h3>Send to your guests</h3>
          <p>Send each attending guest their thank-you message via WhatsApp — individually or in bulk.</p>
        </div>
        <div className="gth">
          <input
            type="checkbox"
            className="ck"
            checked={allVisibleSelected}
            onChange={toggleAllVisible}
            aria-label={strings.select_all_aria}
          />
          <h2>Guest list</h2>
          <input
            className="gsearch"
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={strings.search_placeholder}
            aria-label={strings.search_aria}
          />
          <div className="acts">
            <div className="seg" role="tablist" aria-label="Thank-you status">
              <button className={`sg ${filter === 'all' ? 'on' : ''}`} onClick={() => setFilter('all')}>
                All{guests.length ? ` ${guests.length}` : ''}
              </button>
              <button className={`sg ${filter === 'notsent' ? 'on' : ''}`} onClick={() => setFilter('notsent')}>
                Not sent{notSentCount ? ` ${notSentCount}` : ''}
              </button>
              <button className={`sg ${filter === 'thanked' ? 'on' : ''}`} onClick={() => setFilter('thanked')}>
                Thanked{thankedCount ? ` ${thankedCount}` : ''}
              </button>
            </div>
            {selected.size > 0 ? <span className="selcnt">{fmt(strings.selected_count, { n: selected.size })}</span> : null}
            <button className="btn ghost" disabled={pending} onClick={() => setPreviewOpen(true)}>
              <Eye size={14} /> {strings.preview_test}
            </button>
            <button
              className="btn send"
              disabled={pending || selected.size === 0}
              onClick={() => stageSend([...selected])}
            >
              {strings.send_to_selected} <ArrowRight size={15} />
            </button>
          </div>
        </div>
        {visible.length === 0 ? (
          <div className="empty">{search.trim() ? strings.empty_search : strings.empty_none}</div>
        ) : (
          <div className="scroll">
            <table>
              <thead>
                <tr>
                  <th style={{ width: 30 }}></th>
                  <th>{strings.th_guest}</th>
                  <th>{strings.th_contact}</th>
                  <th>Preferred channel</th>
                  <th>{strings.th_status}</th>
                  <th style={{ textAlign: 'right' }}>{strings.th_send}</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((g) => (
                  <tr key={g.id}>
                    <td>
                      <input
                        type="checkbox"
                        className="ck"
                        checked={selected.has(g.id)}
                        onChange={() => toggleOne(g.id)}
                      />
                    </td>
                    <td className="who">{g.name}</td>
                    <td className="contact">{g.whatsappPhone || g.phone || strings.no_phone}</td>
                    <td>
                      <span className="pillselect pill-whatsapp">
                        <MessageCircle size={13} /> WhatsApp
                      </span>
                    </td>
                    <td>
                      <span className={`status ${g.thankYouSent ? 's-yes' : 's-none'}`}>
                        {g.thankYouSent ? strings.status_thanked : strings.status_notsent}
                      </span>
                    </td>
                    <td>
                      <div className="ra">
                        <button
                          className="ia send"
                          disabled={pending || !hasPhone(g)}
                          onClick={() => stageSend([g.id])}
                        >
                          <HeartHandshake size={13} /> {g.thankYouSent ? strings.row_resend : strings.row_send}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Bulk send confirm — no {{2}}/{{3}} to approve, both are already
          resolved from the couple's saved invite settings. */}
      {confirmSend ? (
        <div className="ovl" onClick={() => setConfirmSend(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>{strings.confirm_title}</h3>
            <p className="big">{fmt(strings.confirm_body, { n: confirmSend.recipients })}</p>
            <div className="mrow">
              <button className="btn ghost" onClick={() => setConfirmSend(null)}>{strings.confirm_cancel}</button>
              <button className="btn ghost" onClick={() => { setConfirmSend(null); setPreviewOpen(true) }}>
                <Eye size={14} /> {strings.preview_test}
              </button>
              <button className="btn send" disabled={pending} onClick={runSend}>
                <MessageCircle size={15} /> {strings.confirm_confirm}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* Message preview + test send */}
      {previewOpen ? (
        <div className="ovl" onClick={() => setPreviewOpen(false)}>
          <div className="modal wide" data-lenis-prevent onClick={(e) => e.stopPropagation()}>
            <div className="mhead">
              <h3>{strings.preview_title}</h3>
              <button className="xbtn" onClick={() => setPreviewOpen(false)} aria-label={strings.preview_close}><X size={16} /></button>
            </div>
            <p className="mutedp">{strings.preview_note}</p>
            <div className="pgrid">
              <div>
                <div className="testrow">
                  <label htmlFor="ty-test-phone">{strings.test_label}</label>
                  <div className="trow">
                    <input
                      id="ty-test-phone"
                      value={testPhone}
                      onChange={(e) => setTestPhone(e.target.value)}
                      placeholder={strings.test_placeholder}
                      inputMode="tel"
                    />
                    <button className="btn solid" disabled={testSending || !testPhone.trim()} onClick={sendTest}>
                      {testSending ? <Loader2 size={14} className="spin" /> : <MessageCircle size={14} />} {strings.test_send}
                    </button>
                  </div>
                  {!whatsappLive ? <p className="mutedp">{strings.test_dryrun_note}</p> : null}
                </div>
              </div>
              <div className="wawrap">
                <div className="wabubble">
                  {cover.url ? (
                    <Image src={cover.url} alt="" width={760} height={1064} className="waimgfull" unoptimized />
                  ) : (
                    <div className="waimg">
                      <div className="waimg-ph"><b>{event.coupleName}</b></div>
                    </div>
                  )}
                  <div className="wabody">{waText(previewBody)}</div>
                  <div className="wafoot">{THANK_YOU_TEMPLATE.footer}</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {/* Send report drawer */}
      {report ? (
        <div className="ovl right" onClick={() => setReport(null)}>
          <div className="drawer" data-lenis-prevent onClick={(e) => e.stopPropagation()}>
            <div className="mhead">
              <h3>{strings.results_title}</h3>
              <button className="xbtn" onClick={() => setReport(null)} aria-label={strings.results_close}><X size={16} /></button>
            </div>
            <div className="dsum">
              <span className="ds ok">{report.sent} {strings.results_sent}</span>
              {report.failed > 0 ? <span className="ds bad">{report.failed} {strings.results_failed}</span> : null}
              {report.skipped > 0 ? <span className="ds warn">{report.skipped} {strings.results_skipped}</span> : null}
            </div>
            <div className="dlist">
              {reportGroups.map(({ label, outcome }) => {
                const rows = report.results.filter((r) => r.outcome === outcome)
                if (rows.length === 0) return null
                return (
                  <div key={outcome} className="dgroup">
                    <div className={`dglabel ${outcome}`}>{label}</div>
                    {rows.map((r) => (
                      <div key={r.id} className="drow">
                        <span className="dname">{r.name}</span>
                        {r.error ? <span className="derr">{r.error}</span> : null}
                      </div>
                    ))}
                  </div>
                )
              })}
            </div>
            <div className="mrow">
              {report.failed > 0 ? (
                <button className="btn ghost" disabled={pending} onClick={retryFailed}>
                  <RotateCcw size={14} /> {strings.results_retry}
                </button>
              ) : null}
              <button className="btn pri" onClick={() => setReport(null)}>{strings.results_close}</button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}

const css = `
.ty{ --purple:#6B3FA0; --purple-d:#4A2870; --lav:#D7BDE8; --lav-btn:#DCC3EC; --lav-soft:#F6EEFB;
  --ink:#1c1b1f; --muted:#8b8790; --faint:#b6b2ba; --line:#ededf0; --hover:#faf8fc;
  --wa:#25D366; --amber-bg:#FFFBEB; --amber-bd:#FBE8B0; --amber-tx:#8a6d1a;
  --ok-bg:#EAF6EF; --ok-tx:#2E7D55; --bad-bg:#fcecec; --bad-tx:#c0392b;
  --radius:16px; --soft:0 1px 2px rgba(20,18,30,.05);
  color:var(--ink); }
/* Headings use the dashboard's default sans (like Overview, Guests, Pledges),
   not this view's own Cormorant serif, so the thank-you page matches the rest
   of the dashboard. The .serif class stays for any deliberate accent. */
.ty .serif{ font-family:var(--font-cormorant),Georgia,serif; }
.ty h1{ font-weight:700; font-size:30px; letter-spacing:-.3px; }
.ty .head{ display:flex; align-items:flex-start; justify-content:space-between; gap:16px; flex-wrap:wrap; }
.ty .headcopy{ min-width:0; flex:1; }
/* Subheading row carries the event picker at its right end, matching the
   Send Invites console so the control sits in the same place on every tab. */
.ty .subrow{ display:flex; align-items:center; justify-content:space-between; gap:12px; flex-wrap:wrap; margin-top:6px; }
.ty .subrow .sub{ min-width:240px; flex:1; margin-top:0; }
.ty .headpicker{ margin-left:auto; }
@media (min-width:1024px){
  .ty .subrow{ width:calc(100% + 15rem); }
}
.ty .sub{ color:var(--muted); font-size:14px; max-width:640px; line-height:1.5; }
.ty .sendtabs{ display:flex; flex-wrap:wrap; align-items:center; gap:10px 18px; margin-top:22px;
  border-top:1px solid var(--line); border-bottom:1px solid var(--line); padding-top:12px; }
.ty .stb{ display:inline-flex; align-items:center; gap:7px; margin-bottom:-9px; background:none; border:none;
  border-bottom:2px solid transparent; padding:0 0 14px; color:var(--muted); font-size:14px; font-weight:600; cursor:pointer; text-decoration:none; }
.ty .stb:hover{ color:var(--ink); }
.ty .stb.on{ border-bottom-color:var(--ink); color:var(--ink); font-weight:700; }
.ty .stbcnt{ display:inline-flex; align-items:center; justify-content:center; min-width:20px; height:20px;
  border-radius:999px; background:var(--lav-soft); color:var(--purple-d); padding:0 6px; font-size:11px; }
.ty .stb.on .stbcnt{ background:var(--ink); color:#fff; }
.ty .gt{ background:#fff; border:1px solid var(--line); border-radius:var(--radius); margin-top:24px; box-shadow:var(--soft); overflow:hidden; }
.ty .cardpicker{ background:#fff; border:1px solid var(--line); border-radius:20px; margin:22px 0 18px; padding:18px 20px; box-shadow:var(--soft); }
.ty .cphead h2{ font-size:16px; font-weight:700; }
.ty .curcover{ display:flex; align-items:flex-start; gap:10px; margin-top:14px; padding:10px; border:1px solid var(--line); border-radius:12px; background:var(--hover); }
.ty .curthumb{ width:56px; height:56px; flex:none; border-radius:8px; overflow:hidden; border:1px solid var(--line); }
.ty .curthumb img{ width:100%; height:100%; object-fit:cover; display:block; }
.ty .curcover p{ font-size:13px; font-weight:600; }
.ty .linkbtn{ border:none; background:none; padding:0; margin-top:4px; font-size:11.5px; font-weight:600; color:var(--bad-tx); cursor:pointer; text-decoration:underline; text-underline-offset:2px; }
.ty .linkbtn:disabled{ opacity:.5; cursor:not-allowed; }
/* 6 cards visible at the lg breakpoint, fewer (with horizontal scroll) on
   smaller viewports — same breakpoint math as the Pledges card picker
   (auto-cols-[42%]/[31%]/[23%]/6-up), just expressed as plain CSS. */
.ty .cardgridwrap{ position:relative; margin-top:14px; }
.ty .cardgrid{ display:flex; gap:10px; overflow-x:auto; padding-bottom:4px; scroll-snap-type:x mandatory; -ms-overflow-style:none; scrollbar-width:none; }
.ty .cardgrid::-webkit-scrollbar{ display:none; }
.ty .cardfade{ position:absolute; right:0; top:0; bottom:4px; width:40px; pointer-events:none;
  background:linear-gradient(to left, #fff, transparent); display:none; }
@media(min-width:1024px){ .ty .cardfade{ display:block; } }
.ty .cardtile{ position:relative; width:210px; flex:0 0 210px; scroll-snap-align:start; border:1px solid var(--line); border-radius:12px; padding:8px; }
.ty .cardtile.on{ border-color:var(--wa); box-shadow:0 0 0 1px var(--wa); }
.ty .cardimg{ position:relative; aspect-ratio:5/7; width:100%; border-radius:8px; overflow:hidden; background:var(--hover); }
.ty .cardimg img{ width:100%; height:100%; object-fit:cover; display:block; }
.ty .cardcheck{ position:absolute; top:6px; right:6px; width:20px; height:20px; border-radius:50%; background:var(--wa); color:#fff; display:grid; place-items:center; }
.ty .cardlockbadge{ position:absolute; inset:0; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:4px;
  background:rgba(28,27,31,.45); color:#fff; font-size:10px; font-weight:600; }
.ty .cardlockbadge.pending{ background:rgba(138,109,26,.72); }
.ty .cardpendingbtn{ border-color:var(--amber-bd); background:var(--amber-bg); color:var(--amber-tx); cursor:not-allowed; }
.ty .cardname{ margin-top:6px; font-size:11px; font-weight:600; line-height:1.3; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.ty .cardbtn{ margin-top:7px; min-height:28px; width:100%; border:1px solid #C9A0DC; background:#C9A0DC; border-radius:999px; padding:6px 8px; font-size:10.5px; font-weight:700; color:#1A1A1A; cursor:pointer; display:flex; align-items:center; justify-content:center; gap:5px; }
.ty .cardbtn:hover:not(:disabled){ filter:brightness(.95); }
.ty .cardbtn:disabled{ opacity:.5; cursor:not-allowed; }
.ty .cardtile.on .cardbtn{ border-color:var(--wa); color:var(--ok-tx); background:var(--ok-bg); }
.ty .cardbuybtn{ border-color:var(--ink); background:var(--ink); color:#fff; }
.ty .cardbuybtn:hover:not(:disabled){ background:var(--ink); opacity:.9; }
.ty .selectedcard{ display:flex; margin:22px 0 24px; overflow:hidden; background:#fff; border:1px solid var(--line);
  border-radius:20px; box-shadow:var(--soft); }
.ty .selectedmedia{ position:relative; width:190px; min-height:266px; flex:none; overflow:hidden; background:linear-gradient(155deg,var(--purple),var(--lav)); }
.ty .selectedbadge{ position:absolute; left:10px; top:10px; display:inline-flex; align-items:center; gap:5px; border-radius:999px;
  background:rgba(255,255,255,.95); padding:4px 9px; color:var(--ok-tx); font-size:10.5px; font-weight:700; box-shadow:var(--soft); }
.ty .selectedmain{ min-width:0; flex:1; padding:22px; display:flex; flex-direction:column; justify-content:center; gap:16px; }
.ty .selectedtop{ display:flex; align-items:flex-start; justify-content:space-between; gap:14px; flex-wrap:wrap; }
.ty .selectedtop h3{ font-size:19px; font-weight:600; color:var(--ink); }
.ty .selectedtop p{ margin-top:5px; max-width:620px; color:var(--muted); font-size:13.5px; line-height:1.5; }
.ty .selectedlinkrow{ display:flex; align-items:center; gap:9px; }
.ty .selectedlink{ min-width:0; flex:1; border:1px solid var(--line); border-radius:12px; background:#fff; padding:10px 12px;
  color:var(--muted); font-size:13px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.ty .selectedlink span{ margin-right:10px; color:var(--faint); font-size:10.5px; font-weight:700; letter-spacing:.6px; text-transform:uppercase; }
.ty .selectedlink b{ color:var(--ink); font-weight:700; }
.ty .selectedtools{ display:flex; align-items:center; gap:12px; flex-wrap:wrap; }
.ty .selectedactions{ display:flex; align-items:center; gap:8px; flex-wrap:wrap; }
.ty .selectednote{ margin-left:auto; display:flex; flex-wrap:wrap; gap:8px; }
.ty .selectednote span{ display:inline-flex; align-items:center; border-radius:999px; background:var(--hover); border:1px solid var(--line);
  padding:5px 10px; color:var(--muted); font-size:12px; font-weight:600; }
.ty .tyguesthead{ padding:22px 20px 0; }
.ty .tyguesthead h3{ font-size:17px; font-weight:700; color:var(--ink); }
.ty .tyguesthead p{ margin-top:6px; color:var(--muted); font-size:13.5px; line-height:1.45; }
.ty .tyguesthead + .gth{ border-top:none; }
.ty .gth{ display:flex; align-items:center; gap:14px; padding:18px 20px; border-bottom:1px solid var(--line); flex-wrap:wrap; }
.ty .gth h2{ font-size:18px; font-weight:600; }
.ty .gth .gsearch{ flex:0 1 240px; min-width:150px; border:1px solid var(--line); border-radius:10px;
  padding:8px 12px; font-size:13px; color:var(--ink); background:#fff; }
.ty .gth .gsearch:focus{ outline:none; border-color:var(--lav); }
.ty .gth .acts{ margin-left:auto; display:flex; gap:9px; align-items:center; flex-wrap:wrap; }
.ty .selcnt{ font-size:12px; font-weight:600; color:var(--purple-d); background:var(--lav-soft); padding:5px 11px; border-radius:999px; }
.ty .seg{ display:inline-flex; border:1px solid var(--line); border-radius:10px; overflow:hidden; }
.ty .seg .sg{ display:inline-flex; align-items:center; gap:4px; background:#fff; border:none; padding:8px 12px; font-size:12.5px; font-weight:600; color:var(--muted); cursor:pointer; }
.ty .seg .sg + .sg{ border-left:1px solid var(--line); }
.ty .seg .sg.on{ background:var(--lav-soft); color:var(--purple-d); }
.ty .seg .sg:hover:not(.on){ background:var(--hover); }
.ty .btn{ border:none; border-radius:999px; font-weight:600; font-size:13.5px; padding:9px 16px; cursor:pointer;
  display:inline-flex; align-items:center; gap:7px; transition:filter .12s, transform .08s; text-decoration:none; }
.ty .btn:hover{ filter:brightness(.97); transform:translateY(-1px); }
.ty .btn:disabled{ opacity:.5; cursor:not-allowed; transform:none; }
.ty .btn.ghost{ background:#fff; color:var(--ink); border:1px solid var(--line); }
.ty .btn.solid{ background:var(--purple); color:#fff; box-shadow:var(--soft); }
.ty .btn.send{ background:var(--wa); color:#fff; box-shadow:var(--soft); }
.ty .btn.send:hover{ filter:brightness(1.06); background:var(--wa); }
.ty .btn.pri{ background:var(--lav-btn); color:var(--purple-d); box-shadow:var(--soft); }
.ty .spin{ animation:ty-spin .8s linear infinite; }
@keyframes ty-spin{ to{ transform:rotate(360deg); } }
.ty .empty{ padding:40px 20px; text-align:center; color:var(--muted); font-size:14px; }
.ty .scroll{ overflow-x:auto; }
.ty table{ width:100%; border-collapse:collapse; font-size:13.5px; min-width:720px; }
.ty th{ text-align:left; font-size:10.5px; letter-spacing:.6px; text-transform:uppercase; color:var(--faint);
  padding:12px 20px; border-bottom:1px solid var(--line); font-weight:600; position:sticky; top:0; background:#fff; z-index:1; }
.ty td{ padding:14px 20px; border-bottom:1px solid var(--line); }
.ty tr:last-child td{ border-bottom:none; }
.ty tbody tr:hover td{ background:var(--hover); }
.ty .who{ font-weight:600; } .ty .contact{ color:var(--muted); font-size:12px; }
.ty .ck{ width:15px; height:15px; accent-color:var(--purple); }
.ty .status{ display:inline-flex; align-items:center; font-size:11.5px; font-weight:600; padding:4px 11px; border-radius:999px; }
.ty .s-none{ background:#f3f2f5; color:var(--muted); }
.ty .s-yes{ background:var(--ok-bg); color:var(--ok-tx); }
.ty .pillselect{ display:inline-flex; align-items:center; gap:5px; border-radius:999px; padding:4px 10px; font-size:11.5px;
  font-weight:600; border:1px solid var(--line); background:#fff; }
.ty .pillselect.pill-whatsapp{ color:#1a8a4a; border-color:#bfe8d2; background-color:#eefaf3; }
.ty .ra{ display:flex; gap:7px; justify-content:flex-end; align-items:center; }
.ty .ia{ height:32px; min-width:32px; padding:0 8px; border-radius:9px; border:1px solid var(--line); background:#fff; cursor:pointer;
  display:inline-flex; align-items:center; justify-content:center; gap:6px; font-size:12px; font-weight:600; color:var(--ink); }
.ty .ia:hover{ background:var(--hover); border-color:var(--lav); }
.ty .ia:disabled{ opacity:.45; cursor:not-allowed; }
.ty .ia.send{ background:var(--wa); border-color:var(--wa); color:#fff; padding:0 12px; font-size:12.5px; }
.ty .ia.send:hover{ filter:brightness(1.06); background:var(--wa); }

/* Overlays: confirm modal, preview modal, report drawer */
.ty .ovl{ position:fixed; inset:0; background:rgba(28,27,31,.42); z-index:60; display:flex; align-items:center; justify-content:center; padding:18px; }
.ty .ovl.right{ justify-content:flex-end; padding:0; }
.ty .modal{ background:#fff; border-radius:18px; padding:24px; width:min(440px,100%); box-shadow:0 18px 50px rgba(20,18,30,.25); }
.ty .modal.wide{ width:min(760px,96vw); max-height:92vh; overflow-y:auto; overscroll-behavior:contain; }
.ty .pgrid{ display:grid; grid-template-columns:1fr 1fr; gap:20px; margin-top:16px; align-items:start; }
@media(max-width:640px){ .ty .pgrid{ grid-template-columns:1fr; } }
.ty .modal h3{ font-size:21px; font-weight:600; }
.ty .modal .big{ font-size:14.5px; margin-top:12px; line-height:1.5; }
.ty .mutedp{ color:var(--muted); font-size:12.5px; margin-top:8px; line-height:1.5; }
.ty .mrow{ display:flex; justify-content:flex-end; gap:10px; margin-top:20px; }
.ty .mhead{ display:flex; align-items:center; justify-content:space-between; gap:10px; }
.ty .xbtn{ border:none; background:#f3f2f5; color:var(--muted); width:30px; height:30px; border-radius:50%; cursor:pointer;
  display:grid; place-items:center; }
.ty .wawrap{ margin-top:16px; background:#F3F3F5; border-radius:14px; padding:18px; display:flex; align-items:center; justify-content:center; }
.ty .wabubble{ background:#fff; border-radius:10px; padding:6px; width:min(340px,100%); margin:0 auto;
  box-shadow:0 1px 1px rgba(0,0,0,.08); font-size:13.5px; line-height:1.45; }
.ty .waimg{ position:relative; width:100%; aspect-ratio:4/3; border-radius:7px; overflow:hidden; background:linear-gradient(155deg,var(--purple),var(--lav)); }
.ty .waimgfull{ display:block; width:100%; height:auto; border-radius:7px; }
.ty .waimg-ph{ position:absolute; inset:0; display:grid; place-items:center; color:#fff; font-family:var(--font-cormorant),Georgia,serif; font-size:18px; }
.ty .wabody{ padding:9px 6px 4px; color:#111; white-space:normal; }
.ty .wafoot{ padding:0 6px 8px; color:#8a8a8a; font-size:11px; }
.ty .testrow label{ font-size:12px; font-weight:600; color:var(--muted); }
.ty .trow{ display:flex; gap:9px; margin-top:8px; }
.ty .trow input{ flex:1; border:1px solid var(--line); border-radius:10px; padding:9px 12px; font-size:13px; }
.ty .trow input:focus{ outline:none; border-color:var(--lav); }
.ty .drawer{ background:#fff; width:min(420px,94vw); height:100%; padding:22px; overflow-y:auto; display:flex; flex-direction:column;
  box-shadow:-16px 0 40px rgba(20,18,30,.18); animation:ty-slide .18s ease-out; }
@keyframes ty-slide{ from{ transform:translateX(24px); opacity:.4 } to{ transform:none; opacity:1 } }
.ty .drawer h3{ font-size:20px; font-weight:600; }
.ty .dsum{ display:flex; gap:8px; flex-wrap:wrap; margin-top:14px; }
.ty .ds{ font-size:12px; font-weight:600; padding:5px 11px; border-radius:999px; }
.ty .ds.ok{ background:var(--ok-bg); color:var(--ok-tx); }
.ty .ds.bad{ background:var(--bad-bg); color:var(--bad-tx); }
.ty .ds.warn{ background:var(--amber-bg); color:var(--amber-tx); border:1px solid var(--amber-bd); }
.ty .dlist{ margin-top:16px; flex:1; }
.ty .dgroup{ margin-bottom:16px; }
.ty .dglabel{ font-size:10.5px; font-weight:700; letter-spacing:.8px; text-transform:uppercase; color:var(--faint); padding-bottom:6px; }
.ty .dglabel.failed{ color:var(--bad-tx); } .ty .dglabel.skipped{ color:var(--amber-tx); }
.ty .drow{ display:flex; align-items:baseline; gap:8px; padding:7px 0; border-bottom:1px solid var(--line); font-size:13px; flex-wrap:wrap; }
.ty .dname{ font-weight:600; }
.ty .derr{ font-size:11.5px; color:var(--bad-tx); }

@media(max-width:760px){ .ty .selectedcard{ flex-direction:column; }
  .ty .selectedmedia{ width:100%; min-height:0; aspect-ratio:5/7; }
  .ty .selectedtools{ align-items:stretch; flex-direction:column; }
  .ty .selectedactions{ width:100%; }
  .ty .selectedactions .btn{ justify-content:center; flex:1; } }
@media(max-width:640px){ .ty .gth .acts{ margin-left:0; width:100%; justify-content:flex-start; } }
`
