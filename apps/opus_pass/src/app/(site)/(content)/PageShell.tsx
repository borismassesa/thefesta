import type { ReactNode } from 'react'

// Shared shell for the simple content/legal pages. Keeps the serif-heading
// + grey-intro grammar consistent across Pricing, Contact, Terms, etc.

export default function PageShell({
  eyebrow,
  title,
  intro,
  children,
}: {
  eyebrow?: string
  title: string
  intro?: string
  children?: ReactNode
}) {
  return (
    <section className="px-4 sm:px-6 py-20 sm:py-28">
      <div className="mx-auto max-w-3xl">
        {eyebrow && (
          <p className="text-[13px] text-gray-500 mb-3">{eyebrow}</p>
        )}
        <h1 className="font-serif text-4xl sm:text-5xl tracking-tight text-[#403d39]">
          {title}
        </h1>
        {intro && (
          <p className="mt-5 text-[15px] sm:text-base text-gray-600 leading-relaxed max-w-2xl">
            {intro}
          </p>
        )}
        {children && (
          <div className="mt-10 text-[15px] text-gray-700 leading-relaxed space-y-4">
            {children}
          </div>
        )}
      </div>
    </section>
  )
}
