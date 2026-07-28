# Mobile Money Payment Flow - Complete Confirmation

## Complete Flow Diagram

```
┌─────────────────────────────────────────────────────────────┐
│ STEP 1: Customer Initiates Payment                          │
└─────────────────────────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────────────────────┐
│ Customer selects "Mobile Money" payment method              │
│ - Sees vendor's mobile money number (LIPA Namba)            │
│ - Sees payment instructions                                 │
│ - Amount: TZS 1,000,000 (example)                           │
└─────────────────────────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────────────────────┐
│ STEP 2: Customer Makes Payment                              │
└─────────────────────────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────────────────────┐
│ Customer sends money to vendor's mobile money number        │
│ - Uses M-PESA, Airtel Money, Tigo Pesa, or Halo Pesa        │
│ - Payment goes DIRECTLY to vendor's mobile money account    │
│ - Customer receives confirmation SMS                        │
└─────────────────────────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────────────────────┐
│ STEP 3: Customer Uploads Receipt                           │
└─────────────────────────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────────────────────┐
│ Customer submits:                                            │
│ - Receipt screenshot/image                                  │
│ - Transaction/receipt number                                 │
│ - Phone number used for payment                             │
│ - Payment date                                               │
│                                                              │
│ API: POST /api/payments/receipts                            │
│ Creates:                                                     │
│ - Payment record (status: PENDING)                          │
│ - Receipt record (status: pending)                          │
└─────────────────────────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────────────────────┐
│ STEP 4: Vendor Verifies Receipt                             │
└─────────────────────────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────────────────────┐
│ Vendor reviews receipt:                                     │
│ - Checks receipt image                                       │
│ - Verifies transaction number                                │
│ - Confirms amount matches invoice                            │
│                                                              │
│ API: POST /api/payments/receipts/[id]/verify                │
│ Body: { isApproved: true }                                  │
│                                                              │
│ Database Function: verify_payment_receipt()                 │
│ - Updates receipt status: verified                          │
│ - Updates payment status: SUCCEEDED                         │
└─────────────────────────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────────────────────┐
│ STEP 5: Escrow Hold Created (AUTOMATIC)                    │
└─────────────────────────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────────────────────┐
│ Database Trigger: create_escrow_hold_trigger                 │
│ Fires when: payment.status = 'SUCCEEDED'                    │
│                                                              │
│ Creates:                                                     │
│ - escrow_holds record                                        │
│   • total_amount: TZS 1,000,000                             │
│   • platform_fee: TZS 100,000 (10%)                          │
│   • vendor_amount: TZS 900,000 (90%)                        │
│   • status: 'held'                                           │
│                                                              │
│ - platform_revenue record                                    │
│   • amount: TZS 100,000                                     │
│   • status: 'collected' (immediately)                      │
│                                                              │
│ - vendor_revenue record                                     │
│   • amount: TZS 900,000                                     │
│   • escrow_status: 'held'                                   │
│   • transfer_status: 'pending'                               │
└─────────────────────────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────────────────────┐
│ STEP 6: Funds Status                                        │
└─────────────────────────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────────────────────┐
│ OpusFesta Account:                                           │
│ - TZS 1,000,000 held (from customer payment)               │
│ - TZS 100,000 → Platform fee (collected)                    │
│ - TZS 900,000 → Vendor amount (held in escrow)             │
│                                                              │
│ Vendor's Mobile Money Account:                              │
│ - TZS 1,000,000 received (from customer)                   │
│ - BUT: Vendor must return TZS 900,000 to OpusFesta           │
│   OR: OpusFesta deducts from future payouts                  │
│                                                              │
│ ⚠️ IMPORTANT: This is a reconciliation issue!              │
│ The customer paid directly to vendor, but we need to        │
│ hold funds in escrow. We need a reconciliation process.    │
└─────────────────────────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────────────────────┐
│ STEP 7: Work Completion                                      │
└─────────────────────────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────────────────────┐
│ Vendor completes work/service                               │
│                                                              │
│ API: POST /api/escrow/[id]/complete-work                    │
│ - Marks work as completed                                   │
│ - Sets work_completed = true                                │
│ - Sets work_completed_at = NOW()                            │
└─────────────────────────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────────────────────┐
│ STEP 8: Escrow Release (48-72h after completion)            │
└─────────────────────────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────────────────────┐
│ Automatic Release (after 48-72 hours) OR Manual Release     │
│                                                              │
│ API: POST /api/escrow/[id]/release                          │
│                                                              │
│ Database Function: release_escrow_funds()                   │
│ - Updates escrow_holds.status = 'released'                  │
│ - Updates vendor_revenue.escrow_status = 'released'         │
│ - Updates payment.escrow_status = 'released'                │
│                                                              │
│ Transfer Options:                                            │
│ 1. Stripe Connect (if vendor has account)                   │
│ 2. Bank transfer                                            │
│ 3. Mobile money transfer (reconciliation)                   │
└─────────────────────────────────────────────────────────────┘
```

## Critical Issue: Mobile Money Reconciliation

### ⚠️ Problem Identified

When customer pays via mobile money:
1. Customer sends TZS 1,000,000 → **Vendor's mobile money account** (direct)
2. OpusFesta needs to hold TZS 900,000 in escrow
3. But vendor already received the full amount!

### Solution Options

#### Option 1: Vendor Returns Funds (Recommended)
- Vendor receives TZS 1,000,000 in their mobile money
- Vendor must return TZS 900,000 to OpusFesta's mobile money account
- OpusFesta holds TZS 900,000 until work completion
- On release: OpusFesta returns TZS 900,000 to vendor (or keeps if already returned)

#### Option 2: Deduct from Future Payouts
- Vendor keeps TZS 1,000,000 (already received)
- OpusFesta tracks: "Vendor owes TZS 900,000 to escrow"
- Deduct from future card payments or other transactions
- Reconciliation happens over time

#### Option 3: Vendor Pre-funds Escrow
- Vendor deposits TZS 900,000 to OpusFesta's account upfront
- When customer pays, vendor keeps their 90% share
- OpusFesta uses pre-funded amount for escrow

## Recommended Flow (Option 1)

### Updated Mobile Money Flow

```
1. Customer pays TZS 1,000,000 → Vendor's mobile money ✅
2. Customer uploads receipt
3. Vendor verifies receipt
4. Payment status → SUCCEEDED
5. Escrow hold created (TZS 900,000)
6. Vendor returns TZS 900,000 → OpusFesta's mobile money account
7. OpusFesta confirms receipt of TZS 900,000
8. Escrow status → CONFIRMED (funds actually held)
9. Work completion
10. Escrow release → Return TZS 900,000 to vendor
```

## Implementation Needed

### 1. OpusFesta Mobile Money Account
- Set up OpusFesta's mobile money numbers:
  - M-PESA: +255 XXX XXX XXX
  - Airtel Money: +255 XXX XXX XXX
  - Tigo Pesa: +255 XXX XXX XXX
  - Halo Pesa: +255 XXX XXX XXX

### 2. Reconciliation API
```typescript
POST /api/escrow/[id]/reconcile
Body: {
  receiptNumber: string,
  amount: number,
  provider: 'MPESA' | 'AIRTEL_MONEY' | etc.
}
```

### 3. Escrow Confirmation
- Track when vendor returns funds
- Confirm escrow hold is backed by actual funds
- Release only when funds confirmed

## Current Status

### ✅ What Works
- Payment record creation
- Receipt upload and verification
- Escrow hold creation (database)
- Work completion tracking
- Escrow release mechanism

### ⚠️ What Needs Work
- **Reconciliation**: Vendor returns 90% to OpusFesta
- **Confirmation**: OpusFesta confirms receipt of funds
- **Actual Holding**: Ensure funds are actually in OpusFesta's account

## Next Steps

1. **Set up OpusFesta mobile money accounts**
2. **Create reconciliation API**
3. **Add escrow confirmation step**
4. **Update vendor instructions** (return 90% to OpusFesta)
5. **Add reconciliation tracking** in escrow_holds table

Would you like me to implement the reconciliation system?
