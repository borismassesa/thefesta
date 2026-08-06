import type { SmsPurpose } from './purpose'
import type { SmsLinkSend, SmsProvider, SmsSendResult } from './types'

// Dry-run provider. Used for any purpose whose live-gateway flag is off, and
// everywhere until Beem credentials exist. Mirrors the WhatsApp stub so the
// send pipeline (contact picker, message log, dashboard UI) is testable end to
// end. Never makes a network call.
//
// No `server-only` marker: it holds no credentials and is the fallback the
// provider tests assert against.
export class StubSmsProvider implements SmsProvider {
  readonly name = 'stub'
  readonly live = false
  readonly purpose: SmsPurpose

  constructor(purpose: SmsPurpose) {
    this.purpose = purpose
  }

  async sendLinkRequest(send: SmsLinkSend): Promise<SmsSendResult> {
    console.warn('[sms:stub] would send pledge link request', {
      purpose: this.purpose,
      to: send.to,
      contact: send.contactFirstName,
      link: send.link,
    })
    return { ok: true, dryRun: true, provider: this.name }
  }

  async sendText(to: string, body: string): Promise<SmsSendResult> {
    console.warn('[sms:stub] would send text', { purpose: this.purpose, to, body })
    return { ok: true, dryRun: true, provider: this.name }
  }
}
