'use client'

import { useMemo, useState, useTransition } from 'react'
import Link from 'next/link'
import { Plus, Trash2, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import SetGrowthHeading from '../_components/SetGrowthHeading'
import KpiMonthlyGrid from '../_components/KpiMonthlyGrid'
import StatsStrip from '../_components/StatsStrip'
import Tabs from '../_components/Tabs'
import type { KpiActual, KpiTarget } from '../_lib/queries'
import {
  addChallenge,
  addContentPost,
  deleteChallenge,
  deleteContentPost,
  updateChallengeDefinition,
  updateChallengeResults,
  updateContentPost,
  type ChallengeDefinitionPatch,
  type ChallengeInput,
  type ChallengeResultsPatch,
  type ContentPostInput,
  type ContentPostPatch,
} from './actions'

export type ContentLogEntry = {
  id: string
  postDate: string
  channel: string
  contentType: string
  topic: string
  postedByName: string
  likes: number
  comments: number
  shares: number
  saves: number
  reach: number
  newFollowers: number
  notes: string
}

export type ChallengeRow = {
  id: string
  launchDate: string
  theme: string
  leadChannel: string
  hashtag: string
  leadOwnerName: string
  postsMade: number | null
  totalReach: number | null
  totalEngagements: number | null
  newFollowers: number | null
  submissionsUgc: number | null
  result: string | null
  notes: string | null
}

const CHANNELS = ['Instagram', 'TikTok', 'Facebook', 'LinkedIn', 'YouTube', 'Twitter/X']

const CONTENT_TYPES = [
  'Reel/Short Video',
  'Carousel Post',
  'Single Image Post',
  'Story',
  'Live',
  'Long-form Video',
  'Article/Caption',
  'UGC Repost',
  'Challenge',
  'Behind-the-Scenes',
]

const INPUT_CLASS =
  'w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-[#7E5896] focus:outline-none focus:ring-2 focus:ring-[#F0DFF6]'

function formatDate(value: string): string {
  const d = new Date(`${value}T00:00:00Z`)
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })
}

const TAB_HEADINGS: Record<string, { title: string; subtitle: string }> = {
  content: {
    title: 'Social Media',
    subtitle: 'Targets set at the Mid (steady baseline) level — this is reach, engagement and community.',
  },
  challenges: {
    title: 'Challenge Schedule',
    subtitle: 'Plan and track UGC challenges from launch to results.',
  },
  kpis: {
    title: 'Monthly Targets',
    subtitle: 'Track reach, engagement, and new followers against this month’s targets.',
  },
}

export default function SocialClient({
  targets,
  actuals,
  initialYear,
  canWrite,
  canAdmin,
  contentLog,
  challenges,
  employeeNames,
}: {
  targets: KpiTarget[]
  actuals: KpiActual[]
  initialYear: number
  canWrite: boolean
  canAdmin: boolean
  contentLog: ContentLogEntry[]
  challenges: ChallengeRow[]
  employeeNames: string[]
}) {
  const contentStats = useMemo(() => {
    const reach = contentLog.reduce((s, c) => s + c.reach, 0)
    const engagements = contentLog.reduce((s, c) => s + c.likes + c.comments + c.shares, 0)
    const newFollowers = contentLog.reduce((s, c) => s + c.newFollowers, 0)
    const engagementRate = reach > 0 ? engagements / reach : null
    return { reach, engagements, newFollowers, engagementRate }
  }, [contentLog])

  const [activeTab, setActiveTab] = useState<'content' | 'challenges' | 'kpis'>('content')
  const heading = TAB_HEADINGS[activeTab]

  return (
    <div className="space-y-6 pb-16">
      <SetGrowthHeading
        title={heading.title}
        subtitle={heading.subtitle}
        back={{ href: '/growth', label: 'Growth Tracker' }}
      />

      <StatsStrip
        items={[
          { label: 'Total reach', value: contentStats.reach.toLocaleString('en-US') },
          { label: 'Total engagements', value: contentStats.engagements.toLocaleString('en-US') },
          { label: 'New followers', value: contentStats.newFollowers.toLocaleString('en-US') },
          {
            label: 'Engagement rate',
            value: contentStats.engagementRate === null ? '—' : `${(contentStats.engagementRate * 100).toFixed(1)}%`,
          },
        ]}
      />

      <Tabs
        defaultKey="content"
        onChange={(key) => setActiveTab(key as 'content' | 'challenges' | 'kpis')}
        tabs={[
          {
            key: 'content',
            label: `Content log (${contentLog.length})`,
            content: <ContentLogSection contentLog={contentLog} employeeNames={employeeNames} canWrite={canWrite} />,
          },
          {
            key: 'challenges',
            label: `Challenge schedule (${challenges.length})`,
            content: (
              <ChallengeScheduleSection
                challenges={challenges}
                employeeNames={employeeNames}
                canWrite={canWrite}
                canAdmin={canAdmin}
              />
            ),
          },
          {
            key: 'kpis',
            label: 'Monthly targets',
            content: (
              <KpiMonthlyGrid targets={targets} actuals={actuals} initialYear={initialYear} canEdit={canWrite} canEditTargets={canAdmin} />
            ),
          },
        ]}
      />
    </div>
  )
}

// =============================================================================
// Content log
// =============================================================================

function ContentLogSection({
  contentLog,
  employeeNames,
  canWrite,
}: {
  contentLog: ContentLogEntry[]
  employeeNames: string[]
  canWrite: boolean
}) {
  const [showAdd, setShowAdd] = useState(false)

  return (
    <div className="rounded-2xl border border-gray-100 bg-white shadow-[0_2px_10px_-4px_rgba(0,0,0,0.04)]">
      <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
        <p className="text-[12px] text-gray-500">Every piece of published content and its results.</p>
        {canWrite && (
          <button data-opus-button="control"
            type="button"
            onClick={() => setShowAdd(true)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-[#7E5896] px-3 py-1.5 text-[12px] font-semibold text-white hover:bg-[#6c4884]"
          >
            <Plus className="h-3.5 w-3.5" />
            Add post
          </button>
        )}
      </div>

      <div className="overflow-x-auto">
        <table className="opus-table w-full min-w-[1100px] text-[12px]">
          <thead>
            <tr className="border-b border-gray-100 text-left text-gray-500">
              <th className="px-4 py-2 font-medium">Date</th>
              <th className="px-2 py-2 font-medium">Channel</th>
              <th className="px-2 py-2 font-medium">Type</th>
              <th className="px-2 py-2 font-medium">Topic</th>
              <th className="px-2 py-2 font-medium">Posted by</th>
              <th className="px-2 py-2 text-right font-medium">Likes</th>
              <th className="px-2 py-2 text-right font-medium">Comments</th>
              <th className="px-2 py-2 text-right font-medium">Shares</th>
              <th className="px-2 py-2 text-right font-medium">Saves</th>
              <th className="px-2 py-2 text-right font-medium">Reach</th>
              <th className="px-2 py-2 text-right font-medium">+Followers</th>
              <th className="px-2 py-2 font-medium">Notes</th>
              {canWrite && <th className="px-2 py-2" />}
            </tr>
          </thead>
          <tbody>
            {contentLog.length === 0 && (
              <tr>
                <td colSpan={canWrite ? 13 : 12} className="px-4 py-10 text-center text-gray-400">
                  No posts logged yet.
                </td>
              </tr>
            )}
            {contentLog.map((entry) => (
              <ContentLogRow key={entry.id} entry={entry} employeeNames={employeeNames} canWrite={canWrite} />
            ))}
          </tbody>
        </table>
      </div>

      {showAdd && (
        <AddContentPostDrawer employeeNames={employeeNames} onClose={() => setShowAdd(false)} />
      )}
    </div>
  )
}

function ContentLogRow({
  entry,
  employeeNames,
  canWrite,
}: {
  entry: ContentLogEntry
  employeeNames: string[]
  canWrite: boolean
}) {
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState<ContentPostPatch>({})

  function fieldValue<K extends keyof ContentLogEntry>(key: K): ContentLogEntry[K] {
    const draftKey = key as keyof ContentPostPatch
    if (draft[draftKey] !== undefined) return draft[draftKey] as unknown as ContentLogEntry[K]
    return entry[key]
  }

  function setField<K extends keyof ContentPostPatch>(key: K, value: ContentPostPatch[K]) {
    setDraft((prev) => ({ ...prev, [key]: value }))
  }

  function save() {
    if (Object.keys(draft).length === 0) {
      setEditing(false)
      return
    }
    setError(null)
    startTransition(async () => {
      const res = await updateContentPost(entry.id, draft)
      if (!res.ok) {
        setError(res.error)
      } else {
        setDraft({})
        setEditing(false)
      }
    })
  }

  function remove() {
    if (!window.confirm('Delete this post from the content log?')) return
    setError(null)
    startTransition(async () => {
      const res = await deleteContentPost(entry.id)
      if (!res.ok) setError(res.error)
    })
  }

  if (!canWrite || !editing) {
    return (
      <tr className={cn('border-b border-gray-50', isPending && 'opacity-60')}>
        <td className="px-4 py-2 text-gray-600">{formatDate(entry.postDate)}</td>
        <td className="px-2 py-2 text-gray-800">{entry.channel}</td>
        <td className="px-2 py-2 text-gray-700">{entry.contentType}</td>
        <td className="max-w-[220px] truncate px-2 py-2 text-gray-900">{entry.topic}</td>
        <td className="px-2 py-2 text-gray-600">{entry.postedByName || '—'}</td>
        <td className="px-2 py-2 text-right tabular-nums text-gray-700">{entry.likes.toLocaleString()}</td>
        <td className="px-2 py-2 text-right tabular-nums text-gray-700">{entry.comments.toLocaleString()}</td>
        <td className="px-2 py-2 text-right tabular-nums text-gray-700">{entry.shares.toLocaleString()}</td>
        <td className="px-2 py-2 text-right tabular-nums text-gray-700">{entry.saves.toLocaleString()}</td>
        <td className="px-2 py-2 text-right tabular-nums text-gray-700">{entry.reach.toLocaleString()}</td>
        <td className="px-2 py-2 text-right tabular-nums text-gray-700">{entry.newFollowers.toLocaleString()}</td>
        <td className="max-w-[180px] truncate px-2 py-2 text-gray-500">{entry.notes || '—'}</td>
        {canWrite && (
          <td className="px-2 py-2">
            <div className="flex items-center justify-end gap-1">
              <button data-opus-button="control"
                type="button"
                onClick={() => setEditing(true)}
                className="rounded-md px-2 py-1 text-[11px] font-semibold text-gray-600 hover:bg-gray-100"
              >
                Edit
              </button>
              <button data-opus-button="control"
                type="button"
                onClick={remove}
                className="inline-flex h-6 w-6 items-center justify-center rounded-md text-gray-400 hover:bg-rose-50 hover:text-rose-600"
                aria-label="Delete post"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
            {error && <div className="mt-1 text-right text-[10px] text-red-600">{error}</div>}
          </td>
        )}
      </tr>
    )
  }

  return (
    <tr className={cn('border-b border-gray-50 bg-gray-50/40', isPending && 'opacity-60')}>
      <td className="px-4 py-1.5">
        <input
          type="date"
          value={fieldValue('postDate')}
          onChange={(e) => setField('postDate', e.target.value)}
          className="w-32 rounded-md border border-gray-200 px-1.5 py-1 text-[12px]"
        />
      </td>
      <td className="px-2 py-1.5">
        <select
          value={fieldValue('channel')}
          onChange={(e) => setField('channel', e.target.value)}
          className="w-28 rounded-md border border-gray-200 px-1.5 py-1 text-[12px]"
        >
          {CHANNELS.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
      </td>
      <td className="px-2 py-1.5">
        <select
          value={fieldValue('contentType')}
          onChange={(e) => setField('contentType', e.target.value)}
          className="w-32 rounded-md border border-gray-200 px-1.5 py-1 text-[12px]"
        >
          {CONTENT_TYPES.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
      </td>
      <td className="px-2 py-1.5">
        <input
          value={fieldValue('topic')}
          onChange={(e) => setField('topic', e.target.value)}
          className="w-40 rounded-md border border-gray-200 px-1.5 py-1 text-[12px]"
        />
      </td>
      <td className="px-2 py-1.5">
        <input
          list="social-employee-names"
          value={fieldValue('postedByName')}
          onChange={(e) => setField('postedByName', e.target.value)}
          className="w-28 rounded-md border border-gray-200 px-1.5 py-1 text-[12px]"
        />
      </td>
      {(['likes', 'comments', 'shares', 'saves', 'reach', 'newFollowers'] as const).map((key) => (
        <td key={key} className="px-2 py-1.5">
          <input
            type="number"
            min={0}
            value={fieldValue(key)}
            onChange={(e) => setField(key, Number(e.target.value))}
            className="w-16 rounded-md border border-gray-200 px-1.5 py-1 text-right text-[12px] tabular-nums"
          />
        </td>
      ))}
      <td className="px-2 py-1.5">
        <input
          value={fieldValue('notes')}
          onChange={(e) => setField('notes', e.target.value)}
          className="w-36 rounded-md border border-gray-200 px-1.5 py-1 text-[12px]"
        />
      </td>
      <td className="px-2 py-1.5">
        <div className="flex items-center justify-end gap-1">
          <button data-opus-button="control"
            type="button"
            onClick={save}
            disabled={isPending}
            className="rounded-md bg-[#7E5896] px-2 py-1 text-[11px] font-semibold text-white hover:bg-[#6c4884] disabled:opacity-50"
          >
            Save
          </button>
          <button data-opus-button="control"
            type="button"
            onClick={() => {
              setDraft({})
              setEditing(false)
            }}
            className="rounded-md px-2 py-1 text-[11px] font-medium text-gray-600 hover:bg-gray-100"
          >
            Cancel
          </button>
        </div>
        {error && <div className="mt-1 text-right text-[10px] text-red-600">{error}</div>}
      </td>
    </tr>
  )
}

function AddContentPostDrawer({
  employeeNames,
  onClose,
}: {
  employeeNames: string[]
  onClose: () => void
}) {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [postDate, setPostDate] = useState(new Date().toISOString().slice(0, 10))
  const [channel, setChannel] = useState(CHANNELS[0])
  const [contentType, setContentType] = useState(CONTENT_TYPES[0])
  const [topic, setTopic] = useState('')
  const [postedByName, setPostedByName] = useState('')
  const [likes, setLikes] = useState('0')
  const [comments, setComments] = useState('0')
  const [shares, setShares] = useState('0')
  const [saves, setSaves] = useState('0')
  const [reach, setReach] = useState('0')
  const [newFollowers, setNewFollowers] = useState('0')
  const [notes, setNotes] = useState('')

  function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    const input: ContentPostInput = {
      postDate,
      channel,
      contentType,
      topic,
      postedByName,
      likes: Number(likes) || 0,
      comments: Number(comments) || 0,
      shares: Number(shares) || 0,
      saves: Number(saves) || 0,
      reach: Number(reach) || 0,
      newFollowers: Number(newFollowers) || 0,
      notes,
    }
    startTransition(async () => {
      const res = await addContentPost(input)
      if (!res.ok) {
        setError(res.error)
      } else {
        onClose()
      }
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex" role="dialog" aria-modal="true" aria-label="Add content post">
      <button data-opus-button="control" type="button" aria-label="Close" className="flex-1 bg-gray-900/30" onClick={onClose} />
      <form onSubmit={submit} className="flex h-full w-full max-w-md flex-col border-l border-gray-100 bg-white shadow-2xl">
        <header className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
          <div>
            <h2 className="text-base font-semibold text-gray-900">Add post</h2>
            <p className="text-xs text-gray-500">Log a piece of published content and its results.</p>
          </div>
          <button data-opus-button="control"
            type="button"
            onClick={onClose}
            className="inline-flex h-8 w-8 items-center justify-center rounded-md text-gray-500 hover:bg-gray-100"
            aria-label="Close drawer"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="flex-1 space-y-4 overflow-y-auto px-5 py-5">
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Post date" required>
              <input required type="date" value={postDate} onChange={(e) => setPostDate(e.target.value)} className={INPUT_CLASS} />
            </FormField>
            <FormField label="Channel" required>
              <select value={channel} onChange={(e) => setChannel(e.target.value)} className={INPUT_CLASS}>
                {CHANNELS.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </FormField>
          </div>

          <FormField label="Content type" required>
            <select value={contentType} onChange={(e) => setContentType(e.target.value)} className={INPUT_CLASS}>
              {CONTENT_TYPES.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </FormField>

          <FormField label="Topic / title" required>
            <input
              required
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder="e.g. Behind the scenes — Asha & Neema's shoot"
              className={INPUT_CLASS}
            />
          </FormField>

          <FormField label="Posted by">
            <input
              list="social-employee-names"
              value={postedByName}
              onChange={(e) => setPostedByName(e.target.value)}
              placeholder="Staff name"
              className={INPUT_CLASS}
            />
          </FormField>

          <div className="grid grid-cols-3 gap-3">
            <FormField label="Likes">
              <input type="number" inputMode="numeric" min={0} value={likes} onChange={(e) => setLikes(e.target.value)} className={cn(INPUT_CLASS, 'text-right tabular-nums')} />
            </FormField>
            <FormField label="Comments">
              <input type="number" inputMode="numeric" min={0} value={comments} onChange={(e) => setComments(e.target.value)} className={cn(INPUT_CLASS, 'text-right tabular-nums')} />
            </FormField>
            <FormField label="Shares">
              <input type="number" inputMode="numeric" min={0} value={shares} onChange={(e) => setShares(e.target.value)} className={cn(INPUT_CLASS, 'text-right tabular-nums')} />
            </FormField>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <FormField label="Saves">
              <input type="number" inputMode="numeric" min={0} value={saves} onChange={(e) => setSaves(e.target.value)} className={cn(INPUT_CLASS, 'text-right tabular-nums')} />
            </FormField>
            <FormField label="Reach">
              <input type="number" inputMode="numeric" min={0} value={reach} onChange={(e) => setReach(e.target.value)} className={cn(INPUT_CLASS, 'text-right tabular-nums')} />
            </FormField>
            <FormField label="+Followers">
              <input type="number" inputMode="numeric" min={0} value={newFollowers} onChange={(e) => setNewFollowers(e.target.value)} className={cn(INPUT_CLASS, 'text-right tabular-nums')} />
            </FormField>
          </div>

          <FormField label="Notes">
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} placeholder="Anything worth remembering…" className={INPUT_CLASS} />
          </FormField>

          {error && (
            <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700">{error}</div>
          )}
        </div>

        <footer className="border-t border-gray-100 px-5 py-3">
          <div className="flex items-center justify-end gap-2">
            <button data-opus-button="control" type="button" onClick={onClose} className="rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
              Cancel
            </button>
            <button data-opus-button="primary" data-opus-button-size="medium"
              type="submit"
              disabled={pending}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#7E5896] px-3 py-2 text-sm font-semibold text-white hover:bg-[#6c4884] disabled:opacity-50"
            >
              <Plus className="h-4 w-4" />
              {pending ? 'Saving…' : 'Save post'}
            </button>
          </div>
        </footer>
      </form>
      <datalist id="social-employee-names">
        {employeeNames.map((name) => (
          <option key={name} value={name} />
        ))}
      </datalist>
    </div>
  )
}

function FormField({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-bold uppercase tracking-wider text-gray-500">
        {label}
        {required && <span className="ml-1 text-rose-600">*</span>}
      </span>
      {children}
    </label>
  )
}

// =============================================================================
// Challenge schedule
// =============================================================================

function ChallengeScheduleSection({
  challenges,
  employeeNames,
  canWrite,
  canAdmin,
}: {
  challenges: ChallengeRow[]
  employeeNames: string[]
  canWrite: boolean
  canAdmin: boolean
}) {
  const [showAdd, setShowAdd] = useState(false)

  return (
    <div className="rounded-2xl border border-gray-100 bg-white shadow-[0_2px_10px_-4px_rgba(0,0,0,0.04)]">
      <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
        <p className="text-[12px] text-gray-500">Bi-weekly challenges — fill in results after each one runs.</p>
        <div className="flex items-center gap-3">
          <Link
            href="/growth/content-ideas"
            className="text-[12px] font-medium text-gray-500 hover:text-gray-800"
          >
            Need a theme? Browse the content bank →
          </Link>
          {canAdmin && (
            <button data-opus-button="control"
              type="button"
              onClick={() => setShowAdd(true)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#7E5896] px-3 py-1.5 text-[12px] font-semibold text-white hover:bg-[#6c4884]"
            >
              <Plus className="h-3.5 w-3.5" />
              Add challenge
            </button>
          )}
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="opus-table w-full min-w-[1300px] text-[12px]">
          <thead>
            <tr className="border-b border-gray-100 text-left text-gray-500">
              <th className="px-4 py-2 font-medium">Launch date</th>
              <th className="px-2 py-2 font-medium">Theme</th>
              <th className="px-2 py-2 font-medium">Lead channel</th>
              <th className="px-2 py-2 font-medium">Hashtag</th>
              <th className="px-2 py-2 font-medium">Lead owner</th>
              <th className="px-2 py-2 text-right font-medium">Posts made</th>
              <th className="px-2 py-2 text-right font-medium">Total reach</th>
              <th className="px-2 py-2 text-right font-medium">Total engagements</th>
              <th className="px-2 py-2 text-right font-medium">+Followers</th>
              <th className="px-2 py-2 text-right font-medium">Submissions/UGC</th>
              <th className="px-2 py-2 font-medium">Result</th>
              <th className="px-2 py-2 font-medium">Notes</th>
              {canAdmin && <th className="px-2 py-2" />}
            </tr>
          </thead>
          <tbody>
            {challenges.length === 0 && (
              <tr>
                <td colSpan={canAdmin ? 13 : 12} className="px-4 py-10 text-center text-gray-400">
                  No challenges scheduled yet.
                </td>
              </tr>
            )}
            {challenges.map((c) => (
              <ChallengeRowView
                key={c.id}
                challenge={c}
                employeeNames={employeeNames}
                canWrite={canWrite}
                canAdmin={canAdmin}
              />
            ))}
          </tbody>
        </table>
      </div>

      {showAdd && <AddChallengeDrawer employeeNames={employeeNames} onClose={() => setShowAdd(false)} />}
    </div>
  )
}

function ChallengeRowView({
  challenge,
  employeeNames,
  canWrite,
  canAdmin,
}: {
  challenge: ChallengeRow
  employeeNames: string[]
  canWrite: boolean
  canAdmin: boolean
}) {
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [defDraft, setDefDraft] = useState<ChallengeDefinitionPatch>({})
  const [resultsDraft, setResultsDraft] = useState<ChallengeResultsPatch>({})

  function defValue<K extends keyof ChallengeDefinitionPatch>(key: K, fallback: string): string {
    return defDraft[key] !== undefined ? (defDraft[key] as string) : fallback
  }

  function resultValue<K extends keyof ChallengeResultsPatch>(key: K, fallback: number | string | null): string {
    if (resultsDraft[key] !== undefined) return String(resultsDraft[key] ?? '')
    return fallback === null ? '' : String(fallback)
  }

  function commitDefinition() {
    if (Object.keys(defDraft).length === 0) return
    setError(null)
    startTransition(async () => {
      const res = await updateChallengeDefinition(challenge.id, defDraft)
      if (!res.ok) setError(res.error)
      else setDefDraft({})
    })
  }

  function commitResults() {
    if (Object.keys(resultsDraft).length === 0) return
    setError(null)
    startTransition(async () => {
      const res = await updateChallengeResults(challenge.id, resultsDraft)
      if (!res.ok) setError(res.error)
      else setResultsDraft({})
    })
  }

  function remove() {
    if (!window.confirm(`Delete the "${challenge.theme}" challenge?`)) return
    setError(null)
    startTransition(async () => {
      const res = await deleteChallenge(challenge.id)
      if (!res.ok) setError(res.error)
    })
  }

  const defInputClass = cn(
    'rounded-md border border-gray-200 px-1.5 py-1 text-[12px] disabled:cursor-not-allowed disabled:border-transparent disabled:bg-transparent disabled:px-0 disabled:text-gray-800',
  )
  const resultInputClass = cn(
    'w-16 rounded-md border border-gray-200 px-1.5 py-1 text-right text-[12px] tabular-nums disabled:cursor-not-allowed disabled:border-transparent disabled:bg-transparent disabled:px-0 disabled:text-gray-800',
  )

  return (
    <tr className={cn('border-b border-gray-50', isPending && 'opacity-60')}>
      <td className="px-4 py-2">
        <input
          type="date"
          disabled={!canAdmin}
          value={defValue('launchDate', challenge.launchDate)}
          onChange={(e) => setDefDraft((p) => ({ ...p, launchDate: e.target.value }))}
          onBlur={commitDefinition}
          className={cn(defInputClass, 'w-32')}
        />
      </td>
      <td className="px-2 py-2">
        <input
          disabled={!canAdmin}
          value={defValue('theme', challenge.theme)}
          onChange={(e) => setDefDraft((p) => ({ ...p, theme: e.target.value }))}
          onBlur={commitDefinition}
          className={cn(defInputClass, 'w-36')}
        />
      </td>
      <td className="px-2 py-2">
        {canAdmin ? (
          <select
            value={defValue('leadChannel', challenge.leadChannel)}
            onChange={(e) => setDefDraft((p) => ({ ...p, leadChannel: e.target.value }))}
            onBlur={commitDefinition}
            className={cn(defInputClass, 'w-28')}
          >
            {CHANNELS.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        ) : (
          <span className="text-gray-800">{challenge.leadChannel}</span>
        )}
      </td>
      <td className="px-2 py-2">
        <input
          disabled={!canAdmin}
          value={defValue('hashtag', challenge.hashtag)}
          onChange={(e) => setDefDraft((p) => ({ ...p, hashtag: e.target.value }))}
          onBlur={commitDefinition}
          className={cn(defInputClass, 'w-28')}
        />
      </td>
      <td className="px-2 py-2">
        <input
          list="social-employee-names"
          disabled={!canAdmin}
          value={defValue('leadOwnerName', challenge.leadOwnerName)}
          onChange={(e) => setDefDraft((p) => ({ ...p, leadOwnerName: e.target.value }))}
          onBlur={commitDefinition}
          className={cn(defInputClass, 'w-28')}
        />
      </td>
      <td className="px-2 py-2">
        <input
          type="number"
          min={0}
          disabled={!canWrite}
          value={resultValue('postsMade', challenge.postsMade)}
          onChange={(e) => setResultsDraft((p) => ({ ...p, postsMade: e.target.value === '' ? null : Number(e.target.value) }))}
          onBlur={commitResults}
          className={resultInputClass}
        />
      </td>
      <td className="px-2 py-2">
        <input
          type="number"
          min={0}
          disabled={!canWrite}
          value={resultValue('totalReach', challenge.totalReach)}
          onChange={(e) => setResultsDraft((p) => ({ ...p, totalReach: e.target.value === '' ? null : Number(e.target.value) }))}
          onBlur={commitResults}
          className={resultInputClass}
        />
      </td>
      <td className="px-2 py-2">
        <input
          type="number"
          min={0}
          disabled={!canWrite}
          value={resultValue('totalEngagements', challenge.totalEngagements)}
          onChange={(e) => setResultsDraft((p) => ({ ...p, totalEngagements: e.target.value === '' ? null : Number(e.target.value) }))}
          onBlur={commitResults}
          className={resultInputClass}
        />
      </td>
      <td className="px-2 py-2">
        <input
          type="number"
          min={0}
          disabled={!canWrite}
          value={resultValue('newFollowers', challenge.newFollowers)}
          onChange={(e) => setResultsDraft((p) => ({ ...p, newFollowers: e.target.value === '' ? null : Number(e.target.value) }))}
          onBlur={commitResults}
          className={resultInputClass}
        />
      </td>
      <td className="px-2 py-2">
        <input
          type="number"
          min={0}
          disabled={!canWrite}
          value={resultValue('submissionsUgc', challenge.submissionsUgc)}
          onChange={(e) => setResultsDraft((p) => ({ ...p, submissionsUgc: e.target.value === '' ? null : Number(e.target.value) }))}
          onBlur={commitResults}
          className={resultInputClass}
        />
      </td>
      <td className="px-2 py-2">
        <input
          disabled={!canWrite}
          value={resultValue('result', challenge.result)}
          onChange={(e) => setResultsDraft((p) => ({ ...p, result: e.target.value }))}
          onBlur={commitResults}
          className={cn(defInputClass, 'w-28')}
        />
      </td>
      <td className="px-2 py-2">
        <input
          disabled={!canWrite}
          value={resultValue('notes', challenge.notes)}
          onChange={(e) => setResultsDraft((p) => ({ ...p, notes: e.target.value }))}
          onBlur={commitResults}
          className={cn(defInputClass, 'w-36')}
        />
        {error && <div className="mt-1 text-[10px] text-red-600">{error}</div>}
      </td>
      {canAdmin && (
        <td className="px-2 py-2">
          <button data-opus-button="control"
            type="button"
            onClick={remove}
            className="inline-flex h-6 w-6 items-center justify-center rounded-md text-gray-400 hover:bg-rose-50 hover:text-rose-600"
            aria-label="Delete challenge"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </td>
      )}
    </tr>
  )
}

function AddChallengeDrawer({
  employeeNames,
  onClose,
}: {
  employeeNames: string[]
  onClose: () => void
}) {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [launchDate, setLaunchDate] = useState(new Date().toISOString().slice(0, 10))
  const [theme, setTheme] = useState('')
  const [leadChannel, setLeadChannel] = useState(CHANNELS[0])
  const [hashtag, setHashtag] = useState('')
  const [leadOwnerName, setLeadOwnerName] = useState('')

  function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    const input: ChallengeInput = { launchDate, theme, leadChannel, hashtag, leadOwnerName }
    startTransition(async () => {
      const res = await addChallenge(input)
      if (!res.ok) {
        setError(res.error)
      } else {
        onClose()
      }
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex" role="dialog" aria-modal="true" aria-label="Add challenge">
      <button data-opus-button="control" type="button" aria-label="Close" className="flex-1 bg-gray-900/30" onClick={onClose} />
      <form onSubmit={submit} className="flex h-full w-full max-w-md flex-col border-l border-gray-100 bg-white shadow-2xl">
        <header className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
          <div>
            <h2 className="text-base font-semibold text-gray-900">Add challenge</h2>
            <p className="text-xs text-gray-500">Define a new bi-weekly challenge — results are filled in later.</p>
          </div>
          <button data-opus-button="control"
            type="button"
            onClick={onClose}
            className="inline-flex h-8 w-8 items-center justify-center rounded-md text-gray-500 hover:bg-gray-100"
            aria-label="Close drawer"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="flex-1 space-y-4 overflow-y-auto px-5 py-5">
          <FormField label="Launch date" required>
            <input required type="date" value={launchDate} onChange={(e) => setLaunchDate(e.target.value)} className={INPUT_CLASS} />
          </FormField>

          <FormField label="Theme" required>
            <input
              required
              value={theme}
              onChange={(e) => setTheme(e.target.value)}
              placeholder="e.g. Real Wedding Reveal"
              className={INPUT_CLASS}
            />
          </FormField>

          <FormField label="Lead channel" required>
            <select value={leadChannel} onChange={(e) => setLeadChannel(e.target.value)} className={INPUT_CLASS}>
              {CHANNELS.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </FormField>

          <FormField label="Hashtag" required>
            <input
              required
              value={hashtag}
              onChange={(e) => setHashtag(e.target.value)}
              placeholder="#OpusFestaChallenge"
              className={INPUT_CLASS}
            />
          </FormField>

          <FormField label="Lead owner" required>
            <input
              required
              list="social-employee-names"
              value={leadOwnerName}
              onChange={(e) => setLeadOwnerName(e.target.value)}
              placeholder="Staff name"
              className={INPUT_CLASS}
            />
          </FormField>

          {error && (
            <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700">{error}</div>
          )}
        </div>

        <footer className="border-t border-gray-100 px-5 py-3">
          <div className="flex items-center justify-end gap-2">
            <button data-opus-button="control" type="button" onClick={onClose} className="rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
              Cancel
            </button>
            <button data-opus-button="primary" data-opus-button-size="medium"
              type="submit"
              disabled={pending}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#7E5896] px-3 py-2 text-sm font-semibold text-white hover:bg-[#6c4884] disabled:opacity-50"
            >
              <Plus className="h-4 w-4" />
              {pending ? 'Saving…' : 'Add challenge'}
            </button>
          </div>
        </footer>
      </form>
      <datalist id="social-employee-names">
        {employeeNames.map((name) => (
          <option key={name} value={name} />
        ))}
      </datalist>
    </div>
  )
}
