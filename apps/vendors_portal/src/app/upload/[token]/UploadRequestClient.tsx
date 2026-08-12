'use client'

import { useRef, useState, useTransition } from 'react'
import { CheckCircle2, FileUp, Loader2, UploadCloud } from 'lucide-react'
import { submitDocumentRequest } from './actions'

const ACCEPT = 'application/pdf,image/jpeg,image/png,image/webp'
const MAX_BYTES = 25 * 1024 * 1024

export default function UploadRequestClient({
  token,
  alreadySubmitted,
}: {
  token: string
  alreadySubmitted: boolean
}) {
  const [pending, startTransition] = useTransition()
  const [file, setFile] = useState<File | null>(null)
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  function pick(f: File | null) {
    setError(null)
    if (f && f.size > MAX_BYTES) {
      setError('File is over 25MB. Compress or trim it before uploading.')
      setFile(null)
      return
    }
    setFile(f)
  }

  function submit() {
    if (!file) {
      setError('Choose a file to upload.')
      return
    }
    setError(null)
    startTransition(async () => {
      const fd = new FormData()
      fd.set('file', file)
      if (note.trim()) fd.set('note', note.trim())
      const res = await submitDocumentRequest(token, fd)
      if (!res.ok) {
        setError(res.error)
        return
      }
      setDone(true)
    })
  }

  if (done) {
    return (
      <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-6 text-center">
        <CheckCircle2 className="mx-auto h-8 w-8 text-emerald-600" />
        <h2 className="mt-3 text-lg font-semibold text-emerald-900">Document received</h2>
        <p className="mt-1 text-sm text-emerald-800">
          Thanks. Our team has been notified and will review it. You can close this page.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {alreadySubmitted && (
        <p className="rounded-lg bg-blue-50 border border-blue-200 px-3 py-2 text-xs text-blue-700">
          You already uploaded a file for this request. Uploading again replaces it.
        </p>
      )}

      <label
        className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-gray-300 bg-gray-50 px-5 py-8 text-center hover:border-[#7E5896]/50 hover:bg-[#F6EEFB]/40 transition-colors"
      >
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT}
          className="sr-only"
          onChange={(e) => pick(e.target.files?.[0] ?? null)}
        />
        {file ? (
          <>
            <FileUp className="h-7 w-7 text-[#7E5896]" />
            <span className="text-sm font-semibold text-gray-900 break-all">{file.name}</span>
            <span className="text-xs text-gray-500">Tap to choose a different file</span>
          </>
        ) : (
          <>
            <UploadCloud className="h-7 w-7 text-gray-400" />
            <span className="text-sm font-semibold text-gray-700">Choose a file</span>
            <span className="text-xs text-gray-500">PDF, JPG, PNG or WEBP, up to 25MB</span>
          </>
        )}
      </label>

      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        rows={2}
        placeholder="Add a note for our team (optional)"
        className="w-full resize-none rounded-xl border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:border-[#7E5896]"
      />

      {error && <p className="text-sm text-rose-600 font-medium">{error}</p>}

      <button data-opus-button="primary" data-opus-button-size="large"
        type="button"
        onClick={submit}
        disabled={pending || !file}
        className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-[#1A1A1A] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#333] disabled:opacity-40 disabled:cursor-not-allowed"
      >
        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <UploadCloud className="h-4 w-4" />}
        {pending ? 'Uploading…' : 'Upload document'}
      </button>
    </div>
  )
}
