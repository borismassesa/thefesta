import type { EntrancePassSend } from './types'

/**
 * Build the Meta component list for an entrance-pass delivery.
 *
 * Pure and separately tested because the presence of one component must match
 * the exact Meta template selected by the server-only provider.
 */
export function entrancePassComponents(
  send: EntrancePassSend,
  walletTemplate: boolean
): Record<string, unknown>[] {
  const components: Record<string, unknown>[] = [
    { type: 'header', parameters: [{ type: 'image', image: { link: send.headerImageUrl } }] },
    {
      type: 'body',
      parameters: [
        { type: 'text', text: send.guestName },
        { type: 'text', text: send.eventCategory },
        { type: 'text', text: send.coupleName },
        { type: 'text', text: send.dateLabel },
        { type: 'text', text: send.timeLabel },
        { type: 'text', text: send.venue },
      ],
    },
  ]

  if (walletTemplate && send.walletToken) {
    components.push({
      type: 'button',
      sub_type: 'url',
      index: '0',
      // Encode the colon in WMT1:<secret> so the dynamic parameter remains a
      // single URL path segment in every WhatsApp client.
      parameters: [{ type: 'text', text: encodeURIComponent(send.walletToken) }],
    })
  }

  return components
}
