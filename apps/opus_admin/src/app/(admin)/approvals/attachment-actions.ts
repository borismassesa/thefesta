'use server'

// Approvals — supporting documents (receipts, quotes, invoices).
//
// AUTHORIZATION IS BY PARTICIPATION, RESOLVED PER CALL.
// Every entry point takes an id, re-reads the row, walks to the parent request
// and asks isRelevantTo(). Nothing here trusts a storage path from the caller.
//
// That is a deliberate departure from the other attachment helpers in this app,
// which sign whatever path they are handed after checking only a broad
// permission. Storage paths follow a predictable convention, so that pattern
// lets anyone holding the permission read any object in the bucket. Approval
// attachments carry payee names, amounts and invoices; they get the same
// participant scoping as the request they hang off.

import { randomUUID } from 'node:crypto'
import { revalidatePath } from 'next/cache'
import { createSupabaseAdminClient } from '@/lib/supabase'
import { logDbError } from '@/lib/log-safe'
import { getApprovalRequest } from './queries'
import type { ApprovalRequest } from './types'
import { isRelevantTo, isOwnedBy } from './scoping'
import { NOT_VISIBLE } from './transitions'
import { resolveApprovalActor } from './actor'

const BUCKET = 'approval-attachments'
// Short. A signed URL is a bearer token: anyone holding it can fetch the file
// regardless of who they are or what they can still see. Long enough to click
// through and open, not long enough to be worth passing around.
const SIGNED_URL_TTL_SECONDS = 60
const MAX_FILE_BYTES = 10 * 1024 * 1024

// Mirrors the bucket's allowed_mime_types. Checked here too so the caller gets
// a readable error instead of a storage rejection, and so the magic-byte test
// below has a declared type to disagree with.
const ALLOWED = new Map<string, string[]>([
  ['application/pdf', ['pdf']],
  ['image/jpeg', ['jpg', 'jpeg']],
  ['image/png', ['png']],
  ['image/webp', ['webp']],
  ['image/heic', ['heic']],
  ['image/heif', ['heif']],
])

// Returns the refreshed request, matching addApprovalNote and the transition
// actions: the caller swaps it into local state rather than refetching, so the
// activity feed and the attachment list update together.
export type AttachmentResult =
  | { ok: true; request: ApprovalRequest }
  | { ok: false; error: string }

export type AttachmentUrlResult =
  | { ok: true; url: string; fileName: string }
  | { ok: false; error: string }



// A declared MIME type is whatever the browser or a scripted caller chose to
// send. These are the real signatures, so a renamed .exe claiming to be a PDF
// is rejected on content rather than on its name.
//
// HEIC/HEIF are ISO-BMFF: bytes 4..8 are 'ftyp'. That is as far as this goes;
// it is a sanity check on the container, not a malware scanner.
function sniff(bytes: Uint8Array): string | null {
  const startsWith = (...sig: number[]) => sig.every((b, i) => bytes[i] === b)
  if (startsWith(0x25, 0x50, 0x44, 0x46)) return 'application/pdf' // %PDF
  if (startsWith(0xff, 0xd8, 0xff)) return 'image/jpeg'
  if (startsWith(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return 'image/png'
  if (startsWith(0x52, 0x49, 0x46, 0x46) && // RIFF
      bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50) {
    return 'image/webp'
  }
  if (bytes[4] === 0x66 && bytes[5] === 0x74 && bytes[6] === 0x79 && bytes[7] === 0x70) {
    return 'image/heic' // ftyp box; heif shares the container
  }
  return null
}

// Storage keys are generated, never derived from user input. A filename can
// contain path separators, null bytes or unicode that changes how a key reads.
// The original name is kept in the database column for display.
function storageKey(requestId: string, mime: string): string {
  const ext = ALLOWED.get(mime)?.[0] ?? 'bin'
  return `${requestId}/${randomUUID()}.${ext}`
}

export async function uploadApprovalAttachment(
  formData: FormData,
): Promise<AttachmentResult> {
  const requestId = formData.get('requestId')
  const file = formData.get('file')

  if (typeof requestId !== 'string' || !requestId) {
    return { ok: false, error: 'Missing request.' }
  }
  if (!(file instanceof File)) return { ok: false, error: 'No file provided.' }
  if (file.size === 0) return { ok: false, error: 'That file is empty.' }
  if (file.size > MAX_FILE_BYTES) {
    return { ok: false, error: 'Attachments are limited to 10MB.' }
  }

  const actor = await resolveApprovalActor()
  // Participation before anything is read off disk or written anywhere. Same
  // collapse as the rest of the module: a non-participant cannot tell an id
  // they cannot see from one that does not exist.
  const request = await getApprovalRequest(requestId)
  if (!request || !isRelevantTo(request, actor.email)) {
    return { ok: false, error: NOT_VISIBLE }
  }
  // A decided request is a closed record. Adding a receipt after the fact
  // changes what the approver appears to have seen.
  if (request.status === 'Approved' || request.status === 'Refused') {
    return { ok: false, error: 'This request has been decided and cannot take new attachments.' }
  }

  const declared = (file.type || '').toLowerCase()
  if (!ALLOWED.has(declared)) {
    return { ok: false, error: 'Attach a PDF or an image (JPEG, PNG, WebP, HEIC).' }
  }

  const buffer = new Uint8Array(await file.arrayBuffer())
  const actual = sniff(buffer.subarray(0, 16))
  if (!actual) {
    return { ok: false, error: 'That file is not a readable PDF or image.' }
  }
  // JPEG declared as HEIC is harmless; an executable declared as a PDF is not.
  // Comparing the sniffed family to the declared one catches the case that
  // matters without being defeated by browsers that mislabel HEIC.
  const family = (m: string) => (m === 'image/heif' ? 'image/heic' : m)
  if (family(actual) !== family(declared) && !(actual.startsWith('image/') && declared.startsWith('image/'))) {
    return { ok: false, error: 'That file does not match its type.' }
  }

  const supabase = createSupabaseAdminClient()
  const key = storageKey(requestId, declared)
  const { error: uploadErr } = await supabase.storage
    .from(BUCKET)
    .upload(key, buffer, { contentType: declared, upsert: false })
  if (uploadErr) {
    logDbError('approval_attachment.upload', uploadErr, { requestId })
    return { ok: false, error: 'Could not upload that file.' }
  }

  const { data, error } = await supabase.rpc('approval_attachment_add', {
    p_request_id: requestId,
    p_storage_path: key,
    p_file_name: file.name.slice(0, 200),
    p_mime_type: declared,
    p_file_size_bytes: file.size,
    p_actor_name: actor.name,
    p_actor_initials: actor.initials,
    p_actor_color: actor.color,
    p_actor_employee_id: actor.employeeId,
    p_actor_auth_id: actor.clerkId,
    p_correlation_id: randomUUID(),
  })
  if (error || !data) {
    // The row and its audit entry are atomic, so a failure here means neither
    // exists. Drop the object rather than leaving it unreferenced in the bucket.
    await supabase.storage.from(BUCKET).remove([key]).catch(() => undefined)
    logDbError('approval_attachment.record', error, { requestId })
    return { ok: false, error: 'Could not attach that file.' }
  }

  const updated = await getApprovalRequest(requestId)
  if (!updated) return { ok: false, error: 'Attached, but could not reload the request.' }
  revalidatePath('/approvals')
  return { ok: true, request: updated }
}

// Resolves by attachment id, never by path, and re-checks participation now
// rather than trusting that the caller could see this request when the page
// was rendered. An approver removed from a request stops being able to fetch
// its receipts on their next click, not on their next page load.
export async function getApprovalAttachmentUrl(
  attachmentId: string,
): Promise<AttachmentUrlResult> {
  if (!attachmentId) return { ok: false, error: NOT_VISIBLE }

  const actor = await resolveApprovalActor()
  const supabase = createSupabaseAdminClient()
  const { data: row, error } = await supabase
    .from('approval_request_attachments')
    .select('id, request_id, storage_path, file_name, deleted_at')
    .eq('id', attachmentId)
    .maybeSingle<{
      id: string
      request_id: string
      storage_path: string
      file_name: string
      deleted_at: string | null
    }>()
  if (error) {
    logDbError('approval_attachment.get', error, { attachmentId })
    return { ok: false, error: NOT_VISIBLE }
  }
  if (!row || row.deleted_at) return { ok: false, error: NOT_VISIBLE }

  const request = await getApprovalRequest(row.request_id)
  if (!request || !isRelevantTo(request, actor.email)) {
    return { ok: false, error: NOT_VISIBLE }
  }

  const { data: signed, error: signErr } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(row.storage_path, SIGNED_URL_TTL_SECONDS)
  if (signErr || !signed) {
    // The provider message can carry the bucket path, so it is logged and not
    // returned.
    logDbError('approval_attachment.sign', signErr, { attachmentId })
    return { ok: false, error: 'Could not open that attachment.' }
  }
  return { ok: true, url: signed.signedUrl, fileName: row.file_name }
}

export async function removeApprovalAttachment(
  attachmentId: string,
): Promise<AttachmentResult> {
  if (!attachmentId) return { ok: false, error: NOT_VISIBLE }

  const actor = await resolveApprovalActor()
  const supabase = createSupabaseAdminClient()
  const { data: row, error } = await supabase
    .from('approval_request_attachments')
    .select('id, request_id, deleted_at')
    .eq('id', attachmentId)
    .maybeSingle<{ id: string; request_id: string; deleted_at: string | null }>()
  if (error) {
    logDbError('approval_attachment.lookup', error, { attachmentId })
    return { ok: false, error: NOT_VISIBLE }
  }
  if (!row || row.deleted_at) return { ok: false, error: NOT_VISIBLE }

  const request = await getApprovalRequest(row.request_id)
  if (!request || !isRelevantTo(request, actor.email)) {
    return { ok: false, error: NOT_VISIBLE }
  }
  // Approvers read evidence; they do not curate it. Letting an approver delete
  // a receipt from a request they are deciding would let them reshape the
  // record they are judging.
  if (!isOwnedBy(request, actor.email)) {
    return { ok: false, error: 'Only the person who raised a request can remove its attachments.' }
  }
  if (request.status !== 'To Submit') {
    return { ok: false, error: 'Reopen this as a draft before changing its attachments.' }
  }

  const { data: outcome, error: rpcErr } = await supabase.rpc('approval_attachment_remove', {
    p_attachment_id: attachmentId,
    p_actor_name: actor.name,
    p_actor_initials: actor.initials,
    p_actor_color: actor.color,
    p_actor_employee_id: actor.employeeId,
    p_actor_auth_id: actor.clerkId,
    p_correlation_id: randomUUID(),
  })
  if (rpcErr) {
    logDbError('approval_attachment.remove', rpcErr, { attachmentId })
    return { ok: false, error: 'Could not remove that attachment.' }
  }
  if (outcome === 'stale') {
    return { ok: false, error: 'That attachment was already removed.' }
  }

  // The storage object is deliberately left in place. The row is soft-deleted
  // so the audit entry that names this file stays resolvable, and a request
  // that was decided with a receipt attached keeps its evidence. Purging
  // belongs in a retention job, not in a click.
  const updated = await getApprovalRequest(row.request_id)
  if (!updated) return { ok: false, error: NOT_VISIBLE }
  revalidatePath('/approvals')
  return { ok: true, request: updated }
}
