'use client'

import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import { X } from 'lucide-react'

// Small client island. The hub itself stays a server component (for
// metadata + straight-to-HTML), and this form writes ?q=… into the URL.
// The server page reads it and renders the filtered view.
//
// `action` overrides the destination path — pass '/advice-and-ideas' from
// the detail page so search always lands back on the hub.
export default function SearchForm({
  action,
  placeholder = 'Search articles and inspiration',
  ariaLabel = 'Search articles',
}: {
  action?: string
  placeholder?: string
  ariaLabel?: string
} = {}) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const initialQ = searchParams.get('q') ?? ''
  const [value, setValue] = useState(initialQ)
  const target = action ?? pathname

  // Keep the input in sync if the URL changes from elsewhere (e.g. Clear link).
  useEffect(() => { setValue(initialQ) }, [initialQ])

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    const q = value.trim()
    router.push(q ? `${target}?q=${encodeURIComponent(q)}` : target, { scroll: false })
  }

  const clear = () => {
    setValue('')
    router.push(target, { scroll: false })
  }

  return (
    <form onSubmit={submit} className="w-full sm:w-[360px] md:w-[420px]">
      <div className="relative">
        <input
          type="search"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={placeholder}
          aria-label={ariaLabel}
          className="opus-search opus-search--custom-clear w-full min-w-0 pr-12"
        />
        {value && (
          <button data-opus-button="control"
            type="button"
            onClick={clear}
            aria-label="Clear search"
            className="absolute right-3 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full text-[#6A6C6A] transition-colors hover:bg-slate-100 hover:text-[#0E0F0C]"
          >
            <X size={20} />
          </button>
        )}
        <button data-opus-button="primary" data-opus-button-size="medium"
          type="submit"
          className="sr-only"
        >
          Search
        </button>
      </div>
    </form>
  )
}
