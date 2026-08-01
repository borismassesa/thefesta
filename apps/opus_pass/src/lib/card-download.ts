import { toast } from 'sonner'

/**
 * Download a released card.
 *
 * Deliberately the same delivery ladder as downloadInvoice (see lib/invoice.ts),
 * and for the same reason: most couples open OpusPass inside the WhatsApp or
 * Instagram WebView, where a Blob-URL `<a download>` silently does nothing and
 * there is no print UI to fall back on.
 *
 *  1. Touch devices with Web Share file support get the native share sheet, so
 *     the card can go straight to Files or into a chat.
 *  2. Everything else gets a hidden-iframe form POST, handing the
 *     Content-Disposition response to the browser's own download manager,
 *     which works even in old WebViews.
 */
export async function downloadReleasedCard(designId: string, cardName: string): Promise<void> {
  if (typeof document === 'undefined') return

  const endpoint = `/api/my/card/${encodeURIComponent(designId)}`
  const filename = `OpusFesta-${cardName.replace(/[^A-Za-z0-9_-]+/g, '-') || 'card'}.svg`

  const isTouch =
    typeof window.matchMedia === 'function' &&
    (window.matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0)

  if (isTouch && typeof navigator.canShare === 'function') {
    try {
      const res = await fetch(endpoint, { method: 'POST' })
      if (!res.ok) {
        // The form fallback would hit the same error invisibly, so say so.
        toast.error('Could not download your card', {
          description: 'Please try again, or contact us on WhatsApp at +255 799 202 171.',
        })
        return
      }
      const blob = await res.blob()
      const file = new File([blob], filename, { type: 'image/svg+xml' })
      if (navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: cardName })
        return
      }
    } catch (err) {
      // Dismissing the share sheet is not a failure and leaves nothing to do.
      if (err instanceof DOMException && err.name === 'AbortError') return
      // Anything else falls through to the form POST, which goes via the
      // browser's own navigation stack and can succeed where fetch is blocked.
    }
  }

  submitDownloadForm(endpoint)
}

function submitDownloadForm(endpoint: string): void {
  const frameName = `card-dl-${Date.now()}`
  const iframe = document.createElement('iframe')
  iframe.name = frameName
  iframe.setAttribute('aria-hidden', 'true')
  iframe.style.display = 'none'

  const form = document.createElement('form')
  form.method = 'POST'
  form.action = endpoint
  form.target = frameName
  form.style.display = 'none'

  document.body.appendChild(iframe)
  document.body.appendChild(form)

  try {
    form.submit()
  } catch {
    toast.error('Could not download your card', {
      description: 'Please try again, or contact us on WhatsApp at +255 799 202 171.',
    })
  } finally {
    form.remove()
    // Leave the frame long enough for the download to be handed off.
    window.setTimeout(() => iframe.remove(), 60_000)
  }
}
