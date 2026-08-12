/** Decorative right-hand visual — a provided animated QR-scanner SVG (SMIL
 * scan-line animation) on OpusPass's soft gradient backdrop. Rendered as a
 * plain <img>, not next/image: Next's image pipeline can strip/break SMIL
 * animations on optimization, and this file is served as-is from /public
 * anyway (no resizing needed). Hidden below lg — this is primarily a
 * mobile device flow, the split-screen only makes sense with room to
 * spare.
 *
 * The OpusPass mark is baked into the SVG (quiet-zone cutout under the
 * scan line) so it reads as part of the QR, not a sticker on top.
 */
export default function ScannerVisual() {
  return (
    <div className="relative flex h-full w-full items-center justify-center overflow-hidden bg-white">
      <div className="absolute aspect-square w-[85%] max-w-96 rounded-full bg-gradient-to-br from-[#F0DFF6] via-[#FCE9C2]/40 to-[#E8FBDB]" />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/assets/illustrations/qr-code-scanner.svg?v=brand-mark-3"
        alt=""
        className="relative h-auto w-[70%] max-w-72"
      />
    </div>
  )
}
