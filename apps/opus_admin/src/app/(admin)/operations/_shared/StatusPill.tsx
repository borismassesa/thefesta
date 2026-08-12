// OF-ADM-EDITORIAL-001 — shared status pill, used across Authors, Articles,
// and Submissions tabs. Single visual grammar across the three tabs is the
// whole point of this component existing.

import { cn } from '@/lib/utils';
import { opusBadgeClass, type OpusBadgeTone } from '@opusfesta/lib';
import { CircleAlert, CircleCheck, CircleX, Info } from 'lucide-react';

export type StatusVariant =
  | 'active'
  | 'pending'
  | 'revisions'
  | 'approved'
  | 'published'
  | 'scheduled'
  | 'draft'
  | 'inactive'
  | 'rejected'
  | 'expired'
  | 'revoked';

const STYLES: Record<StatusVariant, { tone: OpusBadgeTone; label: string }> = {
  active: { tone: 'success', label: 'Active' },
  approved: { tone: 'success', label: 'Approved' },
  published: { tone: 'success', label: 'Published' },
  pending: { tone: 'warning', label: 'Pending' },
  revisions: { tone: 'error', label: 'Revisions' },
  scheduled: { tone: 'warning', label: 'Scheduled' },
  draft: { tone: 'info', label: 'Draft' },
  inactive: { tone: 'neutral', label: 'Inactive' },
  rejected: { tone: 'error', label: 'Rejected' },
  expired: { tone: 'neutral', label: 'Expired' },
  revoked: { tone: 'error', label: 'Revoked' },
};

const ICONS: Record<OpusBadgeTone, typeof Info> = {
  error: CircleX,
  info: Info,
  success: CircleCheck,
  warning: CircleAlert,
  neutral: Info,
};

export default function StatusPill({
  variant,
  label,
  className,
}: {
  variant: StatusVariant;
  label?: string;
  className?: string;
}) {
  const style = STYLES[variant];
  const StatusIcon = ICONS[style.tone];
  return (
    <span
      className={cn(
        opusBadgeClass({ tone: style.tone, size: 'small' }),
        className
      )}
    >
      <StatusIcon aria-hidden="true" />
      <span className="opus-badge__label">{label ?? style.label}</span>
    </span>
  );
}
