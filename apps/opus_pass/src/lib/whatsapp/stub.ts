import 'server-only'
import type {
  EntrancePassSend,
  InviteSend,
  LinkRequestKind,
  LinkSend,
  SendResult,
  ThankYouSend,
  WhatsAppProvider,
} from './types'

// Dry-run provider used until a live Meta WABA + approved template exist. Logs
// what WOULD be sent and returns a synthetic wamid, so the whole pipeline
// (image generation, send queue, message log, dashboard UI) is testable end to
// end without an account. Never makes a network call.
export class StubWhatsAppProvider implements WhatsAppProvider {
  readonly name = 'stub'
  readonly live = false

  private fakeWamid(): string {
    // Deterministic-ish without Math.random (avoids non-determinism in tests).
    return `wamid.STUB-${Buffer.from(`${this.counter++}`).toString('hex')}`
  }
  private counter = 0

  async sendInvite(send: InviteSend): Promise<SendResult> {
    console.warn('[whatsapp:stub] would send invite', {
      to: send.to,
      guest: send.guestName,
      category: send.eventCategory,
      header: send.headerImageUrl,
      token: send.token,
    })
    return { ok: true, wamid: this.fakeWamid(), dryRun: true }
  }

  async sendEntrancePass(send: EntrancePassSend): Promise<SendResult> {
    console.warn('[whatsapp:stub] would send entrance pass', {
      to: send.to,
      guest: send.guestName,
      event: `${send.eventCategory} ya ${send.coupleName}`,
      header: send.headerImageUrl,
    })
    return { ok: true, wamid: this.fakeWamid(), dryRun: true }
  }

  async sendLinkRequest(kind: LinkRequestKind, send: LinkSend): Promise<SendResult> {
    console.warn(`[whatsapp:stub] would send ${kind} link request`, {
      to: send.to,
      contact: send.contactFirstName,
      header: send.headerImageUrl,
      token: send.token,
      eventId: send.eventId ?? null,
    })
    return { ok: true, wamid: this.fakeWamid(), dryRun: true }
  }

  async sendThankYou(send: ThankYouSend): Promise<SendResult> {
    console.warn('[whatsapp:stub] would send thank-you', {
      to: send.to,
      guest: send.guestFirstName,
      event: `${send.eventCategory} ya ${send.coupleName}`,
      header: send.headerImageUrl,
    })
    return { ok: true, wamid: this.fakeWamid(), dryRun: true }
  }

  async sendText(to: string, body: string): Promise<SendResult> {
    console.warn('[whatsapp:stub] would send text', { to, body })
    return { ok: true, wamid: this.fakeWamid(), dryRun: true }
  }
}
