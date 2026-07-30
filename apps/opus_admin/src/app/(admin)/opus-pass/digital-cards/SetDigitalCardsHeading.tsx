'use client'

import { useSetPageHeading } from '@/components/PageHeading'

/**
 * Sets the global header for the Digital Cards catalogue. A component rather
 * than a section layout, because the card editor is its own page and must NOT
 * inherit this heading or the section tabs — same split as
 * operations/articles' SetArticlesHeading.
 */
export default function SetDigitalCardsHeading() {
  useSetPageHeading({
    title: 'Digital Cards',
    subtitle: 'The card catalogue and the design system behind it.',
  })
  return null
}
