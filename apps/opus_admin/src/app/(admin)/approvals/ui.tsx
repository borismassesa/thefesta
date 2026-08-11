'use client';

// Shared presentation bits for the Approvals module. Extracted out of
// ApprovalsClient once the Create / My Requests / Pending / Analytics tabs
// all needed the same icon map, status tone and date formatting.

import {
  Car,
  FileCheck2,
  FileSignature,
  FileText,
  PackageOpen,
  Plane,
  ShoppingCart,
  UserPlus,
  Wallet,
  CircleAlert,
  CircleCheck,
  CircleX,
  Info,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { opusBadgeClass } from '@opusfesta/lib';
import type {
  ApprovalCategory,
  ApprovalRequest,
  ApprovalStatus,
} from './types';

export const ICONS: Record<ApprovalCategory['iconKey'], LucideIcon> = {
  Plane,
  PackageOpen,
  FileCheck2,
  FileSignature,
  Wallet,
  Car,
  UserPlus,
  ShoppingCart,
  FileText,
};

export const STATUS_TONE: Record<ApprovalStatus, string> = {
  'To Submit': opusBadgeClass({ tone: 'info', size: 'small' }),
  Submitted: opusBadgeClass({ tone: 'warning', size: 'small' }),
  Approved: opusBadgeClass({ tone: 'success', size: 'small' }),
  Refused: opusBadgeClass({ tone: 'error', size: 'small' }),
};

const STATUS_ICON: Record<ApprovalStatus, typeof Info> = {
  'To Submit': Info,
  Submitted: CircleAlert,
  Approved: CircleCheck,
  Refused: CircleX,
};

export function StatusPill({ status }: { status: ApprovalStatus }) {
  const StatusIcon = STATUS_ICON[status];
  return (
    <span className={STATUS_TONE[status]}>
      <StatusIcon aria-hidden="true" />
      <span className="opus-badge__label">{status}</span>
    </span>
  );
}

// Nullable on purpose: a request can outlive the type it was raised against.
// Falling back to a neutral chip keeps the row readable instead of throwing.
export function CategoryChip({
  category,
  fallback,
}: {
  category: ApprovalCategory | null;
  fallback?: string;
}) {
  if (!category) {
    return (
      <span className={opusBadgeClass({ tone: 'neutral', size: 'small' })}>
        {fallback ?? 'Retired type'}
      </span>
    );
  }
  const Icon = ICONS[category.iconKey];
  return (
    <span
      className={opusBadgeClass({ tone: 'neutral', size: 'small' })}
      style={{ backgroundColor: category.tint, color: category.accent }}
    >
      <Icon className="h-3 w-3" />
      {category.label}
    </span>
  );
}

export function OwnerCell({
  name,
  initials,
}: {
  name: string;
  initials: string;
}) {
  return (
    <div className="flex min-w-0 items-center gap-2">
      <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#F0DFF6] text-[10px] font-bold text-[#5B2D8E]">
        {initials}
      </span>
      <span className="truncate text-sm text-gray-700">{name}</span>
    </div>
  );
}

// Who the request is sitting with right now. The current schema routes a
// request to all its approvers at once (single stage), so "current" is the
// whole roster while Submitted. Once decided, the decision is in the
// activity feed rather than a structured column, so we don't guess here.
export function currentApproverLabel(r: ApprovalRequest): string {
  if (r.status !== 'Submitted') return 'Not routed';
  if (r.approvers.length === 0) return 'No approver set';
  return r.approvers.map((a) => a.name).join(', ');
}

export function formatDate(iso: string | null): string {
  if (!iso) return 'Not set';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'Not set';
  return d.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

// "3d ago" / "5h ago" — used for ageing signals where the exact timestamp
// matters less than how long something has been sitting.
export function formatAge(iso: string | null, now = Date.now()): string {
  if (!iso) return 'Not set';
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return 'Not set';
  const mins = Math.max(0, Math.floor((now - t) / 60000));
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

export function daysBetween(from: string, to: string): number | null {
  const a = new Date(from).getTime();
  const b = new Date(to).getTime();
  if (Number.isNaN(a) || Number.isNaN(b)) return null;
  return (b - a) / 86_400_000;
}

export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-gray-200 bg-white px-6 py-12 text-center">
      <p className="text-sm font-semibold text-gray-700">{title}</p>
      {hint && <p className="mt-1 text-xs text-gray-500">{hint}</p>}
    </div>
  );
}

export function FilterPills<T extends string>({
  options,
  value,
  onChange,
  counts,
}: {
  options: readonly T[];
  value: T;
  onChange: (next: T) => void;
  counts?: Partial<Record<T, number>>;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((o) => (
        <button
          data-opus-button="secondary"
          data-opus-button-size="small"
          key={o}
          type="button"
          onClick={() => onChange(o)}
          className={cn(
            'rounded-full px-3 py-1.5 text-xs font-semibold transition-colors',
            value === o
              ? 'bg-[#F0DFF6] text-[#5B2D8E]'
              : 'text-gray-500 hover:bg-gray-50'
          )}
        >
          {o}
          {counts?.[o] !== undefined && (
            <span
              className={cn(
                'ml-1.5',
                value === o ? 'text-[#7E5896]' : 'text-gray-400'
              )}
            >
              {counts[o]}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}
