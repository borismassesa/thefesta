'use client';

import { useMemo, useState } from 'react';
import {
  CalendarCheck,
  ChevronDown,
  CircleAlert,
  CircleCheck,
  CircleX,
  Filter,
  Globe,
  Info,
  MailCheck,
  MoreHorizontal,
  Plus,
  Search,
  Send,
  Sparkles,
  Upload,
  Users,
  Utensils,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { opusBadgeClass, type OpusBadgeTone } from '@opusfesta/lib';

// ── Types ─────────────────────────────────────────────────────────────────────

type RsvpStatus = 'confirmed' | 'pending' | 'declined' | 'no_response';
type Party =
  | 'bride_family'
  | 'groom_family'
  | 'bride_friends'
  | 'groom_friends'
  | 'work'
  | 'other';

type Guest = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  party: Party;
  status: RsvpStatus;
  plusOne: { allowed: boolean; name: string | null };
  dietary: string | null;
  table: number | null;
  rsvpAt: string | null;
};

// ── Constants ─────────────────────────────────────────────────────────────────

const PARTY_LABEL: Record<Party, string> = {
  bride_family: "Bride's family",
  groom_family: "Groom's family",
  bride_friends: "Bride's friends",
  groom_friends: "Groom's friends",
  work: 'Work',
  other: 'Other',
};

const PARTY_TONE: Record<Party, string> = {
  bride_family: 'bg-rose-50 text-rose-600',
  groom_family: 'bg-blue-50 text-blue-600',
  bride_friends: 'bg-violet-50 text-violet-600',
  groom_friends: 'bg-amber-50 text-amber-700',
  work: 'bg-slate-100 text-slate-600',
  other: 'bg-gray-100 text-gray-500',
};

const STATUS_LABEL: Record<RsvpStatus, string> = {
  confirmed: 'Confirmed',
  pending: 'Pending',
  declined: 'Declined',
  no_response: 'No reply',
};

const STATUS_TONE: Record<RsvpStatus, OpusBadgeTone> = {
  confirmed: 'success',
  pending: 'warning',
  declined: 'error',
  no_response: 'info',
};

const STATUS_ICON: Record<OpusBadgeTone, typeof Info> = {
  error: CircleX,
  info: Info,
  success: CircleCheck,
  warning: CircleAlert,
  neutral: Info,
};

// ── Mock data ─────────────────────────────────────────────────────────────────

const MOCK_GUESTS: Guest[] = [
  {
    id: '1',
    name: 'Amani Mwakalinga',
    email: 'amani.m@example.com',
    phone: '+255 712 000 001',
    party: 'bride_family',
    status: 'confirmed',
    plusOne: { allowed: true, name: 'Neema Mwakalinga' },
    dietary: null,
    table: 1,
    rsvpAt: '2026-04-12',
  },
  {
    id: '2',
    name: 'Joseph Kileo',
    email: 'jkileo@example.com',
    phone: '+255 754 000 002',
    party: 'groom_family',
    status: 'confirmed',
    plusOne: { allowed: false, name: null },
    dietary: null,
    table: 1,
    rsvpAt: '2026-04-14',
  },
  {
    id: '3',
    name: 'Grace Komba',
    email: 'grace.k@example.com',
    phone: '+255 786 000 003',
    party: 'bride_friends',
    status: 'pending',
    plusOne: { allowed: true, name: null },
    dietary: 'Vegan',
    table: null,
    rsvpAt: null,
  },
  {
    id: '4',
    name: 'David Mhina',
    email: null,
    phone: '+255 763 000 004',
    party: 'groom_friends',
    status: 'no_response',
    plusOne: { allowed: false, name: null },
    dietary: null,
    table: null,
    rsvpAt: null,
  },
  {
    id: '5',
    name: 'Esther Kessy',
    email: 'esther@example.com',
    phone: '+255 715 000 005',
    party: 'work',
    status: 'declined',
    plusOne: { allowed: false, name: null },
    dietary: null,
    table: null,
    rsvpAt: '2026-04-08',
  },
  {
    id: '6',
    name: 'Salim Hassan',
    email: 's.hassan@example.com',
    phone: '+255 745 000 006',
    party: 'bride_family',
    status: 'confirmed',
    plusOne: { allowed: true, name: 'Zuhura Hassan' },
    dietary: 'Halal',
    table: 2,
    rsvpAt: '2026-04-15',
  },
  {
    id: '7',
    name: 'Maria Lyimo',
    email: 'maria.l@example.com',
    phone: null,
    party: 'bride_friends',
    status: 'confirmed',
    plusOne: { allowed: false, name: null },
    dietary: 'Nut allergy',
    table: 3,
    rsvpAt: '2026-04-16',
  },
  {
    id: '8',
    name: 'Peter Mushi',
    email: 'p.mushi@example.com',
    phone: '+255 762 000 008',
    party: 'groom_friends',
    status: 'pending',
    plusOne: { allowed: false, name: null },
    dietary: null,
    table: null,
    rsvpAt: null,
  },
  {
    id: '9',
    name: 'Linda Nkya',
    email: 'linda@example.com',
    phone: '+255 717 000 009',
    party: 'work',
    status: 'pending',
    plusOne: { allowed: true, name: null },
    dietary: 'Vegetarian',
    table: null,
    rsvpAt: null,
  },
  {
    id: '10',
    name: 'Rashidi Juma',
    email: 'rashidi.j@example.com',
    phone: '+255 757 000 010',
    party: 'groom_family',
    status: 'confirmed',
    plusOne: { allowed: true, name: 'Asha Juma' },
    dietary: 'Halal',
    table: 2,
    rsvpAt: '2026-04-13',
  },
  {
    id: '11',
    name: 'Tatu Mbwana',
    email: 'tatu.m@example.com',
    phone: '+255 783 000 011',
    party: 'bride_family',
    status: 'no_response',
    plusOne: { allowed: true, name: null },
    dietary: null,
    table: null,
    rsvpAt: null,
  },
  {
    id: '12',
    name: 'Musa Lwakatare',
    email: 'musa@example.com',
    phone: '+255 716 000 012',
    party: 'other',
    status: 'confirmed',
    plusOne: { allowed: false, name: null },
    dietary: null,
    table: 4,
    rsvpAt: '2026-04-17',
  },
];

// MOCK wedding context (would come from couple_profile in v2)
const WEDDING_DATE = '2026-08-22';
const WEBSITE_URL = 'opusfesta.com/amani-and-neema';

// ── Helpers ───────────────────────────────────────────────────────────────────

function initials(name: string): string {
  return name
    .split(/\s+/)
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

function daysUntil(iso: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const d = new Date(iso);
  d.setHours(0, 0, 0, 0);
  return Math.ceil((d.getTime() - today.getTime()) / 86400000);
}

function headcount(guests: Guest[]): number {
  return guests.reduce(
    (n, g) => n + 1 + (g.plusOne.allowed && g.status === 'confirmed' ? 1 : 0),
    0
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function StatCard({
  label,
  value,
  sub,
  active,
  tone,
  onClick,
}: {
  label: string;
  value: number | string;
  sub?: string;
  active: boolean;
  tone: 'neutral' | 'emerald' | 'amber' | 'red';
  onClick: () => void;
}) {
  const toneActive: Record<typeof tone, string> = {
    neutral: 'bg-[#1A1A1A] text-white border-[#1A1A1A]',
    emerald: 'bg-emerald-600 text-white border-emerald-600',
    amber: 'bg-amber-500 text-white border-amber-500',
    red: 'bg-red-500 text-white border-red-500',
  };
  const toneIdle: Record<typeof tone, string> = {
    neutral: 'bg-white text-[#1A1A1A] border-gray-100 hover:border-gray-200',
    emerald: 'bg-white text-[#1A1A1A] border-gray-100 hover:border-emerald-200',
    amber: 'bg-white text-[#1A1A1A] border-gray-100 hover:border-amber-200',
    red: 'bg-white text-[#1A1A1A] border-gray-100 hover:border-red-200',
  };

  return (
    <button
      data-opus-button="control"
      type="button"
      onClick={onClick}
      className={cn(
        'rounded-2xl border p-4 text-left transition-all flex flex-col gap-1 min-w-0',
        active ? toneActive[tone] : toneIdle[tone]
      )}
    >
      <span className="text-2xl sm:text-3xl font-extrabold tracking-tight">
        {value}
      </span>
      <span
        className={cn(
          'text-[10px] font-extrabold uppercase tracking-[0.12em]',
          active ? 'text-white/70' : 'text-gray-400'
        )}
      >
        {label}
      </span>
      {sub && (
        <span
          className={cn(
            'text-[11px] font-medium mt-0.5',
            active ? 'text-white/80' : 'text-gray-400'
          )}
        >
          {sub}
        </span>
      )}
    </button>
  );
}

function StatusPill({ status }: { status: RsvpStatus }) {
  const tone = STATUS_TONE[status];
  const StatusIcon = STATUS_ICON[tone];
  return (
    <span className={opusBadgeClass({ tone, size: 'small' })}>
      <StatusIcon aria-hidden="true" />
      <span className="opus-badge__label">{STATUS_LABEL[status]}</span>
    </span>
  );
}

function PartyPill({ party }: { party: Party }) {
  return (
    <span
      className={cn(
        'inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-semibold',
        PARTY_TONE[party]
      )}
    >
      {PARTY_LABEL[party]}
    </span>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

type StatusFilter = RsvpStatus | 'all';

export default function GuestsClient() {
  const [guests] = useState<Guest[]>(MOCK_GUESTS);
  const [filter, setFilter] = useState<StatusFilter>('all');
  const [partyFilter, setPartyFilter] = useState<Party | 'all'>('all');
  const [search, setSearch] = useState('');

  const counts = useMemo(
    () => ({
      total: guests.length,
      confirmed: guests.filter((g) => g.status === 'confirmed').length,
      pending: guests.filter((g) => g.status === 'pending').length,
      declined: guests.filter((g) => g.status === 'declined').length,
      noReply: guests.filter((g) => g.status === 'no_response').length,
      plusOnes: guests.filter(
        (g) => g.plusOne.allowed && g.status === 'confirmed'
      ).length,
      head: headcount(guests),
    }),
    [guests]
  );

  const filtered = useMemo(() => {
    return guests.filter((g) => {
      if (filter !== 'all' && g.status !== filter) return false;
      if (partyFilter !== 'all' && g.party !== partyFilter) return false;
      if (search.trim()) {
        const q = search.trim().toLowerCase();
        if (
          !g.name.toLowerCase().includes(q) &&
          !g.email?.toLowerCase().includes(q)
        )
          return false;
      }
      return true;
    });
  }, [guests, filter, partyFilter, search]);

  const days = daysUntil(WEDDING_DATE);
  const replyRate = Math.round(
    ((counts.confirmed + counts.declined) / counts.total) * 100
  );

  return (
    <div className="px-4 py-6 sm:px-8 max-w-6xl">
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-6">
        <div>
          <div className="flex items-center gap-2 mb-0.5">
            <Users className="w-5 h-5 text-[#1A1A1A]" />
            <h1 className="text-2xl font-extrabold text-[#1A1A1A] tracking-tight">
              Guest List
            </h1>
          </div>
          <p className="text-sm text-gray-400">
            <span className="font-semibold text-[#1A1A1A]">
              {counts.confirmed}
            </span>{' '}
            of {counts.total} confirmed
            <span className="mx-2 text-gray-300">·</span>
            <span className="font-semibold text-[#1A1A1A]">
              {counts.head}
            </span>{' '}
            seats needed
            {days > 0 && (
              <>
                <span className="mx-2 text-gray-300">·</span>
                <span className="text-gray-500">{days} days to go</span>
              </>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            data-opus-button="neutral"
            data-opus-button-size="small"
            type="button"
            className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-full border-2 border-gray-200 text-xs font-bold text-[#1A1A1A] bg-white hover:bg-gray-50 transition-colors"
          >
            <Upload className="w-3.5 h-3.5" />
            Import CSV
          </button>
          <button
            data-opus-button="primary"
            data-opus-button-size="small"
            type="button"
            className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-full bg-(--accent) text-(--on-accent) text-xs font-bold hover:bg-(--accent-hover) transition-colors"
          >
            <Send className="w-3.5 h-3.5" />
            Send invitations
          </button>
        </div>
      </div>

      {/* ── Stats / filter strip ───────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 mb-6">
        <StatCard
          label="Invited"
          value={counts.total}
          sub={`${counts.plusOnes} plus-ones`}
          active={filter === 'all'}
          tone="neutral"
          onClick={() => setFilter('all')}
        />
        <StatCard
          label="Confirmed"
          value={counts.confirmed}
          sub={`${counts.head} seats`}
          active={filter === 'confirmed'}
          tone="emerald"
          onClick={() => setFilter('confirmed')}
        />
        <StatCard
          label="Pending"
          value={counts.pending}
          sub={counts.noReply > 0 ? `${counts.noReply} no reply` : undefined}
          active={filter === 'pending'}
          tone="amber"
          onClick={() => setFilter('pending')}
        />
        <StatCard
          label="Declined"
          value={counts.declined}
          sub={`${replyRate}% replied`}
          active={filter === 'declined'}
          tone="red"
          onClick={() => setFilter('declined')}
        />
      </div>

      {/* ── Action bar ─────────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row gap-2.5 mb-4">
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-300" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name or email…"
            className="w-full pl-10 pr-9 py-2.5 rounded-full border border-gray-200 bg-white text-sm placeholder:text-gray-300 focus:outline-none focus:border-[#1A1A1A] transition-colors"
          />
          {search && (
            <button
              data-opus-button="control"
              type="button"
              onClick={() => setSearch('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 p-0.5 rounded-full text-gray-300 hover:text-[#1A1A1A]"
              aria-label="Clear search"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
        <div className="relative">
          <Filter className="absolute left-3.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
          <select
            value={partyFilter}
            onChange={(e) => setPartyFilter(e.target.value as Party | 'all')}
            className="appearance-none pl-9 pr-9 py-2.5 rounded-full border border-gray-200 bg-white text-xs font-semibold text-[#1A1A1A] focus:outline-none focus:border-[#1A1A1A] transition-colors cursor-pointer"
          >
            <option value="all">All groups</option>
            {(Object.keys(PARTY_LABEL) as Party[]).map((p) => (
              <option key={p} value={p}>
                {PARTY_LABEL[p]}
              </option>
            ))}
          </select>
          <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
        </div>
        <button
          data-opus-button="primary"
          data-opus-button-size="small"
          type="button"
          className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-full bg-[#1A1A1A] text-white text-xs font-bold hover:bg-[#333] transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />
          Add guest
        </button>
      </div>

      {/* ── Guest list / table ─────────────────────────────────────────────── */}
      {filtered.length === 0 ? (
        <EmptyState
          onClear={() => {
            setFilter('all');
            setPartyFilter('all');
            setSearch('');
          }}
          hasFilter={filter !== 'all' || partyFilter !== 'all' || !!search}
        />
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden md:block bg-white rounded-2xl border border-gray-100 overflow-hidden">
            <table className="opus-table w-full text-sm">
              <thead>
                <tr className="text-left text-[10px] font-extrabold uppercase tracking-[0.12em] text-gray-400 border-b border-gray-100">
                  <th className="px-5 py-3">Guest</th>
                  <th className="px-3 py-3">Group</th>
                  <th className="px-3 py-3">Plus-one</th>
                  <th className="px-3 py-3">Notes</th>
                  <th className="px-3 py-3">Status</th>
                  <th className="px-3 py-3 text-right pr-5">Table</th>
                  <th className="w-10" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filtered.map((g) => (
                  <tr
                    key={g.id}
                    className="hover:bg-gray-50/60 transition-colors"
                  >
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-9 h-9 rounded-full bg-(--accent)/15 text-(--on-accent) flex items-center justify-center text-xs font-bold shrink-0">
                          {initials(g.name)}
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-bold text-[#1A1A1A] truncate">
                            {g.name}
                          </p>
                          <p className="text-xs text-gray-400 truncate">
                            {g.email ?? g.phone ?? (
                              <span className="italic text-gray-300">
                                No contact
                              </span>
                            )}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      <PartyPill party={g.party} />
                    </td>
                    <td className="px-3 py-3">
                      {g.plusOne.allowed ? (
                        g.plusOne.name ? (
                          <span className="text-xs text-[#1A1A1A] font-medium">
                            {g.plusOne.name}
                          </span>
                        ) : (
                          <span className="text-xs text-gray-400">
                            +1 invited
                          </span>
                        )
                      ) : (
                        <span className="text-xs text-gray-300">—</span>
                      )}
                    </td>
                    <td className="px-3 py-3">
                      {g.dietary ? (
                        <span className="inline-flex items-center gap-1 text-xs text-amber-700 bg-amber-50 rounded-full px-2 py-0.5 font-medium">
                          <Utensils className="w-3 h-3" />
                          {g.dietary}
                        </span>
                      ) : (
                        <span className="text-xs text-gray-300">—</span>
                      )}
                    </td>
                    <td className="px-3 py-3">
                      <StatusPill status={g.status} />
                    </td>
                    <td className="px-3 py-3 text-right pr-5">
                      {g.table ? (
                        <span className="inline-flex items-center justify-center w-7 h-7 rounded-md bg-gray-100 text-xs font-bold text-[#1A1A1A]">
                          {g.table}
                        </span>
                      ) : (
                        <span className="text-xs text-gray-300">—</span>
                      )}
                    </td>
                    <td className="pr-3">
                      <button
                        data-opus-button="control"
                        type="button"
                        className="p-1.5 rounded-md text-gray-300 hover:text-[#1A1A1A] hover:bg-gray-100 transition-colors"
                        aria-label="More actions"
                      >
                        <MoreHorizontal className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <ul className="md:hidden space-y-2">
            {filtered.map((g) => (
              <li
                key={g.id}
                className="bg-white rounded-2xl border border-gray-100 p-4 flex items-start gap-3"
              >
                <div className="w-9 h-9 rounded-full bg-(--accent)/15 text-(--on-accent) flex items-center justify-center text-xs font-bold shrink-0">
                  {initials(g.name)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-[#1A1A1A] truncate">
                        {g.name}
                      </p>
                      <p className="text-xs text-gray-400 truncate">
                        {g.email ?? g.phone ?? (
                          <span className="italic text-gray-300">
                            No contact
                          </span>
                        )}
                      </p>
                    </div>
                    <StatusPill status={g.status} />
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5 mt-2">
                    <PartyPill party={g.party} />
                    {g.plusOne.allowed && (
                      <span className="text-[11px] text-gray-500 bg-gray-100 rounded-full px-2 py-0.5 font-semibold">
                        +1{' '}
                        {g.plusOne.name
                          ? `· ${g.plusOne.name.split(' ')[0]}`
                          : ''}
                      </span>
                    )}
                    {g.dietary && (
                      <span className="inline-flex items-center gap-1 text-[11px] text-amber-700 bg-amber-50 rounded-full px-2 py-0.5 font-medium">
                        <Utensils className="w-3 h-3" />
                        {g.dietary}
                      </span>
                    )}
                    {g.table && (
                      <span className="text-[11px] text-gray-500 bg-gray-100 rounded-full px-2 py-0.5 font-semibold">
                        Table {g.table}
                      </span>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}

      {/* ── Side cards ─────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-6">
        <SideCard
          icon={MailCheck}
          title="Invitations"
          metric={`${counts.confirmed + counts.declined} / ${counts.total}`}
          sub="Replies received"
          cta="Send a reminder"
        />
        <SideCard
          icon={Globe}
          title="Wedding website"
          metric={WEBSITE_URL}
          metricSize="sm"
          sub="Guests RSVP here"
          cta="Open RSVP form"
        />
        <SideCard
          icon={CalendarCheck}
          title="Seating planner"
          metric={`${guests.filter((g) => g.table).length} / ${counts.confirmed} seated`}
          sub="Auto-suggest tables"
          cta="Open seating chart"
        />
      </div>

      <p className="text-xs text-gray-300 mt-8 text-center">
        Preview with sample data. Add your guests to start tracking real RSVPs.
      </p>
    </div>
  );
}

// ── Empty state ───────────────────────────────────────────────────────────────

function EmptyState({
  onClear,
  hasFilter,
}: {
  onClear: () => void;
  hasFilter: boolean;
}) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 px-6 py-14 text-center">
      <div className="w-12 h-12 rounded-2xl bg-(--accent)/10 flex items-center justify-center mx-auto mb-4">
        <Sparkles className="w-5 h-5 text-(--accent)" />
      </div>
      <p className="font-bold text-[#1A1A1A] mb-1">
        {hasFilter
          ? 'No guests match those filters'
          : 'Your guest list is empty'}
      </p>
      <p className="text-sm text-gray-500 max-w-sm mx-auto leading-relaxed mb-5">
        {hasFilter
          ? 'Try a different group or status, or clear the filters to see everyone.'
          : 'Add guests one by one or import them in bulk from a spreadsheet.'}
      </p>
      {hasFilter ? (
        <button
          data-opus-button="control"
          type="button"
          onClick={onClear}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full border-2 border-gray-200 text-xs font-bold text-[#1A1A1A] hover:bg-gray-50 transition-colors"
        >
          Clear filters
        </button>
      ) : (
        <div className="inline-flex items-center gap-2">
          <button
            data-opus-button="primary"
            data-opus-button-size="small"
            type="button"
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-[#1A1A1A] text-white text-xs font-bold hover:bg-[#333] transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            Add first guest
          </button>
          <button
            data-opus-button="control"
            type="button"
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full border-2 border-gray-200 text-xs font-bold text-[#1A1A1A] hover:bg-gray-50 transition-colors"
          >
            <Upload className="w-3.5 h-3.5" />
            Import CSV
          </button>
        </div>
      )}
    </div>
  );
}

// ── Side card ─────────────────────────────────────────────────────────────────

function SideCard({
  icon: Icon,
  title,
  metric,
  sub,
  cta,
  metricSize = 'lg',
}: {
  icon: React.ElementType;
  title: string;
  metric: string;
  sub: string;
  cta: string;
  metricSize?: 'sm' | 'lg';
}) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-5 flex flex-col">
      <div className="flex items-center gap-2 mb-3">
        <div className="w-8 h-8 rounded-lg bg-gray-50 flex items-center justify-center">
          <Icon className="w-4 h-4 text-[#1A1A1A]" />
        </div>
        <span className="text-[10px] font-extrabold uppercase tracking-[0.12em] text-gray-400">
          {title}
        </span>
      </div>
      <p
        className={cn(
          'font-extrabold text-[#1A1A1A] tracking-tight mb-0.5 break-words',
          metricSize === 'lg' ? 'text-xl' : 'text-sm'
        )}
      >
        {metric}
      </p>
      <p className="text-xs text-gray-400 mb-4">{sub}</p>
      <button
        data-opus-button="control"
        type="button"
        className="inline-flex items-center gap-1 text-xs font-bold text-(--accent) hover:text-(--accent-hover) transition-colors mt-auto self-start"
      >
        {cta} →
      </button>
    </div>
  );
}
