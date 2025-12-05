'use client';

import { ComputerDesktopIcon, MoonIcon, SunIcon } from '@heroicons/react/24/outline';
import { useTheme } from 'next-themes';
import { useEffect, useState } from 'react';

const options = [
  { value: 'light', icon: SunIcon, label: 'Light' },
  { value: 'system', icon: ComputerDesktopIcon, label: 'System' },
  { value: 'dark', icon: MoonIcon, label: 'Dark' },
] as const;

export function ThemeToggle() {
  const { theme, setTheme, systemTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const resolvedTheme = mounted ? (theme === 'system' ? systemTheme ?? 'system' : theme ?? 'system') : undefined;

  return (
    <div className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-1 py-1 shadow-sm ring-1 ring-slate-100/50 transition dark:border-slate-800 dark:bg-slate-900/80 dark:ring-slate-800/70">
      {options.map(option => {
        const Icon = option.icon;
        const isActive = mounted && resolvedTheme === option.value;
        return (
          <button
            key={option.value}
            type="button"
            onClick={() => setTheme(option.value)}
            className={`group relative inline-flex size-9 items-center justify-center rounded-full text-slate-600 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-sage-400 dark:text-slate-200 ${
              isActive ? 'bg-white shadow-sm ring-1 ring-slate-200 dark:bg-slate-800 dark:ring-slate-700' : ''
            }`}
            aria-label={option.label}
            aria-pressed={isActive}
          >
            <Icon className="h-4 w-4" />
          </button>
        );
      })}
    </div>
  );
}
