'use client'

import { useState } from 'react'

export default function ExpandableText({
  text,
  limit = 200,
  className,
}: {
  text: string
  limit?: number
  className?: string
}) {
  const [expanded, setExpanded] = useState(false)
  const isLong = text.length > limit

  if (!isLong) {
    return <p className={className}>{text}</p>
  }

  return (
    <p className={className}>
      {expanded ? (
        <>
          {text}{' '}
          <button data-opus-button="control"
            type="button"
            onClick={() => setExpanded(false)}
            className="font-semibold underline underline-offset-2 text-gray-900 hover:text-gray-700"
          >
            Show less
          </button>
        </>
      ) : (
        <>
          {text.slice(0, limit).trimEnd()}…{' '}
          <button data-opus-button="control"
            type="button"
            onClick={() => setExpanded(true)}
            className="font-semibold underline underline-offset-2 text-gray-900 hover:text-gray-700"
          >
            Read more
          </button>
        </>
      )}
    </p>
  )
}
