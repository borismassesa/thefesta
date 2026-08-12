import type { ComponentProps, ReactNode } from 'react'
import { Button } from '@/components/ui/Button'

type Props = ComponentProps<typeof Button> & {
  children: ReactNode
}

export function PrimaryButton({ className, children, disabled, ...rest }: Props) {
  return (
    <Button
      {...rest}
      disabled={disabled}
      size="large"
      className={className}
    >
      {children}
    </Button>
  )
}
