import * as React from 'react'
import { Slot } from '@radix-ui/react-slot'
import { opusButtonClass, type OpusButtonSize, type OpusButtonVariant } from '@opusfesta/lib'

import { cn } from '@/lib/utils'

type ButtonVariant = 'default' | 'destructive' | 'outline' | 'secondary' | 'ghost' | 'link'
type ButtonSize = 'default' | 'xs' | 'sm' | 'lg' | 'icon'

const VARIANT_MAP: Record<ButtonVariant, OpusButtonVariant> = {
  default: 'primary',
  destructive: 'danger',
  outline: 'neutral',
  secondary: 'secondary',
  ghost: 'tertiary',
  link: 'tertiary',
}

const SIZE_MAP: Record<ButtonSize, OpusButtonSize> = {
  default: 'medium',
  xs: 'small',
  sm: 'small',
  lg: 'large',
  icon: 'icon-medium',
}

function buttonVariants({
  variant = 'default',
  size = 'default',
  className,
}: {
  variant?: ButtonVariant | null
  size?: ButtonSize | null
  className?: string
} = {}) {
  return cn(
    opusButtonClass({
      variant: VARIANT_MAP[variant ?? 'default'],
      size: SIZE_MAP[size ?? 'default'],
    }),
    className,
  )
}

function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: React.ComponentProps<'button'> &
  {
    variant?: ButtonVariant
    size?: ButtonSize
    asChild?: boolean
  }) {
  const Comp = asChild ? Slot : 'button'

  return (
    <Comp data-slot='button' className={cn(buttonVariants({ variant, size, className }))} {...props} />
  )
}

export { Button, buttonVariants }
