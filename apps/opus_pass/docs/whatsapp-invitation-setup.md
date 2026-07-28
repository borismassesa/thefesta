# WhatsApp invitation — Meta setup

How to create the WhatsApp message template that renders as a **hero card +
RSVP buttons** (the Kadify/Kadijanja-style message) and connect it to the
OpusPass code. The app code is already built; this is the external Meta setup
the owner does once.

```
┌─────────────────────────────────┐
│   HERO CARD  (IMAGE header)     │  ← the card the couple paid for, supplied
│                                 │     per-message as a public image link
├─────────────────────────────────┤
│ Habari {{1}},                   │  ← BODY  {{1}} = guest first name
│ Karibu kwenye sherehe ya {{2}}. │          {{2}} = couple name
│ Tafadhali thibitisha ujio... 💚 │
├─────────────────────────────────┤
│ ↩ Asante, Nitafika              │  ← QUICK_REPLY → RSVP attending
│ ↩ Sitafika, Ninaudhuru          │  ← QUICK_REPLY → RSVP declined
│ ↩ View Location                 │  ← QUICK_REPLY → bot replies with venue+map
└─────────────────────────────────┘
```

The canonical spec also lives in code at `src/lib/whatsapp/types.ts`
(`INVITE_TEMPLATE`). Keep the two in sync.

---

## 0. Prerequisites (one-time)

1. A **Meta Business account** with **business verification** completed.
2. A **WhatsApp Business Account (WABA)** + a dedicated **phone number** (NOT a
   number already used in the consumer WhatsApp / WhatsApp Business app).
3. A **Meta app** (type: Business) with the **WhatsApp** product added.
4. A **permanent access token** (create a System User in Business Settings,
   assign the app, generate a token with `whatsapp_business_messaging` +
   `whatsapp_business_management`).

From the WhatsApp → API Setup page, note: **Phone number ID** and **WABA ID**.

---

## 1. Create the template (WhatsApp Manager UI — easiest)

business.facebook.com → **WhatsApp Manager** → **Manage templates** → **Create template**.

- **Category:** Marketing
- **Name:** `opuspass_invitation`  (lowercase + underscores; this becomes
  `WHATSAPP_TEMPLATE_NAME`)
- **Language:** Swahili (`sw`)  (this becomes `WHATSAPP_TEMPLATE_LANG`)

**Header** → type **Media → Image**. Upload ANY representative card image as the
sample (used only for the approval preview; real sends supply each couple's own
card per message).

**Body** (paste exactly, then fill the sample values):
```
Habari {{1}},
Karibu kwenye sherehe ya {{2}}. Tafadhali thibitisha ujio wako 💚
```
Samples: `{{1}}` = `Asha`, `{{2}}` = `Asha & Juma`.

**Buttons** → add **Quick reply** ×3, in this exact order and text:
1. `Asante, Nitafika`
2. `Sitafika, Ninaudhuru`
3. `View Location`

Submit → approval takes minutes to 48-72h.

> The button **text** is fixed by this approved template. The app supplies the
> dynamic **payload** per send (`rsvp_yes:<token>` / `rsvp_no:<token>` /
> `view_location:<token>`) so a tap maps back to the right guest.

### Or create it via API
Needs a sample-image `header_handle` from the Resumable Upload API first; then:
```bash
curl -X POST "https://graph.facebook.com/v21.0/<WABA_ID>/message_templates" \
  -H "Authorization: Bearer <ACCESS_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "opuspass_invitation",
    "language": "sw",
    "category": "MARKETING",
    "components": [
      { "type": "HEADER", "format": "IMAGE",
        "example": { "header_handle": ["<SAMPLE_IMAGE_HANDLE>"] } },
      { "type": "BODY",
        "text": "Habari {{1}},\nKaribu kwenye sherehe ya {{2}}. Tafadhali thibitisha ujio wako 💚",
        "example": { "body_text": [["Asha", "Asha & Juma"]] } },
      { "type": "BUTTONS", "buttons": [
        { "type": "QUICK_REPLY", "text": "Asante, Nitafika" },
        { "type": "QUICK_REPLY", "text": "Sitafika, Ninaudhuru" },
        { "type": "QUICK_REPLY", "text": "View Location" }
      ] }
    ]
  }'
```

---

## 2. Configure the webhook

Meta app → **WhatsApp → Configuration**:
- **Callback URL:** `https://opuspass.opusfesta.com/api/whatsapp/webhook`
- **Verify token:** the value you set for `WHATSAPP_WEBHOOK_VERIFY_TOKEN`
- Click **Verify and save** (our route answers the GET handshake), then
  **Subscribe** to the **`messages`** field.

Button taps now POST to that route → the app flips the guest's RSVP and, for
**View Location**, replies with the venue + Google Maps link.

---

## 3. Set the env vars (Vercel → opus_pass)

```
WHATSAPP_PHONE_NUMBER_ID      = <from API Setup>
WHATSAPP_ACCESS_TOKEN         = <system-user permanent token>
WHATSAPP_TEMPLATE_NAME        = opuspass_invitation
WHATSAPP_TEMPLATE_LANG        = sw
WHATSAPP_WEBHOOK_VERIFY_TOKEN = <same secret used in step 2>
```

When all are present the app sends for real; if any is missing it falls back to
the **dry-run stub** (logs, no send) so the dashboard still works.

---

## Gotchas

- **Header image format:** the per-message image link must be a **public HTTPS
  JPG/PNG ≤ 5 MB**. If a couple's paid card is stored as **SVG**, add a raster
  step before sending (Meta rejects SVG headers).
- **Category = Marketing:** business-initiated, billed per conversation;
  recipients can block/report — follow opt-in norms.
- **View Location reply:** allowed because the guest's tap opens an active
  customer-service window, within which the free-form text reply is permitted.
- **Quota:** sending is gated by what the couple paid for (sum of `guests`
  across paid orders); see `getWhatsAppEntitlement()` / `sendWhatsAppInvites()`.
