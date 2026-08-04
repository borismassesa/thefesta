'use server'

import { revalidatePath } from 'next/cache'
import { createSupabaseAdminClient } from '@/lib/supabase'
import {
  GROWTH_ERROR,
  growthDbErrorMessage,
  logGrowthDbError,
  missingGrowthRecord,
  requireGrowthPermission,
  type ActionResult,
} from '../_lib/action-utils'
import { nullableTrimmedText } from '../_lib/text'

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

export type BookingInput = {
  bookingDate: string
  sessionDate: string | null
  customerName: string
  service: string
  photographerName: string | null
  videographerName: string | null
  revenueTzs: number
  directCostTzs: number
  deliveryDate: string | null
  satisfaction: number | null
  notes: string | null
}

function validate(input: Partial<BookingInput>): string | null {
  if (input.bookingDate !== undefined && !DATE_RE.test(input.bookingDate)) return 'Invalid booking date.'
  if (input.sessionDate != null && !DATE_RE.test(input.sessionDate)) return 'Invalid session date.'
  if (input.deliveryDate != null && !DATE_RE.test(input.deliveryDate)) return 'Invalid delivery date.'
  if (input.customerName !== undefined && !input.customerName.trim()) return 'Customer name is required.'
  if (input.service !== undefined && !input.service.trim()) return 'Service is required.'
  if (input.revenueTzs !== undefined && !(Number.isFinite(input.revenueTzs) && input.revenueTzs >= 0)) {
    return 'Revenue must be zero or positive.'
  }
  if (input.directCostTzs !== undefined && !(Number.isFinite(input.directCostTzs) && input.directCostTzs >= 0)) {
    return 'Direct cost must be zero or positive.'
  }
  if (
    input.satisfaction != null &&
    !(Number.isFinite(input.satisfaction) && input.satisfaction >= 0 && input.satisfaction <= 5)
  ) {
    return 'Satisfaction must be between 0 and 5.'
  }
  return null
}

function revalidateStudio() {
  revalidatePath('/growth/studio')
  revalidatePath('/growth')
}

export async function addBooking(input: BookingInput): Promise<ActionResult> {
  const denied = await requireGrowthPermission('growth.write')
  if (denied) return denied
  const validationError = validate(input)
  if (validationError) return { ok: false, error: validationError }

  const supabase = createSupabaseAdminClient()
  const { error } = await supabase.from('growth_studio_bookings_log').insert({
    booking_date: input.bookingDate,
    session_date: input.sessionDate,
    customer_name: input.customerName.trim(),
    service: input.service.trim(),
    photographer_name: nullableTrimmedText(input.photographerName),
    videographer_name: nullableTrimmedText(input.videographerName),
    revenue_tzs: input.revenueTzs,
    direct_cost_tzs: input.directCostTzs,
    delivery_date: input.deliveryDate,
    satisfaction: input.satisfaction,
    notes: nullableTrimmedText(input.notes),
  })
  if (error) {
    logGrowthDbError('growth.studio_booking.insert', error)
    return { ok: false, error: growthDbErrorMessage(error, GROWTH_ERROR.save) }
  }

  revalidateStudio()
  return { ok: true }
}

export async function updateBooking(id: string, patch: Partial<BookingInput>): Promise<ActionResult> {
  const denied = await requireGrowthPermission('growth.write')
  if (denied) return denied
  const validationError = validate(patch)
  if (validationError) return { ok: false, error: validationError }

  const dbPatch: Record<string, unknown> = {}
  if (patch.bookingDate !== undefined) dbPatch.booking_date = patch.bookingDate
  if (patch.sessionDate !== undefined) dbPatch.session_date = patch.sessionDate
  if (patch.customerName !== undefined) dbPatch.customer_name = patch.customerName.trim()
  if (patch.service !== undefined) dbPatch.service = patch.service.trim()
  if (patch.photographerName !== undefined) dbPatch.photographer_name = nullableTrimmedText(patch.photographerName)
  if (patch.videographerName !== undefined) dbPatch.videographer_name = nullableTrimmedText(patch.videographerName)
  if (patch.revenueTzs !== undefined) dbPatch.revenue_tzs = patch.revenueTzs
  if (patch.directCostTzs !== undefined) dbPatch.direct_cost_tzs = patch.directCostTzs
  if (patch.deliveryDate !== undefined) dbPatch.delivery_date = patch.deliveryDate
  if (patch.satisfaction !== undefined) dbPatch.satisfaction = patch.satisfaction
  if (patch.notes !== undefined) dbPatch.notes = nullableTrimmedText(patch.notes)

  const supabase = createSupabaseAdminClient()
  const { data, error } = await supabase
    .from('growth_studio_bookings_log')
    .update(dbPatch)
    .eq('id', id)
    .select('id')
    .maybeSingle<{ id: string }>()
  if (error) {
    logGrowthDbError('growth.studio_booking.update', error, { bookingId: id })
    return { ok: false, error: growthDbErrorMessage(error, GROWTH_ERROR.save) }
  }
  if (!data) return missingGrowthRecord()

  revalidateStudio()
  return { ok: true }
}

export async function deleteBooking(id: string): Promise<ActionResult> {
  const denied = await requireGrowthPermission('growth.write')
  if (denied) return denied

  const supabase = createSupabaseAdminClient()
  const { data, error } = await supabase
    .from('growth_studio_bookings_log')
    .delete()
    .eq('id', id)
    .select('id')
    .maybeSingle<{ id: string }>()
  if (error) {
    logGrowthDbError('growth.studio_booking.delete', error, { bookingId: id })
    return { ok: false, error: growthDbErrorMessage(error, GROWTH_ERROR.delete) }
  }
  if (!data) return missingGrowthRecord()

  revalidateStudio()
  return { ok: true }
}
