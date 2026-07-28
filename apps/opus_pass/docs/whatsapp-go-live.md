# WhatsApp invitations: go-live runbook

How to take the OpusPass "Send Invites" WhatsApp channel from dry-run to live,
the same way Kadify and Kadijanja send invitations: **one shared OpusPass
business number** sends a template message whose header is the couple's paid
invitation card, with three quick-reply buttons that drive RSVP.

The code is already built. This runbook is the Meta-side configuration plus the
five environment variables that flip it on. Nothing here requires a code change.

---

## 1. What is already implemented

| Piece | Where | Status |
| --- | --- | --- |
| Live Meta sender (template + image header + buttons) | `src/lib/whatsapp/meta.ts` | Ready |
| Dry-run stub (no creds → logs only) | `src/lib/whatsapp/stub.ts` | Ready |
| Send action with paid-card quota | `src/lib/dashboard/actions.ts` (`sendWhatsAppInvites`) | Ready |
| Inbound RSVP webhook (verify + button taps) | `src/app/api/whatsapp/webhook/route.ts` | Ready |
| Webhook signature verification | `src/lib/whatsapp/index.ts` (`verifyWebhookSignature`) | Ready |
| Couple-facing dry-run indicator | `SendInvitesView.tsx` ("Dry run" pill) | Ready |

The provider auto-selects: if `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_ACCESS_TOKEN`
and `WHATSAPP_TEMPLATE_NAME` are all set it sends for real, otherwise it stays in
dry-run. So setting the env vars below is the switch.

---

## 2. Meta setup (matches the developer console "Integrate with API" flow)

Use the Meta app you already have (`developers.facebook.com/apps/...` →
WhatsApp → "Integrate with API"). Work top to bottom.

### Step 1. Business Portfolio + WhatsApp Business Account (WABA)

- Confirm the Business Portfolio that owns the production WhatsApp number.
- Note the **WhatsApp Business Account ID** (WABA ID).

### Step 2. Production setup (phone number + token + template)

1. **Add and verify the production phone number** under the WABA. This is the
   single OpusPass number every invite is sent from ("Sent by OpusPass").
2. Copy the **Phone Number ID** (not the phone number itself). →
   `WHATSAPP_PHONE_NUMBER_ID`
3. Create a **System User** in Business Settings, give it the **WhatsApp Business
   Account** asset with full control, and generate a **permanent access token**
   with scopes `whatsapp_business_messaging` and `whatsapp_business_management`. →
   `WHATSAPP_ACCESS_TOKEN`
4. Copy the **App Secret** (App → Settings → Basic → App Secret). →
   `WHATSAPP_APP_SECRET`
5. Create the message template (see section 3) and submit for approval. Once
   approved, its name → `WHATSAPP_TEMPLATE_NAME` and language code →
   `WHATSAPP_TEMPLATE_LANG`.

### Step 3. Business verification

- Complete Meta Business Verification (upload business documents). Required to
  raise messaging limits beyond the trial tier. Sending works in trial mode to a
  small set of test numbers before verification completes.

---

## 3. The message template to submit for approval

Create ONE template; it can carry multiple language versions under the same
name. The shape must match `INVITE_TEMPLATE` in `src/lib/whatsapp/types.ts`
exactly, or the send call will fail.

> **Language field gotcha:** Meta locks a template's language once created —
> it cannot be edited afterward, only deleted and recreated. If you pick the
> wrong language code at creation time (e.g. "English" while the body is
> actually Swahili wording), don't discard the template — the language field
> is only a routing key for the send API and doesn't validate the body's
> actual language. Just set `WHATSAPP_TEMPLATE_LANG` to whatever code the
> template was actually saved under.

- **Name:** `opuspass_send_invite` — OpusFesta's live template (recreated once
  under this name, this time correctly saved as Swahili). Put it in
  `WHATSAPP_TEMPLATE_NAME`; you can use any lowercase/underscore name for a
  fresh deploy, it doesn't have to match this exact string.
- **Category:** Marketing
- **Header:** Image (upload any sample card as the sample media at creation; the
  real card is supplied per send)
- **Body:** three variables, in order `{{1}}` = guest first name, `{{2}}` =
  couple/honoree name, `{{3}}` = event category (Swahili noun, e.g. `harusi` for
  a wedding — see `EVENT_TYPE_LABELS_SW` in `src/lib/dashboard/types.ts`)
- **Buttons:** three Quick Reply buttons, in this exact index order. Button text
  is fixed in the template; OpusPass injects the per-guest payload at send time.

| Index | Button text (Swahili) | Maps to |
| --- | --- | --- |
| 0 | `Asante, Nitafika` | RSVP yes |
| 1 | `Sitafika, Ninaudhuru` | RSVP no |
| 2 | `View Location` | Venue reply |

### Swahili body (`sw`, default)

```
Habari *{{1}}* 💚
Umealikwa kwa furaha kuhudhuria *{{3}}* ya *{{2}}*. Tunatarajia uwepo wako katika siku hii maalum.
Tafadhali thibitisha ujio wako hapa chini 👇
```

`*...*` bolds the interpolated variable (guest name, event category, couple
name). Sample values for Meta review: `{{1}}` = `Fabiola`, `{{2}}` =
`Lilian Nyendo`, `{{3}}` = `harusi`.

### English body (`en`, optional second language under the same name)

```
Hi {{1}} 💚
You're warmly invited to {{2}}'s {{3}}. We look forward to having you there on
this special day.
Please confirm your attendance below 👇
```

> Notes
> - The buttons stay Swahili/English as above to mirror the Kadify/Kadijanja
>   cards; change the text in the Meta template if you want different labels. The
>   button ORDER must stay yes / no / location to match the webhook mapping.
> - `WHATSAPP_TEMPLATE_LANG` selects which language version is sent by default —
>   set it to the code the template was actually SAVED under in Meta, not
>   necessarily the language of the body text (see the gotcha above).
>   `opuspass_send_invite` is saved under Swahili, so `WHATSAPP_TEMPLATE_LANG=sw`
>   (the code default) is correct for it — no override needed.

---

## 3b. Contact Collector + Pledge templates (optional, additional channels)

Two more independent templates power the "Send via WhatsApp" buttons on the
Guests page (Collector link) and the Pledges → Invite tab (pledge link). Both
follow the same shape: image header, 2 body variables, and a single **dynamic
Website URL button** instead of quick replies (tapping it just opens the
public form in the browser — no webhook round-trip needed). See
`COLLECTOR_TEMPLATE` / `PLEDGE_TEMPLATE` in `src/lib/whatsapp/types.ts`.

### `opuspass_collector`

- **Category:** Marketing, **Header:** Image (any generic OpusFesta banner —
  code sends `couples_together.jpg` from `/assets/images` as the live header)
- **Body:** `{{1}}` = contact first name, `{{2}}` = couple name
  ```
  Habari *{{1}}* 💚
  Tunatengeneza orodha ya wageni kwa *{{2}}* na tungependa kupata mawasiliano yako.
  Bonyeza hapa chini kujaza fomu fupi 👇
  ```
- **Button:** type **Website URL**, dynamic, base URL
  `https://opuspass.opusfesta.com/collect/{{1}}`, label `Jaza Fomu`. The code
  supplies just the token as the `{{1}}` suffix.

### `opuspass_pledge`

- Same shape as above, pointed at `/pledge/{{1}}`, label `Changia Sasa`
  ```
  Habari *{{1}}* 💚
  *{{2}}* wanaandaa harusi yao na wangependa mchango wako.
  Bonyeza hapa chini kuweka kiasi utakachochangia 👇
  ```

Sample values for Meta review: `{{1}}` = `Fabiola`, `{{2}}` = `Lilian Nyendo`.

Each template's name/language is configured independently (see env vars in
section 5) — sends silently no-op with an error until its specific vars are
set, they don't block the invite channel or each other.

---

## 4. Register the inbound webhook

The webhook receives button taps and flips each guest's RSVP.

1. In the Meta app → WhatsApp → Configuration → Webhooks, set the callback URL to:
   `https://opuspass.opusfesta.com/api/whatsapp/webhook`
2. Set the **Verify token** to any secret string and put the SAME value in
   `WHATSAPP_WEBHOOK_VERIFY_TOKEN`. Meta calls the URL with a `GET` handshake;
   the route echoes the challenge only when the token matches.
3. Subscribe the WABA to the **`messages`** field.
4. Signature: production POSTs are signed with the App Secret. With
   `WHATSAPP_APP_SECRET` set, the route verifies `X-Hub-Signature-256` and
   rejects forged or unsigned requests with `403`. Leave it unset only in local
   dev (verification is skipped so the stub flow stays testable).

---

## 5. Environment variables (set on Vercel, all environments that send)

```
WHATSAPP_PHONE_NUMBER_ID=            # Step 2.2
WHATSAPP_ACCESS_TOKEN=               # Step 2.3 (permanent system-user token)
WHATSAPP_TEMPLATE_NAME=opuspass_send_invite
WHATSAPP_TEMPLATE_LANG=sw            # Step 3 — code the template was SAVED under in Meta
WHATSAPP_WEBHOOK_VERIFY_TOKEN=       # Step 4.2 (must match Meta)
WHATSAPP_APP_SECRET=                 # Step 2.4 (signs inbound webhooks)

# Optional — Contact Collector + Pledge WhatsApp channels (Step 3b)
WHATSAPP_TEMPLATE_NAME_COLLECTOR=    # e.g. opuspass_collector
WHATSAPP_TEMPLATE_LANG_COLLECTOR=sw
WHATSAPP_TEMPLATE_NAME_PLEDGE=       # e.g. opuspass_pledge
WHATSAPP_TEMPLATE_LANG_PLEDGE=sw
```

Production projects track `borismassesa/opusfesta:main`, so set these on that
Vercel project. After setting them, redeploy.

---

## 6. Verify it is live

1. **Dashboard pill:** open `/my/dashboard/invitations`. The amber "Dry run" pill
   under the Direct invites card disappears once the three send vars are set
   (`whatsappLive` is derived from the provider).
2. **Webhook handshake:** re-saving the webhook in Meta should succeed (green
   check). A failed handshake means the verify token does not match.
3. **Test send:** with a guest who has a phone number, click "Send via WhatsApp".
   Before business verification, the guest's number must be a registered test
   recipient on the WABA. Confirm the message arrives with the card image and the
   three buttons.
4. **Test RSVP:** tap "Asante, Nitafika" on the phone. The guest's RSVP should
   flip to attending on `/my/dashboard/rsvps` and the couple gets a notification.
   Tap "View Location" to receive the venue + Google Maps reply.
5. **Contact Collector / Pledge (once 3b is approved):** on `/my/dashboard/guests`,
   select one or more contacts and click "WhatsApp: Collector link"; on
   `/my/dashboard/pledges` → Invite tab, pick contacts and click "Send to N
   selected". Confirm the message arrives with the CTA button opening the
   right public page.
6. **RSVP reminders:** select already-invited, not-yet-responded guests on
   `/my/dashboard/guests` and click "WhatsApp: RSVP reminder" — reuses the
   approved invite template, no extra Meta approval needed.

---

## 7. Gotchas

- **Paid-card gate.** `sendWhatsAppInvites` only sends when the couple has a paid
  invitation order (it supplies both the header image and the credit quota). A
  couple with no purchased card sees the send do nothing. This is intentional
  monetization; loosen it in `getWhatsAppEntitlement` if you want a default card.
- **Customer-service window.** Business-initiated template messages are always allowed.
  Free-form replies (the "View Location" text) are only delivered if the guest
  has opened an active customer-service conversation, which a button tap satisfies.
- **Template approval lag.** New templates can take minutes to 48-72 hours. The name
  and language in the env vars must exactly match the APPROVED template.
- **Header image must be a public URL.** The card image comes from the paid
  order in Supabase storage; the bucket must be publicly readable for Meta to
  fetch it.
- **Phone format.** Numbers are normalized to E.164-ish digits (Tanzania
  `0XXXXXXXXX` → `255XXXXXXXXX`) in `normalizePhone`. Guests with no phone are
  skipped and reported in the send summary.
