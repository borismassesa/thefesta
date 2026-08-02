'use client'

import { useSetPageHeading } from '@/components/PageHeading'

export default function WorkspaceHeading({
  title,
  subtitle,
}: {
  title: string
  subtitle?: string
}) {
  useSetPageHeading({ title, subtitle })
  return null
}
