import { cn } from '@/lib/utils';
import { opusBadgeClass, type OpusBadgeTone } from '@opusfesta/lib';
import { CircleAlert, CircleCheck, CircleX, Info } from 'lucide-react';

type Tone = 'green' | 'amber' | 'rose' | 'purple' | 'blue' | 'gray';

// Soft-background pill — no indicator dot, no all-caps. Quiet metadata
// styling so pills don't compete with the row data itself.
const BADGE_TONE: Record<Tone, OpusBadgeTone> = {
  green: 'success',
  amber: 'warning',
  rose: 'error',
  purple: 'info',
  blue: 'info',
  gray: 'neutral',
};

const BADGE_ICON: Record<OpusBadgeTone, typeof Info> = {
  error: CircleX,
  info: Info,
  success: CircleCheck,
  warning: CircleAlert,
  neutral: Info,
};

export default function StatusPill({
  tone,
  label,
  className,
}: {
  tone: Tone;
  label: string;
  className?: string;
}) {
  const badgeTone = BADGE_TONE[tone];
  const BadgeIcon = BADGE_ICON[badgeTone];
  return (
    <span
      className={cn(
        opusBadgeClass({ tone: badgeTone, size: 'small' }),
        className
      )}
    >
      <BadgeIcon aria-hidden="true" />
      <span className="opus-badge__label">{label}</span>
    </span>
  );
}
