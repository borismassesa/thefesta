# Payment Methods & Escrow System

## Overview

**ALL payment methods** (card payments and mobile money) use the same escrow system where funds are held by OpusFesta and released after work completion.

## Payment Methods Supported

### 1. Card Payments (Debit/Credit Cards) ✅
- **Provider:** Stripe
- **Methods:** STRIPE_CARD, STRIPE_BANK
- **Flow:** Payment → OpusFesta Account → Escrow Hold → Release

### 2. Mobile Money ✅
- **Providers:** M-PESA, Airtel Money, Tigo Pesa, Halo Pesa
- **Flow:** Payment → Receipt Upload → Verification → Escrow Hold → Release

## Card Payment Escrow Flow

### Step 1: Payment Intent Creation
```typescript
// Payment intent created on OpusFesta's Stripe account
stripe.paymentIntents.create({
  amount: 1000, // in cents
  currency: 'usd',
  // NO transfer_data - goes to OpusFesta
  // NO application_fee - handled in escrow
  metadata: { invoice_id, inquiry_id }
});
```

**Result:** Payment goes to **OpusFesta's Stripe account** (not vendor's)

### Step 2: Payment Success
- Customer's card is charged
- Funds captured to OpusFesta's account
- Webhook fires: `payment_intent.succeeded`

### Step 3: Escrow Hold Created
- Database trigger automatically creates `escrow_holds` record
- 10% platform fee → Collected immediately
- 90% vendor amount → Held in escrow
- Status: `HELD`

### Step 4: Work Completion
- Vendor completes work
- Work marked as completed
- Funds ready for release

### Step 5: Fund Release
- After 48-72 hours (or manual release)
- Transfer created to vendor's Stripe Connect account
- 90% transferred to vendor
- Status: `RELEASED`

## Mobile Money Escrow Flow

### Step 1: Payment Submission
- Customer makes payment to vendor's mobile money number
- Customer uploads receipt
- Payment record created with status `PENDING`

### Step 2: Receipt Verification
- Vendor verifies receipt
- Payment status → `SUCCEEDED`
- Escrow hold created automatically

### Step 3-5: Same as Card Payments
- Escrow hold created
- Work completion
- Fund release

## Key Differences

| Aspect | Card Payments | Mobile Money |
|--------|---------------|--------------|
| **Payment Processing** | Stripe (automatic) | Manual (receipt upload) |
| **Verification** | Automatic (webhook) | Manual (vendor verifies receipt) |
| **Escrow Creation** | Automatic on success | Automatic after verification |
| **Release** | Same (after work completion) | Same (after work completion) |

## Verification: Card Payments Go to OpusFesta

### ✅ Confirmed
1. **Payment Intent Creation** (`stripe.ts`)
   - No `transfer_data` parameter
   - No `application_fee_amount` parameter
   - Payment goes to OpusFesta's account

2. **Webhook Handler** (`webhook/stripe/route.ts`)
   - Updates payment status to `SUCCEEDED`
   - Does NOT transfer funds immediately
   - Database trigger creates escrow hold

3. **Escrow Release** (`escrow/[id]/release/route.ts`)
   - Only transfers funds when escrow is released
   - Uses `stripe.transfers.create()` to vendor's account

## Code Verification

### Payment Intent (Correct - Goes to OpusFesta)
```typescript
// apps/website/src/lib/payments/stripe.ts
stripe.paymentIntents.create({
  amount: request.amount,
  currency: request.currency.toLowerCase(),
  // ✅ NO transfer_data
  // ✅ NO application_fee_amount
  // ✅ Payment goes to OpusFesta's account
});
```

### Webhook Handler (Correct - Creates Escrow)
```typescript
// apps/website/src/app/api/payments/webhook/stripe/route.ts
await supabaseAdmin.from("payments").update({
  status: "SUCCEEDED",
  // ✅ Does NOT transfer funds
  // ✅ Database trigger creates escrow hold
});
```

### Escrow Release (Correct - Transfers on Release)
```typescript
// apps/website/src/app/api/escrow/[id]/release/route.ts
stripe.transfers.create({
  amount: vendorAmount,
  destination: vendorStripeAccountId,
  // ✅ Only transfers when escrow is released
});
```

## Testing Checklist

### Card Payment Escrow Test
- [ ] Create invoice
- [ ] Process card payment
- [ ] Verify payment in OpusFesta's Stripe dashboard
- [ ] Verify `escrow_holds` record created
- [ ] Verify `vendor_revenue.escrow_status = 'held'`
- [ ] Mark work as completed
- [ ] Release escrow
- [ ] Verify transfer to vendor's account

### Mobile Money Escrow Test
- [ ] Create invoice
- [ ] Submit mobile money receipt
- [ ] Vendor verifies receipt
- [ ] Verify `escrow_holds` record created
- [ ] Verify `vendor_revenue.escrow_status = 'held'`
- [ ] Mark work as completed
- [ ] Release escrow
- [ ] Verify funds released

## Summary

**Both card payments and mobile money:**
1. ✅ Payments go to OpusFesta first
2. ✅ Funds held in escrow automatically
3. ✅ 10% platform fee collected immediately
4. ✅ 90% vendor amount held until work completion
5. ✅ Released after 48-72 hours (or manual release)
6. ✅ Transferred to vendor on release

**No payment method bypasses escrow** - all funds are protected and held until work is verified.
