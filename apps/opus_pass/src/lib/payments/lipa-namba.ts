// OpusFesta's manual M-Pesa Lipa Namba details, and the Selcom feature flag.
//
// Pulled out of the digital-cards checkout because a second surface now takes
// payments (the invitation top-up on the dashboard). Two copies of a merchant
// number is one copy too many: if it ever changes, one of them would keep
// sending customers' money to the old account.
//
// Pure constants, no 'server-only' — both callers are client components.

// Automated Selcom payments (M-Pesa STK push + card) are gated behind this
// flag. Until OpusFesta has a Selcom merchant account it stays OFF and both
// checkouts use only the manual Lipa Namba flow: the customer pays externally
// and enters their name, phone, and transaction reference; the OpusFesta team
// confirms it.
export const SELCOM_ENABLED = process.env.NEXT_PUBLIC_PAYMENTS_SELCOM_ENABLED === 'true'

// The TIPS / Tan QR merchant number from the official Vodacom
// "Pesa ni M-Pesa" merchant poster.
export const MPESA_LIPA_NAMBA = '350298654'
export const MPESA_LIPA_NAME = 'OPUSFESTA COMPANY LIMITED'
/** Ordinary M-Pesa "send money" number, for payers whose phone or bank app
 *  cannot reach a Lipa Namba till. Quoted on quotations beside the till number
 *  so whoever is paying has a route that works for them. */
export const MPESA_SEND_MONEY = '+255 799 242 471'

/** Phone shapes the payment forms accept. Mirrors PHONE_RE in the initiate route. */
export const PHONE_RE = /^\+?(?:[\d](?:[\s().-]?)){9,}$/
/** M-Pesa confirmation-code shape. Mirrors PAYREF_RE in the initiate route. */
export const PAYREF_RE = /^[A-Za-z0-9.\-]{6,25}$/
