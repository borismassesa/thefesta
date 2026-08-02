import 'server-only'
import { randomUUID } from 'node:crypto'
import { BRIEF_MAX_FILES, BRIEF_MAX_FILE_BYTES, type BriefQuestion } from '@opusfesta/lib'
import { createSupabaseServerClient } from '@/lib/supabase'

/**
 * The structured brief.
 * Specs: OP-CCS-PRD-001 §7.3; OP-CCS-TDD-001 §8; loophole L10.
 *
 * "Designer requests information based on category" moved earlier: instead of a
 * designer emailing the customer once work starts, the question set is served
 * immediately after payment. The designer is never blocked, and the SLA clock
 * cannot start until the answers are in — `transition_order()` refuses to queue
 * an order with a required answer missing, so this module never needs to
 * enforce that itself.
 */

export const BRIEFS_BUCKET = 'commission-briefs'

export type BriefAttachment = {
  path: string
  name: string
  size: number
  contentType: string
}

export async function getBriefQuestions(categoryId: string): Promise<BriefQuestion[]> {
  const supabase = createSupabaseServerClient()
  const { data, error } = await supabase
    .from('brief_questions')
    .select('id, category_id, key, label_en, label_sw, help_en, help_sw, field_type, options, required, sort_order')
    .eq('category_id', categoryId)
    .eq('active', true)
    .order('sort_order')
  if (error) throw new Error(`getBriefQuestions failed: ${error.message}`)
  return (data ?? []).map((r) => {
    const row = r as Record<string, unknown>
    return {
      id: String(row.id),
      categoryId: String(row.category_id),
      key: String(row.key),
      labelEn: String(row.label_en),
      labelSw: String(row.label_sw),
      helpEn: (row.help_en as string) ?? null,
      helpSw: (row.help_sw as string) ?? null,
      fieldType: row.field_type as BriefQuestion['fieldType'],
      options: Array.isArray(row.options) ? (row.options as string[]) : [],
      required: Boolean(row.required),
      sortOrder: Number(row.sort_order),
    }
  })
}

export type BriefRecord = {
  answers: Record<string, unknown>
  attachments: BriefAttachment[]
  completedAt: string | null
}

export async function getBrief(orderId: string): Promise<BriefRecord> {
  const supabase = createSupabaseServerClient()
  const { data, error } = await supabase
    .from('order_briefs')
    .select('answers, attachments, completed_at')
    .eq('order_id', orderId)
    .maybeSingle()
  if (error) throw new Error(`getBrief failed: ${error.message}`)
  if (!data) return { answers: {}, attachments: [], completedAt: null }
  const row = data as Record<string, unknown>
  return {
    answers: (row.answers as Record<string, unknown>) ?? {},
    attachments: (row.attachments as BriefAttachment[]) ?? [],
    completedAt: (row.completed_at as string) ?? null,
  }
}

/**
 * Save answers, keeping ONLY keys that correspond to a real question for this
 * order's category.
 *
 * Dropping unknown keys rather than storing them is deliberate: `answers` is a
 * free-shaped jsonb column, so without this filter it is an unbounded
 * client-writable store attached to a paid order. It would also quietly
 * accumulate stale keys every time a question is renamed.
 */
export async function saveBriefAnswers(input: {
  orderId: string
  categoryId: string
  answers: Record<string, unknown>
  complete: boolean
}): Promise<{ saved: Record<string, unknown>; missingRequired: string[] }> {
  const questions = await getBriefQuestions(input.categoryId)
  const byKey = new Map(questions.map((q) => [q.key, q]))

  const saved: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(input.answers)) {
    const question = byKey.get(key)
    if (!question) continue
    if (typeof value === 'string') {
      // A long free-text answer is fine; an unbounded one is a storage problem.
      saved[key] = value.slice(0, 4000)
    } else if (value === null || value === undefined) {
      continue
    } else {
      saved[key] = value
    }
  }

  const existing = await getBrief(input.orderId)
  const merged = { ...existing.answers, ...saved }

  const missingRequired = questions
    .filter((q) => q.required)
    .filter((q) => {
      const v = merged[q.key]
      if (v === null || v === undefined) return true
      if (typeof v === 'string') return v.trim() === ''
      if (Array.isArray(v)) return v.length === 0
      return false
    })
    .map((q) => q.key)

  const supabase = createSupabaseServerClient()
  const { error } = await supabase.from('order_briefs').upsert(
    {
      order_id: input.orderId,
      answers: merged,
      // completed_at anchors the 100%/90% refund boundary, so it is only ever
      // set when the brief is genuinely complete — never optimistically.
      completed_at:
        input.complete && missingRequired.length === 0
          ? (existing.completedAt ?? new Date().toISOString())
          : existing.completedAt,
    },
    { onConflict: 'order_id' },
  )
  if (error) throw new Error(`saveBriefAnswers failed: ${error.message}`)

  return { saved: merged, missingRequired }
}

// ─────────────────────────────────────────────────────────────────────────────
//  Uploads
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Magic-byte signatures for the formats a brief may carry.
 *
 * The Content-Type header on an upload is a claim by the client, not a fact. A
 * file named photo.jpg declaring image/jpeg can be anything at all, so the type
 * is determined here by reading the actual bytes (TDD §7.4: "All uploads
 * content-type sniffed server-side, not trusted from the client").
 */
const SIGNATURES: { type: string; test: (b: Uint8Array) => boolean }[] = [
  { type: 'image/jpeg', test: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  {
    type: 'image/png',
    test: (b) =>
      b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 &&
      b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a,
  },
  {
    type: 'application/pdf',
    test: (b) => b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46, // %PDF
  },
  {
    // RIFF....WEBP
    type: 'image/webp',
    test: (b) =>
      b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 &&
      b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50,
  },
  {
    // ....ftypheic / ftypheix / ftypmif1 — what an iPhone camera produces, and
    // therefore extremely common here.
    type: 'image/heic',
    test: (b) => {
      if (!(b[4] === 0x66 && b[5] === 0x74 && b[6] === 0x79 && b[7] === 0x70)) return false
      const brand = String.fromCharCode(b[8], b[9], b[10], b[11])
      return ['heic', 'heix', 'hevc', 'mif1', 'msf1', 'heim'].includes(brand)
    },
  },
]

export type UploadRejection = { ok: false; message: string }
export type UploadAccepted = { ok: true; attachment: BriefAttachment }

export function sniffContentType(bytes: Uint8Array): string | null {
  for (const sig of SIGNATURES) {
    if (bytes.length >= 12 && sig.test(bytes)) return sig.type
  }
  return null
}

/**
 * Validate and store one brief attachment.
 *
 * Every limit in PRD §7.3 is enforced here rather than in the browser: 10 files,
 * 15 MB each, images and PDF only. The filename is discarded in favour of a
 * generated one — a client-supplied name is a path-traversal and
 * content-sniffing vector, and it is not needed for anything.
 */
export async function storeBriefAttachment(input: {
  orderId: string
  file: File
  existingCount: number
}): Promise<UploadAccepted | UploadRejection> {
  if (input.existingCount >= BRIEF_MAX_FILES) {
    return { ok: false, message: `You can attach up to ${BRIEF_MAX_FILES} files.` }
  }
  if (input.file.size > BRIEF_MAX_FILE_BYTES) {
    return { ok: false, message: 'Each file must be under 15 MB.' }
  }
  if (input.file.size === 0) {
    return { ok: false, message: 'That file is empty.' }
  }

  const bytes = new Uint8Array(await input.file.arrayBuffer())
  const contentType = sniffContentType(bytes)
  if (!contentType) {
    return {
      ok: false,
      message: 'That file type is not supported. Attach a photo (JPG, PNG, WebP, HEIC) or a PDF.',
    }
  }

  const extension =
    contentType === 'application/pdf' ? 'pdf' : contentType.split('/')[1].replace('jpeg', 'jpg')
  // Generated path, never the client's filename.
  const path = `${input.orderId}/${randomUUID()}.${extension}`

  const supabase = createSupabaseServerClient()
  const { error } = await supabase.storage
    .from(BRIEFS_BUCKET)
    .upload(path, bytes, { contentType, upsert: false })
  if (error) {
    console.error('[commission] brief upload failed', error)
    return { ok: false, message: 'We could not save that file. Please try again.' }
  }

  // The display name is kept for the designer's benefit but sanitised: it is
  // rendered in the admin UI, and it never touches the storage path.
  const displayName = (input.file.name || 'attachment')
    .replace(/[^\w.\- ]+/g, '')
    .slice(0, 80)

  return {
    ok: true,
    attachment: { path, name: displayName, size: input.file.size, contentType },
  }
}

export async function appendBriefAttachment(
  orderId: string,
  attachment: BriefAttachment,
): Promise<BriefAttachment[]> {
  const brief = await getBrief(orderId)
  const attachments = [...brief.attachments, attachment].slice(0, BRIEF_MAX_FILES)
  const supabase = createSupabaseServerClient()
  const { error } = await supabase
    .from('order_briefs')
    .upsert({ order_id: orderId, attachments }, { onConflict: 'order_id' })
  if (error) throw new Error(`appendBriefAttachment failed: ${error.message}`)
  return attachments
}

/**
 * A short-lived signed URL for a stored attachment.
 *
 * Five minutes, matching the preview policy in TDD §7.4. The buckets carry no
 * anon or authenticated storage policy at all, so this is the only way to read
 * one, and every call sits behind an authorisation check in the route above.
 */
export async function signedAttachmentUrl(path: string, seconds = 300): Promise<string | null> {
  const supabase = createSupabaseServerClient()
  const { data, error } = await supabase.storage
    .from(BRIEFS_BUCKET)
    .createSignedUrl(path, seconds)
  if (error) {
    console.error('[commission] could not sign attachment url', error)
    return null
  }
  return data?.signedUrl ?? null
}
