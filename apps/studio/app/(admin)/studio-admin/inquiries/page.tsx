'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { BsInbox } from 'react-icons/bs';
import AdminBadge from '@/components/admin/ui/AdminBadge';

interface Inquiry {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  project_type: string | null;
  budget_range: string | null;
  timeline: string | null;
  message: string | null;
  status: string;
  assigned_to: string | null;
  internal_notes: string | null;
  created_at: string;
  updated_at: string;
}

const STATUS_OPTIONS = [
  { value: '',            label: 'All' },
  { value: 'new',         label: 'New' },
  { value: 'contacted',   label: 'Contacted' },
  { value: 'qualified',   label: 'Qualified' },
  { value: 'closed_won',  label: 'Won' },
  { value: 'closed_lost', label: 'Lost' },
  { value: 'spam',        label: 'Spam' },
];

function formatRelative(iso: string): string {
  const then = new Date(iso).getTime();
  const diffMs = Date.now() - then;
  const mins = Math.round(diffMs / (60 * 1000));
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.round(days / 30);
  return `${months}mo ago`;
}

export default function InquiriesPage() {
  const [inquiries, setInquiries] = useState<Inquiry[]>([]);
  const [status, setStatus] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Inquiry | null>(null);

  const load = () => {
    setLoading(true);
    const qs = status ? `?status=${status}` : '';
    fetch(`/api/admin/inquiries${qs}`)
      .then((r) => r.json())
      .then((d) => setInquiries(d.inquiries ?? []))
      .finally(() => setLoading(false));
  };

  useEffect(load, [status]);

  const updateStatus = async (id: string, newStatus: string) => {
    const res = await fetch(`/api/admin/inquiries/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus }),
    });
    if (res.ok) {
      load();
      setSelected(null);
    }
  };

  return (
    <div className="p-6 lg:p-8 max-w-[1400px] mx-auto">
      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-[var(--admin-foreground)] tracking-tight">Inquiries</h1>
          <p className="text-sm text-[var(--admin-muted)] mt-1">
            Leads captured through the public contact form
          </p>
        </div>
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="text-[12px] font-medium px-3 py-2 bg-white border border-[var(--admin-sidebar-border)] text-[var(--admin-foreground)] focus:outline-none focus:border-[var(--admin-primary)]"
        >
          {STATUS_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      </div>

      {loading && inquiries.length === 0 ? (
        <div className="animate-pulse space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-14 bg-[var(--admin-sidebar-border)]" />
          ))}
        </div>
      ) : inquiries.length === 0 ? (
        <div className="bg-white border border-[var(--admin-sidebar-border)] p-12 text-center">
          <BsInbox className="w-8 h-8 text-[var(--admin-muted)] mx-auto mb-3" />
          <p className="text-sm text-[var(--admin-muted)]">
            No {status || 'inquiries'} yet.
          </p>
          <p className="text-xs text-[var(--admin-muted)] mt-1">
            New leads from the public <Link href="/contact" className="text-[var(--admin-primary)] hover:underline">/contact</Link> form will appear here.
          </p>
        </div>
      ) : (
        <div className="bg-white border border-[var(--admin-sidebar-border)]">
          <table className="opus-table w-full">
            <thead>
              <tr className="text-left border-b border-[var(--admin-sidebar-border)]">
                <th className="px-5 py-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--admin-muted)]">Name</th>
                <th className="px-5 py-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--admin-muted)]">Project</th>
                <th className="px-5 py-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--admin-muted)]">Status</th>
                <th className="px-5 py-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--admin-muted)] text-right">Received</th>
              </tr>
            </thead>
            <tbody>
              {inquiries.map((i) => (
                <tr
                  key={i.id}
                  onClick={() => setSelected(i)}
                  className="border-b border-[var(--admin-sidebar-border)] last:border-b-0 hover:bg-[var(--admin-sidebar-accent)] cursor-pointer transition-colors"
                >
                  <td className="px-5 py-3">
                    <p className="text-[13px] font-semibold text-[var(--admin-foreground)]">{i.name}</p>
                    <p className="text-[11px] text-[var(--admin-muted)]">{i.email}</p>
                  </td>
                  <td className="px-5 py-3">
                    <p className="text-[12px] text-[var(--admin-foreground)]">{i.project_type || '—'}</p>
                    {i.budget_range && <p className="text-[11px] text-[var(--admin-muted)]">{i.budget_range}</p>}
                  </td>
                  <td className="px-5 py-3">
                    <AdminBadge variant={i.status === 'new' ? 'warning' : 'default'}>{i.status}</AdminBadge>
                  </td>
                  <td className="px-5 py-3 text-right text-[11px] text-[var(--admin-muted)]">
                    {formatRelative(i.created_at)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Simple detail overlay */}
      {selected && (
        <div
          className="fixed inset-0 bg-black/40 flex items-start justify-center pt-16 z-50"
          onClick={() => setSelected(null)}
        >
          <div
            className="bg-white border border-[var(--admin-sidebar-border)] w-full max-w-2xl max-h-[80vh] overflow-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-6 py-4 border-b border-[var(--admin-sidebar-border)] flex items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-bold text-[var(--admin-foreground)]">{selected.name}</h2>
                <p className="text-[12px] text-[var(--admin-muted)]">{selected.email}{selected.phone && ` · ${selected.phone}`}</p>
              </div>
              <button
                onClick={() => setSelected(null)}
                className="text-[var(--admin-muted)] hover:text-[var(--admin-foreground)] text-xl leading-none"
              >
                ×
              </button>
            </div>
            <div className="px-6 py-4 space-y-4">
              <div className="grid grid-cols-3 gap-3 text-[12px]">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--admin-muted)] mb-1">Project</p>
                  <p className="text-[var(--admin-foreground)]">{selected.project_type || '—'}</p>
                </div>
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--admin-muted)] mb-1">Budget</p>
                  <p className="text-[var(--admin-foreground)]">{selected.budget_range || '—'}</p>
                </div>
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--admin-muted)] mb-1">Timeline</p>
                  <p className="text-[var(--admin-foreground)]">{selected.timeline || '—'}</p>
                </div>
              </div>

              {selected.message && (
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--admin-muted)] mb-2">Message</p>
                  <p className="whitespace-pre-wrap text-[13px] text-[var(--admin-foreground)] bg-[var(--admin-sidebar-accent)] p-3">
                    {selected.message}
                  </p>
                </div>
              )}

              <div className="border-t border-[var(--admin-sidebar-border)] pt-4">
                <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--admin-muted)] mb-2">Update status</p>
                <div className="flex flex-wrap gap-2">
                  {STATUS_OPTIONS.slice(1).map((opt) => (
                    <button
                      key={opt.value}
                      onClick={() => updateStatus(selected.id, opt.value)}
                      disabled={selected.status === opt.value}
                      className="text-[11px] font-semibold px-3 py-1.5 border border-[var(--admin-sidebar-border)] hover:bg-[var(--admin-sidebar-accent)] disabled:bg-[var(--admin-primary)]/10 disabled:text-[var(--admin-primary)] disabled:cursor-not-allowed transition-colors"
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
