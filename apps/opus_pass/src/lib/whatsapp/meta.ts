import 'server-only'
import {
  BTN,
  type EntrancePassSend,
  type InviteSend,
  type LinkRequestKind,
  type LinkSend,
  type SendResult,
  type ThankYouSend,
  type WhatsAppProvider,
} from './types'

// Meta WhatsApp Cloud API provider. Sends business-initiated template messages
// with an image header + dynamic body + quick-reply buttons whose payloads
// carry the guest token. Swappable: implements the same WhatsAppProvider
// interface as the stub, so a future 360dialog/Twilio impl drops in here.

const GRAPH_VERSION = 'v21.0'

export interface MetaConfig {
  phoneNumberId: string
  accessToken: string
  templateName: string
  defaultLanguage: string
}

/** Returns Meta config when fully set, else null (→ caller falls back to stub). */
export function readMetaConfig(): MetaConfig | null {
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN
  const templateName = process.env.WHATSAPP_TEMPLATE_NAME
  if (!phoneNumberId || !accessToken || !templateName) return null
  return {
    phoneNumberId,
    accessToken,
    templateName,
    defaultLanguage: process.env.WHATSAPP_TEMPLATE_LANG || 'sw',
  }
}

/** Per-kind template name + language for the collector/pledge link-request
 *  templates. Independently configured since each needs its own Meta
 *  approval; null when that specific kind's template isn't set up yet. */
function readLinkTemplateConfig(kind: LinkRequestKind): { templateName: string; language: string } | null {
  // Each kind is a separately approved Meta template, so each gets its own
  // env pair. A missing one returns null rather than falling back to another
  // kind's template — sending a pledge template for a card-details request
  // would put the wrong link in front of a couple.
  const envPrefix = { collector: 'COLLECTOR', pledge: 'PLEDGE', card_details: 'CARD_DETAILS' }[kind]
  const templateName = process.env[`WHATSAPP_TEMPLATE_NAME_${envPrefix}`]
  if (!templateName) return null
  return {
    templateName,
    language: process.env[`WHATSAPP_TEMPLATE_LANG_${envPrefix}`] || 'sw',
  }
}

/** Entrance-pass template name + language — independently configured since
 *  it needs its own Meta approval (see ENTRANCE_PASS_TEMPLATE); null until
 *  that template is submitted and approved. */
function readEntrancePassTemplateConfig(): { templateName: string; language: string } | null {
  const templateName = process.env.WHATSAPP_TEMPLATE_NAME_ENTRANCE_PASS
  if (!templateName) return null
  return {
    templateName,
    language: process.env.WHATSAPP_TEMPLATE_LANG_ENTRANCE_PASS || 'sw',
  }
}

/** Thank-you template name + language — independently configured since it
 *  needs its own Meta approval (see THANK_YOU_TEMPLATE); null until that
 *  template is submitted and approved. */
function readThankYouTemplateConfig(): { templateName: string; language: string } | null {
  const templateName = process.env.WHATSAPP_TEMPLATE_NAME_THANK_YOU
  if (!templateName) return null
  return {
    templateName,
    language: process.env.WHATSAPP_TEMPLATE_LANG_THANK_YOU || 'sw',
  }
}

export class MetaWhatsAppProvider implements WhatsAppProvider {
  readonly name = 'meta'
  readonly live = true
  private cfg: MetaConfig

  constructor(cfg: MetaConfig) {
    this.cfg = cfg
  }

  private endpoint(): string {
    return `https://graph.facebook.com/${GRAPH_VERSION}/${this.cfg.phoneNumberId}/messages`
  }

  private async post(body: unknown): Promise<SendResult> {
    try {
      const res = await fetch(this.endpoint(), {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.cfg.accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      })
      const json = (await res.json()) as {
        messages?: { id: string }[]
        error?: { message?: string }
      }
      if (!res.ok) {
        return { ok: false, error: json.error?.message || `HTTP ${res.status}` }
      }
      return { ok: true, wamid: json.messages?.[0]?.id }
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : 'network error' }
    }
  }

  async sendInvite(send: InviteSend): Promise<SendResult> {
    const payload = (kind: string) => `${kind}:${send.token}:${send.eventId ?? ''}`
    return this.post({
      messaging_product: 'whatsapp',
      to: send.to,
      type: 'template',
      template: {
        name: this.cfg.templateName,
        language: { code: send.languageCode || this.cfg.defaultLanguage },
        components: [
          { type: 'header', parameters: [{ type: 'image', image: { link: send.headerImageUrl } }] },
          {
            type: 'body',
            parameters: [
              { type: 'text', text: send.guestFirstName }, // {{1}}
              { type: 'text', text: send.coupleName }, // {{2}}
              { type: 'text', text: send.eventCategory }, // {{3}}
            ],
          },
          // Button labels ("Asante, Nitafika" / "Sitafika, Ninaudhuru" / "View
          // Location") are fixed in the approved template; only the payload (with
          // the guest token) is dynamic. See INVITE_TEMPLATE for the spec.
          { type: 'button', sub_type: 'quick_reply', index: '0', parameters: [{ type: 'payload', payload: payload(BTN.RSVP_YES) }] },
          { type: 'button', sub_type: 'quick_reply', index: '1', parameters: [{ type: 'payload', payload: payload(BTN.RSVP_NO) }] },
          { type: 'button', sub_type: 'quick_reply', index: '2', parameters: [{ type: 'payload', payload: payload(BTN.VIEW_LOCATION) }] },
        ],
      },
    })
  }

  async sendEntrancePass(send: EntrancePassSend): Promise<SendResult> {
    const cfg = readEntrancePassTemplateConfig()
    if (!cfg) return { ok: false, error: 'WhatsApp entrance-pass template is not configured' }
    return this.post({
      messaging_product: 'whatsapp',
      to: send.to,
      type: 'template',
      template: {
        name: cfg.templateName,
        language: { code: send.languageCode || cfg.language },
        components: [
          { type: 'header', parameters: [{ type: 'image', image: { link: send.headerImageUrl } }] },
          {
            type: 'body',
            parameters: [
              { type: 'text', text: send.guestName }, // {{1}}
              { type: 'text', text: send.eventCategory }, // {{2}}
              { type: 'text', text: send.coupleName }, // {{3}}
              { type: 'text', text: send.dateLabel }, // {{4}}
              { type: 'text', text: send.timeLabel }, // {{5}}
              { type: 'text', text: send.venue }, // {{6}}
            ],
          },
          // No buttons — see ENTRANCE_PASS_TEMPLATE.
        ],
      },
    })
  }

  async sendLinkRequest(kind: LinkRequestKind, send: LinkSend): Promise<SendResult> {
    const linkCfg = readLinkTemplateConfig(kind)
    if (!linkCfg) return { ok: false, error: `WhatsApp ${kind} template is not configured` }
    const urlSuffix = send.eventId ? `${send.token}?event=${send.eventId}` : send.token
    return this.post({
      messaging_product: 'whatsapp',
      to: send.to,
      type: 'template',
      template: {
        name: linkCfg.templateName,
        language: { code: send.languageCode || linkCfg.language },
        components: [
          { type: 'header', parameters: [{ type: 'image', image: { link: send.headerImageUrl } }] },
          {
            type: 'body',
            parameters: [
              { type: 'text', text: send.contactFirstName }, // {{1}}
              { type: 'text', text: send.coupleName }, // {{2}}
            ],
          },
          // The CTA button's base URL (e.g. https://opuspass.opusfesta.com/collect/{{1}})
          // is fixed in the approved template; only the trailing token/query
          // suffix is dynamic.
          { type: 'button', sub_type: 'url', index: '0', parameters: [{ type: 'text', text: urlSuffix }] },
        ],
      },
    })
  }

  async sendThankYou(send: ThankYouSend): Promise<SendResult> {
    const cfg = readThankYouTemplateConfig()
    if (!cfg) return { ok: false, error: 'WhatsApp thank-you template is not configured' }
    return this.post({
      messaging_product: 'whatsapp',
      to: send.to,
      type: 'template',
      template: {
        name: cfg.templateName,
        language: { code: send.languageCode || cfg.language },
        components: [
          { type: 'header', parameters: [{ type: 'image', image: { link: send.headerImageUrl } }] },
          {
            type: 'body',
            parameters: [
              { type: 'text', text: send.guestFirstName }, // {{1}}
              { type: 'text', text: send.coupleName }, // {{2}}
              { type: 'text', text: send.eventCategory }, // {{3}}
            ],
          },
          // No buttons — see THANK_YOU_TEMPLATE.
        ],
      },
    })
  }

  async sendText(to: string, body: string): Promise<SendResult> {
    return this.post({
      messaging_product: 'whatsapp',
      to,
      type: 'text',
      text: { body },
    })
  }
}
