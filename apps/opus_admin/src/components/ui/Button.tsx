import type { ButtonHTMLAttributes } from 'react'
import { opusButtonClass, type OpusButtonSize, type OpusButtonVariant } from '@opusfesta/lib'
import { cn } from '@/lib/utils'

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: OpusButtonVariant
  size?: OpusButtonSize
}

export function Button({ className, variant = 'primary', size = 'medium', ...props }: Props) {
  return <button className={cn(opusButtonClass({ variant, size }), className)} {...props} />
}
