'use client'

import { useState } from 'react'
import { Palette } from 'lucide-react'

const THEMES = [
  { name: 'Wisteria', accent: '#C9A0DC', accentHover: '#b97fd0', onAccent: '#1A1A1A' },
  { name: 'Plum',     accent: '#5B2D8E', accentHover: '#4a2275', onAccent: '#ffffff' },
]

export default function ThemeSwitcher() {
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState('Wisteria')

  const applyTheme = (theme: typeof THEMES[0]) => {
    document.documentElement.style.setProperty('--accent', theme.accent)
    document.documentElement.style.setProperty('--accent-hover', theme.accentHover)
    document.documentElement.style.setProperty('--on-accent', theme.onAccent)
    setActive(theme.name)
  }

  return (
    <div className="fixed bottom-6 right-6 z-[9999] flex flex-col items-end gap-3">

      {/* Theme dots */}
      {open && (
        <div className="bg-white rounded-2xl shadow-2xl border border-gray-100 p-4 flex flex-col gap-2 min-w-[160px]">
          <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-1">Choose theme</p>
          {THEMES.map((theme) => (
            <button data-opus-button="control"
              key={theme.name}
              onClick={() => applyTheme(theme)}
              className={`flex items-center gap-3 px-3 py-2 rounded-xl transition-all hover:bg-gray-50 ${active === theme.name ? 'bg-gray-100' : ''}`}
            >
              <span
                className="w-5 h-5 rounded-full shrink-0 border border-black/10"
                style={{ background: theme.accent }}
              />
              <span className={`text-sm font-bold ${active === theme.name ? 'text-[#1A1A1A]' : 'text-gray-500'}`}>
                {theme.name}
              </span>
              {active === theme.name && (
                <span className="ml-auto text-[10px] font-black text-gray-400">✓</span>
              )}
            </button>
          ))}
        </div>
      )}

      {/* Toggle button */}
      <button data-opus-button="control"
        onClick={() => setOpen((o) => !o)}
        className="w-12 h-12 rounded-full shadow-2xl flex items-center justify-center transition-transform hover:scale-105 border border-black/10"
        style={{ background: THEMES.find(t => t.name === active)?.accent }}
        title="Switch theme"
      >
        <Palette size={20} className="text-[#1A1A1A]" />
      </button>

    </div>
  )
}
