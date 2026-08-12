'use client';

import type { ReactNode } from 'react';

interface Column<T> {
  key: string;
  header: string;
  render: (item: T) => ReactNode;
  className?: string;
}

interface AdminTableProps<T> {
  columns: Column<T>[];
  data: T[];
  keyField: keyof T;
  emptyMessage?: string;
  onRowClick?: (item: T) => void;
}

export default function AdminTable<T>({ columns, data, keyField, emptyMessage = 'No data found.', onRowClick }: AdminTableProps<T>) {
  if (data.length === 0) {
    return (
      <div className="border border-[var(--admin-border)] bg-[var(--admin-card)] p-12 text-center shadow-[var(--admin-shadow-sm)]">
        <p className="text-sm text-[var(--admin-muted)]">{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden border border-[var(--admin-border)] bg-[var(--admin-card)] shadow-[var(--admin-shadow-sm)]">
      <div className="overflow-x-auto">
        <table className="opus-table w-full">
          <thead>
            <tr className="border-b border-[var(--admin-border)] bg-[var(--admin-secondary)]">
              {columns.map((col) => (
                <th key={col.key} className={`px-4 py-3 text-left text-[11px] font-mono uppercase tracking-[0.18em] text-[var(--admin-muted)] ${col.className || ''}`}>
                  {col.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--admin-border)]">
            {data.map((item) => (
              <tr
                key={String(item[keyField])}
                className={`${onRowClick ? 'cursor-pointer hover:bg-[rgba(214,73,42,0.05)]' : ''} transition-colors`}
                onClick={() => onRowClick?.(item)}
              >
                {columns.map((col) => (
                  <td key={col.key} className={`px-4 py-3.5 text-sm text-[var(--admin-card-foreground)] ${col.className || ''}`}>{col.render(item)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
