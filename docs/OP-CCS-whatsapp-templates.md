# OP-CCS — WhatsApp templates to register in Meta

Ten templates, each in **English and Kiswahili** (Meta approves per language, so
that is 20 submissions). PRD §11 flags this as the long pole: approval is slow
and is not something engineering can unblock, so submit before the rest of the
launch checklist is finished.

Source of truth for copy and parameter order:
`apps/opus_pass/src/lib/commission/templates.ts`.

## The rule that will bite you

**Parameter order is frozen once approved.** The dispatcher sends positional
parameters, so if a template is later edited to reorder `{{1}}` and `{{2}}`, the
right words arrive in the wrong places — someone else's name against your order
number, and no error anywhere. If a template needs to change, register a new
one and change `whatsappTemplate` in `templates.ts`; do not re-order an
existing one.

## What happens when a template is missing

Nothing breaks and nothing is lost. `dispatcher.ts` treats a Meta rejection as
a **permanent** failure for that channel and falls back to SMS, then email. So
the feature is shippable before approval lands — customers just receive SMS
instead of WhatsApp, at SMS cost. The templates are an optimisation of channel
and price, not a blocker.

## Category

All are **UTILITY** (transactional, tied to an order the customer placed), not
MARKETING. Submitting them as MARKETING invites rejection and makes delivery
subject to marketing opt-outs.

## The templates

| Name | Params (in order) | When it fires |
|---|---|---|
| `claim_your_order` | first_name, order_no, link | Order created at checkout |
| `deposit_confirmed` | first_name, order_no, link | Deposit verified (Selcom or Finance) |
| `deposit_shortfall` | order_no, shortfall, link | Payment verified but short of the gate |
| `card_request_information` | first_name, order_no, link | Brief incomplete, reminder cadence |
| `task_assigned` | designer_name, order_no, link | Task assigned to a designer |
| `card_ready_for_review` | first_name, order_no, link | QA passed, preview released |
| `balance_due` | first_name, order_no, amount, link | Customer approved; invoice raised |
| `balance_reminder` | first_name, order_no, amount, link | Chase cadence, overdue, forfeiture |
| `balance_settled` | first_name, order_no, link | Balance verified in full |
| `card_send_to_guest` | order_no, link | Card published to the event |

### Suggested bodies

Meta wants the literal template text. These match `templates.ts`; keep them in
sync when either changes.

**`balance_due` — EN**
> Thank you {{1}}. You have approved your card ({{2}}). Pay the balance of {{3}}
> and your full-resolution files are released immediately: {{4}}

**`balance_due` — SW**
> Asante {{1}}. Umeidhinisha kadi yako ({{2}}). Salio la {{3}} likilipwa, faili
> lako kamili hutolewa mara moja: {{4}}

**`deposit_shortfall` — EN**
> We received your payment for order {{1}}, but {{2}} is still needed. What you
> have paid is credited and safe. Pay the remainder here: {{3}}

**`deposit_shortfall` — SW**
> Tumepokea malipo yako kwa oda {{1}}, lakini bado kuna {{2}} inayohitajika.
> Malipo uliyofanya yamehifadhiwa. Lipa kiasi kilichobaki hapa: {{3}}

The remaining eight follow the same pattern; copy them from
`renderCommissionMessage()` in `templates.ts`, which holds both languages
side by side precisely so a missing translation is visible rather than silently
falling back to English.

## Environment

| Variable | Purpose |
|---|---|
| `WHATSAPP_PHONE_NUMBER_ID` | Existing — shared with the guest-invite pipeline |
| `WHATSAPP_ACCESS_TOKEN` | Existing |
| `COMMISSION_CRON_SECRET` | Guards `/api/commission/cron/sweep`. The route refuses to run without it |
| `COMMISSION_FINANCE_ALERT_EMAIL` | Comma-separated; Finance desk alerts |
| `COMMISSION_OPS_ALERT_EMAIL` | Comma-separated; Ops alerts |
| `LIPA_NAMBA_MERCHANT_NUMBER` | Shown to buyers paying manually |
| `SELCOM_WEBHOOK_SECRET` | HMAC verification on the payment callback |

Staff alerts go to a **desk address**, not to individuals, so a staffing change
does not silently stop them. Customer recipients are resolved from the order;
staff recipients are resolved at send time rather than frozen at enqueue, so
alerts follow whoever holds the role now.

## Kiswahili review

PRD §11 open question 9 asks who owns translation review. The copy in
`templates.ts` is a working draft written for clarity on a phone, not a
certified translation — have a native reviewer read it before submission, since
correcting an approved template means re-approval.
