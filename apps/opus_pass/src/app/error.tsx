'use client'

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 text-center">
      <p className="text-xs font-bold uppercase tracking-widest text-[var(--accent)] mb-4">Something went wrong</p>
      <h1 className="text-4xl md:text-6xl font-black tracking-tighter uppercase leading-[0.85] text-[#1A1A1A] mb-6">
        UNEXPECTED
        <br />
        ERROR
      </h1>
      <p className="text-gray-500 font-medium mb-10 max-w-sm">
        We hit an unexpected issue. Please try again — if it persists, contact support.
      </p>
      <button data-opus-button="primary" data-opus-button-size="medium"
        onClick={reset}
        className="bg-[#1A1A1A] hover:bg-[#333333] text-white px-8 py-4 rounded-full font-bold transition-colors"
      >
        Try again
      </button>
      {error.digest && (
        <p className="text-gray-300 text-xs mt-6 font-mono">ref: {error.digest}</p>
      )}
    </div>
  )
}
