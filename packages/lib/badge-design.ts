/** Product-wide Opus badge contract shared by every web application. */
export type OpusBadgeTone =
  | 'error'
  | 'info'
  | 'success'
  | 'warning'
  | 'neutral';

export type OpusBadgeSize = 'medium' | 'small';

const ERROR_STATUS_WORDS = [
  'error',
  'reject',
  'refus',
  'declin',
  'cancel',
  'expire',
  'withdraw',
  'fail',
  'revok',
  'blocked',
  'archiv',
  'closed',
  'inactive',
  'duplicate',
];
const SUCCESS_STATUS_WORDS = [
  'success',
  'approved',
  'hired',
  'accepted',
  'signed',
  'passed',
  'completed',
  'filled',
  'published',
  'live',
  'active',
  'open',
];
const WARNING_STATUS_WORDS = [
  'warning',
  'pending',
  'submitted',
  'review',
  'scheduled',
  'sent',
  'await',
  'hold',
  'shortlist',
  'interview',
  'progress',
  'requested',
];
const INFO_STATUS_WORDS = ['info', 'draft', 'new', 'revision', 'unlisted'];

export function opusStatusBadgeTone(status: string): OpusBadgeTone {
  const key = status.trim().toLowerCase();
  if (ERROR_STATUS_WORDS.some((word) => key.includes(word))) return 'error';
  if (SUCCESS_STATUS_WORDS.some((word) => key.includes(word))) return 'success';
  if (WARNING_STATUS_WORDS.some((word) => key.includes(word))) return 'warning';
  if (INFO_STATUS_WORDS.some((word) => key.includes(word))) return 'info';
  return 'neutral';
}

export function opusBadgeClass({
  tone = 'neutral',
  size = 'medium',
}: {
  tone?: OpusBadgeTone;
  size?: OpusBadgeSize;
} = {}): string {
  return `opus-badge opus-badge--${tone} opus-badge--${size}`;
}
