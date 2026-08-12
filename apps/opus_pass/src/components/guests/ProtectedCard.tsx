'use client'

import { useEffect, useRef, type CSSProperties, type ReactNode } from 'react'

// The browser-side half of card protection, and the weaker half by a distance.
//
// Be clear about what this is: a DETERRENT. It removes the one-gesture ways to
// take a card — right-click → Save image as, drag to the desktop, long-press →
// Add to Photos, print to PDF — and it removes nothing else. A screenshot key
// defeats all of it, and no web technique has ever changed that.
//
// The protection that actually bites is on the server: the artwork a public
// visitor can reach is a preview-width raster behind a short-lived token,
// carrying their own trace code (see lib/cards/protected-art.ts and
// @opusfesta/lib/card-protection). This component exists so the easy paths are
// closed too, because most copying is casual rather than determined.
//
// Three things it deliberately does NOT do, each because the cost lands on a
// real user and the benefit does not exist:
//
//   Intercept Ctrl/Cmd+S or Ctrl/Cmd+P. Both sit in the browser's own menu two
//   clicks away, so trapping the chord stops nobody, and a document-level key
//   handler breaks screen readers and password managers bound to the same keys.
//   Printing is handled in CSS instead — same effect, no accessibility cost.
//
//   preventDefault on touchstart. It would suppress the iOS save sheet and ALSO
//   every scroll gesture that happens to begin on the card, which on a phone is
//   most of them. `-webkit-touch-callout: none` closes the same sheet and
//   leaves scrolling alone.
//
//   Blank the card when the tab loses focus. It fires on every alt-tab, so the
//   card is missing exactly when a guest switches to WhatsApp to reply, and a
//   screen recorder captures the un-blanked frames regardless.

type Props = {
  children: ReactNode
  /** Wrapper classes. The shield is positioned against this box. */
  className?: string
  /**
   * Copy shown where the card would have printed.
   *
   * Required rather than defaulted: it is the only thing a guest sees if they
   * try to print, and a default would reach production in English on a page the
   * couple set to Swahili.
   */
  printNotice: string
}

/**
 * Wraps card artwork and closes the one-gesture copy routes.
 *
 * Usage note: the shield covers the whole box, so anything INTERACTIVE inside
 * stops receiving clicks. Put buttons and links as siblings of this wrapper,
 * never as children.
 */
export function ProtectedCard({ children, className = '', printNotice }: Props) {
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const root = rootRef.current
    if (!root) return

    // Scoped to this subtree rather than the document: a page-wide contextmenu
    // trap would also kill right-click inside the RSVP form's text inputs,
    // where the browser keeps spell-check and paste.
    const swallow = (event: Event) => event.preventDefault()
    root.addEventListener('contextmenu', swallow)
    root.addEventListener('dragstart', swallow)

    return () => {
      root.removeEventListener('contextmenu', swallow)
      root.removeEventListener('dragstart', swallow)
    }
  }, [])

  return (
    <div
      ref={rootRef}
      className={`op-protected relative isolate ${className}`}
      data-op-protected="true"
    >
      {children}

      {/*
        The shield. A transparent layer over the artwork, so a right-click, a
        long-press, or a drag lands on an empty span rather than on the <img>
        underneath. Without it, "Save image as" still finds the image.

        pointer-events stay ON — receiving the pointer is the entire job. It
        carries no content, so assistive tech skips it either way and the
        artwork's own alt text still describes the card.
      */}
      <span
        aria-hidden="true"
        className="op-protected-shield absolute inset-0 z-10 block"
      />

      {/* Replaces the artwork on paper. Hidden on screen. */}
      <span className="op-protected-print-notice" aria-hidden="true">
        {printNotice}
      </span>
    </div>
  )
}

/**
 * Inline style companion for surfaces that render artwork without this wrapper.
 *
 * Exported so the storefront's own grid tiles can carry the same non-selectable,
 * non-draggable behaviour without nesting a wrapper inside every card link.
 */
export const protectedImageStyle: CSSProperties = {
  userSelect: 'none',
  WebkitUserSelect: 'none',
  WebkitTouchCallout: 'none',
  pointerEvents: 'none',
}
