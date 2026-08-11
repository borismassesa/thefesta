import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/lib/utils';

const badgeVariants = cva('opus-badge overflow-hidden', {
  variants: {
    variant: {
      default: 'opus-badge--info',
      secondary: 'opus-badge--neutral',
      destructive: 'opus-badge--error',
      outline: 'opus-badge--neutral ring-1 ring-inset ring-black/10',
      info: 'opus-badge--info',
      success: 'opus-badge--success',
      warning: 'opus-badge--warning',
      neutral: 'opus-badge--neutral',
    },
    size: {
      medium: 'opus-badge--medium',
      small: 'opus-badge--small',
    },
  },
  defaultVariants: {
    variant: 'default',
    size: 'medium',
  },
});

function Badge({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: React.ComponentProps<'span'> &
  VariantProps<typeof badgeVariants> & {
    asChild?: boolean;
  }) {
  const Comp = asChild ? Slot : 'span';

  return (
    <Comp
      data-slot="badge"
      className={cn(badgeVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { Badge, badgeVariants };
