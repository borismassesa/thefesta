'use client'

import {
  Circle,
  Frame,
  Hand,
  MousePointer2,
  Square,
  Type,
  Upload,
  X,
} from 'lucide-react'

export type StudioTool =
  | 'select'
  | 'frame'
  | 'rect'
  | 'pen'
  | 'text'
  | 'ellipse'
  | 'assets'
  | 'hand'
  | 'comment'
  | 'inspect'

const TOOLS: {
  id: StudioTool
  label: string
  hint: string
  shortcut?: string
  icon: React.ReactNode
  /** Visual group break before this tool */
  divideBefore?: boolean
}[] = [
  {
    id: 'select',
    label: 'Move',
    hint: 'Select and drag layers · drag empty for marquee',
    shortcut: 'V',
    icon: <MousePointer2 className="h-4 w-4" />,
  },
  {
    id: 'frame',
    label: 'Photo frame',
    hint: 'Click or drag a couple-photo placeholder',
    shortcut: 'F',
    icon: <Frame className="h-4 w-4" />,
    divideBefore: true,
  },
  {
    id: 'rect',
    label: 'Rectangle',
    hint: 'Click or drag to draw · Shift for square',
    shortcut: 'R',
    icon: <Square className="h-4 w-4" />,
  },
  {
    id: 'ellipse',
    label: 'Ellipse',
    hint: 'Click or drag to draw · Shift for circle',
    shortcut: 'O',
    icon: <Circle className="h-4 w-4" />,
  },
  {
    id: 'text',
    label: 'Text',
    hint: 'Click or drag to place type',
    shortcut: 'T',
    icon: <Type className="h-4 w-4" />,
  },
  {
    id: 'assets',
    label: 'Uploads',
    hint: 'Open Media to upload SVG / PNG',
    icon: <Upload className="h-4 w-4" />,
    divideBefore: true,
  },
  {
    id: 'hand',
    label: 'Hand',
    hint: 'Pan the canvas · hold Space',
    shortcut: 'H',
    icon: <Hand className="h-4 w-4" />,
  },
]

type Props = {
  tool: StudioTool
  onChange: (tool: StudioTool) => void
  visible: boolean
  onHide: () => void
}

/** Docked tool strip — lives below the canvas so it never covers the card. */
export function StudioFloatingToolbar({ tool, onChange, visible, onHide }: Props) {
  if (!visible) return null

  return (
    <div
      role="toolbar"
      aria-label="Canvas tools"
      className="flex items-center gap-0.5 rounded-xl border border-gray-200 bg-white px-1 py-0.5 shadow-sm"
    >
      {TOOLS.map((t) => (
        <div key={t.id} className="flex items-center">
          {t.divideBefore ? <span className="mx-0.5 h-5 w-px bg-gray-200" aria-hidden /> : null}
          <button
            type="button"
            aria-label={t.label}
            aria-pressed={tool === t.id}
            title={
              t.shortcut
                ? `${t.label} (${t.shortcut}) — ${t.hint}`
                : `${t.label} — ${t.hint}`
            }
            onClick={() => onChange(t.id)}
            className={`rounded-lg p-2 transition-colors ${
              tool === t.id ? 'bg-gray-900 text-white' : 'text-gray-700 hover:bg-gray-100'
            }`}
          >
            {t.icon}
          </button>
        </div>
      ))}
      <span className="mx-0.5 h-5 w-px bg-gray-200" aria-hidden />
      <button
        type="button"
        title="Hide toolbar (\\)"
        aria-label="Hide toolbar"
        onClick={onHide}
        className="rounded-lg p-2 text-gray-400 hover:bg-gray-50 hover:text-gray-700"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  )
}
