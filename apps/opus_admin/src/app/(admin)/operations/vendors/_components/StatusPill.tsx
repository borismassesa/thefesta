'use client';

import { cn } from '@/lib/utils';
import type { ReactNode } from 'react';
import { opusBadgeClass, type OpusBadgeTone } from '@opusfesta/lib';

export type StatusPillVariant =
  | 'success'
  | 'warning'
  | 'danger'
  | 'neutral'
  | 'info';

const VARIANT_TONES: Record<StatusPillVariant, OpusBadgeTone> = {
  success: 'success',
  warning: 'warning',
  danger: 'error',
  info: 'info',
  neutral: 'neutral',
};

export function StatusPill({
  variant = 'neutral',
  icon,
  children,
}: {
  variant?: StatusPillVariant;
  icon?: ReactNode;
  children: ReactNode;
}) {
  return (
    <span
      className={cn(
        opusBadgeClass({ tone: VARIANT_TONES[variant], size: 'small' })
      )}
    >
      {icon && <span className="opus-badge__icon">{icon}</span>}
      <span className="opus-badge__label">{children}</span>
    </span>
  );
}
