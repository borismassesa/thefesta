# Card Payment Escrow System

## Overview

All card payments (debit and credit cards) are processed through OpusFesta's Stripe account and held in escrow, just like mobile money payments. This ensures consistent behavior across all payment methods.

## Payment Flow for Cards

### 1. Customer Payment
- Customer enters card details
- Payment intent created on **OpusFesta's Stripe account**
- Payment processed via Stripe
- Funds captured to **OpusFesta's account** (not vendor's)

### 2. Payment Success
- Webhook receives `payment_intent.succeeded`
- Payment status updated to `SUCCEEDED`
- **Database trigger creates escrow hold**
- Funds held in OpusFesta's account

### 3. Escrow Hold
- 10% platform fee → Collected immediately
- 90% vendor amount → Held in escrow
- Status: `HELD`

### 4. Work Completion
- Vendor completes work
- Work marked as completed
- Funds ready for release

### 5. Fund Release
- After 48-72 hours (or manual release)
- Funds transferred to vendor via Stripe Connect
- Status: `RELEASED`

## Key Points

### ✅ All Payments to OpusFesta First
- Card payments go to **OpusFesta's Stripe account**
- NOT directly to vendor's Stripe Connect account
- Ensures escrow protection

### ✅ No Direct Charges
- We do NOT use Stripe Connect's `transfer_data` on payment intent
- We do NOT use `application_fee_amount` (old method)
- All payments captured to OpusFesta, then transferred later

### ✅ Consistent with Mobile Money
- Same escrow flow for cards and mobile money
- Same release mechanism
- Same dispute handling

## Stripe Configuration

### Payment Intent Creation
```typescript
// Payment intent created on OpusFesta's account
stripe.paymentIntents.create({
  amount: amountInCents,
  currency: currency,
  // NO transfer_data - payment goes to OpusFesta
  // NO application_fee - we handle split in escrow
  metadata: {
    invoice_id: invoiceId,
    inquiry_id: inquiryId,
  }
});
```

### Fund Transfer (On Release)
```typescript
// Only when escrow is released
stripe.transfers.create({
  amount: vendorAmount,
  currency: currency,
  destination: vendorStripeAccountId, // Vendor's Stripe Connect
  metadata: {
    escrow_hold_id: holdId,
    payment_id: paymentId,
  }
});
```

## Comparison: Old vs New

### ❌ Old Way (Direct Transfer - NOT USED)
```typescript
// Payment goes directly to vendor (bypasses escrow)
stripe.paymentIntents.create({
  amount: 1000,
  application_fee_amount: 100, // 10% fee
  transfer_data: {
    destination: vendorAccountId, // Direct to vendor
  }
});
```
**Problem:** Funds go directly to vendor, no escrow protection

### ✅ New Way (Escrow - CURRENT)
```typescript
// Payment goes to OpusFesta first
stripe.paymentIntents.create({
  amount: 1000,
  // No transfer_data - goes to OpusFesta
});

// Later, when escrow is released:
stripe.transfers.create({
  amount: 900,
  destination: vendorAccountId, // Transfer after release
});
```
**Benefit:** Funds held in escrow, released after work completion

## Verification Checklist

- [x] Payment intents created on OpusFesta's account
- [x] No `transfer_data` in payment intent creation
- [x] No `application_fee_amount` in payment intent
- [x] Webhook creates escrow hold (not immediate transfer)
- [x] Funds transferred only on escrow release
- [x] Works for both STRIPE_CARD and STRIPE_BANK methods

## Testing

### Test Card Payment Flow
1. Create invoice
2. Process card payment
3. Verify payment goes to OpusFesta's Stripe account
4. Verify escrow hold created
5. Mark work as completed
6. Release escrow
7. Verify transfer to vendor

### Verify No Direct Transfer
- Check Stripe dashboard: Payment should be in OpusFesta's account
- Check escrow_holds table: Should have record
- Check vendor_revenue: Should show `escrow_status: 'held'`

## Benefits

### ✅ Customer Protection
- Funds held until work verified
- Refund capability
- Dispute resolution

### ✅ Vendor Accountability
- Payment only after work completion
- Quality assurance
- Professional service delivery

### ✅ Platform Control
- OpusFesta manages all funds
- Consistent across payment methods
- Better dispute handling

## Summary

**All card payments (debit/credit) are:**
1. ✅ Processed to OpusFesta's Stripe account
2. ✅ Held in escrow automatically
3. ✅ Released only after work completion
4. ✅ Transferred to vendor via Stripe Connect on release

This matches the mobile money flow and ensures consistent escrow protection for all payment methods.
