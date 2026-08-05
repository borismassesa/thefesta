'use client'

import { useSetPageHeading } from '@/components/PageHeading'

/**
 * Sets the global header for the Digital Cards section. A component rather
 * than a section layout, because the card editor is its own page and must NOT
 * inherit this heading or the section tabs — same split as
 * operations/articles' SetArticlesHeading. It is also why the Custom Card
 * Studio can carry this heading while living at /opus-pass/commissions.
 *
 * The subtitle names both fulfilment paths, because the section now covers
 * both: cards sold from the catalogue and cards made to a brief.
 */
export default function SetDigitalCardsHeading() {
  useSetPageHeading({
    title: 'Digital Cards',
    subtitle: 'The cards we sell, the cards we personalise, and the ones we make from scratch.',
  })
  return null
}
