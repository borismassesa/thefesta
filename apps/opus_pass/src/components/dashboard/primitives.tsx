import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import type { RsvpStatus } from '@/lib/dashboard/types';
import { opusBadgeClass, type OpusBadgeTone } from '@opusfesta/lib';
import { CircleAlert, CircleCheck, CircleX, Info } from 'lucide-react';

export function Card({
  children,
  className,
  id,
}: {
  children: ReactNode;
  className?: string;
  id?: string;
}) {
  return (
    <div
      id={id}
      className={cn(
        'rounded-2xl border border-black/[0.06] bg-white shadow-[0_1px_3px_rgba(0,0,0,0.04)]',
        className
      )}
    >
      {children}
    </div>
  );
}

export function StatCard({
  label,
  value,
  hint,
  icon,
  accent,
}: {
  label: string;
  value: string | number;
  hint?: string;
  icon?: ReactNode;
  accent?: boolean;
}) {
  return (
    <Card className={cn('p-5', accent && 'border-[#1A1A1A]/15')}>
      <div className="flex items-start justify-between gap-3">
        {/* min-w-0 lets this column shrink below its content width. Without it
            a long value (a TZS total, say) forced the card wider than its grid
            cell and pushed the icon out past the card edge on phones. */}
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wide text-[#1A1A1A]/50">
            {label}
          </p>
          <p className="mt-1.5 break-words text-2xl font-bold tracking-tight text-[#1A1A1A] sm:text-3xl">
            {value}
          </p>
          {hint ? (
            <p className="mt-1 text-xs text-[#1A1A1A]/50">{hint}</p>
          ) : null}
        </div>
        {icon ? (
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-black/[0.05] text-[#1A1A1A]/70">
            {icon}
          </span>
        ) : null}
      </div>
    </Card>
  );
}

export function SectionTitle({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h2 className="text-lg font-semibold tracking-tight text-[#1A1A1A]">
          {title}
        </h2>
        {subtitle ? (
          <p className="mt-0.5 text-sm text-[#1A1A1A]/55">{subtitle}</p>
        ) : null}
      </div>
      {action}
    </div>
  );
}

const STATUS_TONES: Record<RsvpStatus, OpusBadgeTone> = {
  attending: 'success',
  declined: 'error',
  maybe: 'warning',
  pending: 'info',
};

const STATUS_ICONS: Record<OpusBadgeTone, typeof Info> = {
  error: CircleX,
  info: Info,
  success: CircleCheck,
  warning: CircleAlert,
  neutral: Info,
};

const STATUS_TEXT: Record<RsvpStatus, string> = {
  attending: 'Attending',
  declined: 'Declined',
  maybe: 'Maybe',
  pending: 'Awaiting',
};

export function StatusPill({
  status,
  className,
}: {
  status: RsvpStatus;
  className?: string;
}) {
  const tone = STATUS_TONES[status];
  const StatusIcon = STATUS_ICONS[tone];
  return (
    <span className={cn(opusBadgeClass({ tone, size: 'small' }), className)}>
      <StatusIcon aria-hidden="true" />
      <span className="opus-badge__label">{STATUS_TEXT[status]}</span>
    </span>
  );
}

export function ProgressBar({ value }: { value: number }) {
  const clamped = Math.max(0, Math.min(100, value));
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-black/[0.06]">
      <div
        className="h-full rounded-full bg-[#1A1A1A] transition-all"
        style={{ width: `${clamped}%` }}
      />
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <Card className="flex flex-col items-center justify-center px-6 py-14 text-center">
      {icon ? (
        <span className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-black/[0.05] text-[#1A1A1A]/70">
          {icon}
        </span>
      ) : null}
      <h3 className="text-base font-semibold text-[#1A1A1A]">{title}</h3>
      {description ? (
        <p className="mt-1 max-w-sm text-sm text-[#1A1A1A]/55">{description}</p>
      ) : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </Card>
  );
}
