// Shared presentation for the Recruitment module.
//
// This is a deliberate port of the Approvals module's ui.tsx so the two read as
// one product: same card shell and shadow, same uppercase column headers, same
// status tones, same dashed empty state, same stat tiles. Approvals owns the
// canonical values — when it changes, change them here too.
//
// Server-safe on purpose (no 'use client'): every Recruitment list page is a
// server component, and none of these primitives need state.

import Link from 'next/link';
import {
  ArrowRight,
  CircleAlert,
  CircleCheck,
  CircleX,
  Info,
} from 'lucide-react';
import {
  opusBadgeClass,
  opusButtonClass,
  opusStatusBadgeTone,
  type OpusBadgeTone,
  type OpusButtonSize,
  type OpusButtonVariant,
} from '@opusfesta/lib';
import { cn } from '@/lib/utils';

/** The Approvals card shell: soft border, white, very low-contrast lift. */
export const PANEL =
  'overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)]';

/** Column-header strip that sits directly under a panel's top edge. */
export const TABLE_HEADER =
  'border-b border-gray-100 bg-gray-50/60 px-5 py-3 text-[11px] font-bold uppercase tracking-wider text-gray-500';

/** A clickable list row inside a panel. */
export const ROW =
  'w-full border-b border-gray-100 px-5 py-3 text-left transition-colors last:border-b-0 hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#C9A0DC]';

/** Shared controls keep every Recruitment workflow on the same visual rhythm. */
export const FIELD =
  'w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 transition focus:border-transparent focus:outline-none focus:ring-2 focus:ring-[#C9A0DC] disabled:cursor-not-allowed disabled:bg-gray-50 disabled:text-gray-500';

export const FIELD_LABEL =
  'mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-gray-500';

/**
 * Canonical OpusPass button system.
 *
 * Geometry follows the supplied product-design reference: a full pill, three
 * named heights (52 / 44 / 30), consistent gaps, and one focus treatment.
 * Colour remains ours: lavender is the primary action surface, pale lavender
 * is secondary, and rose/amber are reserved for semantic outcomes.
 */
export type ButtonVariant = OpusButtonVariant;
export type ButtonSize = OpusButtonSize;

export function buttonStyles({
  variant = 'primary',
  size = 'medium',
}: {
  variant?: ButtonVariant;
  size?: ButtonSize;
} = {}): string {
  return opusButtonClass({ variant, size });
}

/** Positive workflow action: create, submit, approve, publish, or complete. */
export const PRIMARY_BUTTON = buttonStyles();
export const PRIMARY_BUTTON_LARGE = buttonStyles({ size: 'large' });
export const PRIMARY_BUTTON_SMALL = buttonStyles({ size: 'small' });

export const SECONDARY_BUTTON = buttonStyles({ variant: 'secondary' });
export const SECONDARY_BUTTON_SMALL = buttonStyles({
  variant: 'secondary',
  size: 'small',
});
export const NEUTRAL_BUTTON = buttonStyles({ variant: 'neutral' });
export const NEUTRAL_BUTTON_SMALL = buttonStyles({
  variant: 'neutral',
  size: 'small',
});

/** Destructive workflow action: reject, remove, block, or archive. */
export const DANGER_BUTTON = buttonStyles({ variant: 'danger' });
export const DANGER_BUTTON_SMALL = buttonStyles({
  variant: 'danger',
  size: 'small',
});

/** Caution workflow action: defer, pause, or request changes. */
export const WARNING_BUTTON = buttonStyles({ variant: 'warning' });
export const WARNING_BUTTON_SMALL = buttonStyles({
  variant: 'warning',
  size: 'small',
});

export const SUMMARY =
  'flex cursor-pointer list-none items-center gap-3 rounded-lg text-sm font-semibold text-gray-900 transition-colors hover:text-[#5B2D8E] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C9A0DC] focus-visible:ring-offset-2';

// Recruitment statuses are free-form strings drawn from a dozen tables
// (requisition, application, interview, offer, agency…), so a per-value map
// would be wrong the moment a table gains a state. These match on lifecycle
// meaning instead, and land on the four Approvals tones.
export function statusTone(status: string): string {
  return opusBadgeClass({ tone: opusStatusBadgeTone(status), size: 'small' });
}

const BADGE_ICONS: Record<OpusBadgeTone, typeof Info> = {
  error: CircleX,
  info: Info,
  success: CircleCheck,
  warning: CircleAlert,
  neutral: Info,
};

export function StatusPill({ status }: { status: string }) {
  const BadgeIcon = BADGE_ICONS[opusStatusBadgeTone(status)];
  return (
    <span
      className={cn('max-w-full capitalize', statusTone(status))}
      title={status.replaceAll('_', ' ')}
    >
      <BadgeIcon aria-hidden="true" />
      <span className="opus-badge__label">{status.replaceAll('_', ' ')}</span>
    </span>
  );
}

/** Neutral metadata chip — the recruitment equivalent of a CategoryChip. */
export function Chip({ label }: { label: string }) {
  return (
    <span
      className={`${opusBadgeClass({ tone: 'neutral', size: 'small' })} capitalize`}
    >
      <span className="opus-badge__label">{label.replaceAll('_', ' ')}</span>
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

export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '—';
  return (parts[0][0] + (parts[1]?.[0] ?? '')).toUpperCase();
}

export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-gray-200 bg-white px-6 py-12 text-center">
      <p className="text-sm font-semibold text-gray-700">{title}</p>
      {hint && <p className="mt-1 text-xs text-gray-500">{hint}</p>}
    </div>
  );
}

export function Panel({
  title,
  action,
  children,
}: {
  title: string;
  action?: { label: string; href: string };
  children: React.ReactNode;
}) {
  return (
    <section className={PANEL}>
      <div className="flex items-center justify-between border-b border-gray-100 px-5 py-3">
        <h2 className="text-xs font-bold uppercase tracking-wider text-gray-500">
          {title}
        </h2>
        {action && (
          <Link
            href={action.href}
            className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold text-[#5B2D8E] hover:bg-[#F8EDFF]"
          >
            {action.label}
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        )}
      </div>
      {children}
    </section>
  );
}

/**
 * The Approvals stat tile: tinted gradient, accent-coloured label, and an arrow
 * that says the number is a filter you can open. Recruitment navigates by URL
 * rather than tab state, so this is a Link where Approvals uses a button.
 *
 * `href` is optional. A reported metric is often just a number — "median time
 * to hire" has nowhere to drill into — and a tile that looks clickable but is
 * not is worse than one that plainly is not. Without it the tile renders as a
 * div and drops the arrow, keeping the gradient and the weight.
 */
export function StatTile({
  label,
  value,
  hint,
  accent,
  tint,
  href,
  emphasis,
}: {
  label: string;
  value: number | string;
  hint?: string;
  accent: string;
  tint: string;
  href?: string;
  emphasis?: boolean;
}) {
  const className = cn(
    'rounded-2xl border px-4 py-3 text-left',
    href &&
      'group transition hover:shadow-[0_6px_20px_-8px_rgba(0,0,0,0.15)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C9A0DC]',
    emphasis ? 'border-transparent' : 'border-gray-100'
  );
  const style = {
    background: `linear-gradient(150deg, ${tint} 0%, #FFFFFF 70%)`,
    ...(emphasis ? { boxShadow: `inset 0 0 0 2px ${accent}33` } : {}),
  };
  const body = (
    <>
      <span
        className="text-[11px] font-bold uppercase tracking-wider"
        style={{ color: accent }}
      >
        {label}
      </span>
      <span className="mt-1 flex items-baseline gap-2">
        <span className="text-2xl font-semibold text-gray-900">{value}</span>
        {href && (
          <ArrowRight className="h-3.5 w-3.5 text-gray-300 transition group-hover:translate-x-0.5 group-hover:text-gray-500" />
        )}
      </span>
      {hint && (
        <span className="mt-0.5 block truncate text-[11px] text-gray-500">
          {hint}
        </span>
      )}
    </>
  );
  if (!href)
    return (
      <div className={className} style={style}>
        {body}
      </div>
    );
  return (
    <Link href={href} className={className} style={style}>
      {body}
    </Link>
  );
}

/** The tint/accent pairs Approvals uses for its four overview tiles. */
export const TILE_TONES = {
  amber: { accent: '#8A5A09', tint: '#FEF3DB' },
  blue: { accent: '#1F5D8C', tint: '#E5F2FB' },
  green: { accent: '#166534', tint: '#E6F1E6' },
  rose: { accent: '#9B1D4C', tint: '#FCE4EC' },
  violet: { accent: '#5B2D8E', tint: '#F7EAFB' },
} as const;

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
