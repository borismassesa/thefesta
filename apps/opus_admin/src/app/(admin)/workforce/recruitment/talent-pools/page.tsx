import { requirePermission } from '@/lib/admin-auth'
import WorkforceHeading from '../../_components/PageHeading'
import { createSupabaseAdminClient } from '@/lib/supabase'
import { getRecruitmentScope } from '../_lib/queries'
import { createNurtureCampaign, createTalentPool, addTalentPoolMember } from './actions'
import { EmptyState, PANEL } from '../_components/ui'
import { EditPoolForm, RemoveMemberButton } from './TalentPoolActions'

const NONE = ['00000000-0000-0000-0000-000000000000']
// Brand lavender for focus and primary actions, per
// apps/vendors_portal/src/lib/brand-palette.ts.
const input = 'w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-[#7E5896] focus:ring-2 focus:ring-[#F0DFF6]'
const label = 'mb-1 block text-[11px] font-semibold uppercase tracking-wide text-gray-500'
const primary = 'rounded-lg bg-[#7E5896] px-5 py-2 text-sm font-semibold text-white transition hover:opacity-90'
const secondary = 'rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-gray-700 transition hover:bg-gray-50'
// A <details> summary shows the browser's own triangle unless the marker is
// removed in both the standard and the WebKit way. Without this the toggles
// rendered as "▶ Add consented candidate", which reads as a broken bullet.
const toggle = 'inline-flex cursor-pointer list-none items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-700 transition hover:bg-gray-50 [&::-webkit-details-marker]:hidden'
/** The stored value is an enum ('company'), which is not a sentence. */
const VISIBILITY: Record<string, string> = {
  recruiting: 'Recruiting team',
  private: 'Owner only',
  company: 'Everyone at the company',
}

export default async function TalentPoolsPage() {
  await requirePermission('workforce.talent_pool.read'); const scope = await getRecruitmentScope(); const db = createSupabaseAdminClient()
  let poolsQuery = db.from('recruitment_talent_pools').select('*').order('status').order('name')
  if (!scope.organizationWide) poolsQuery = poolsQuery.or(`visibility.in.(recruiting,company),owner_employee_id.eq.${scope.employeeId}`)
  const pools = await poolsQuery; if (pools.error) throw pools.error; const poolIds = (pools.data ?? []).map((pool) => pool.id)
  let candidateIds: string[] | null = null
  if (!scope.organizationWide) { const result = scope.applicationIds.length ? await db.from('recruitment_applications').select('candidate_id').in('id', scope.applicationIds) : { data: [], error: null }; if (result.error) throw result.error; candidateIds = [...new Set((result.data ?? []).map((row) => row.candidate_id))] }
  let candidatesQuery = db.from('recruitment_candidates').select('id, full_name, primary_email').in('status', ['active', 'talent_pool']).order('full_name').limit(500); if (candidateIds) candidatesQuery = candidatesQuery.in('id', candidateIds.length ? candidateIds : NONE)
  const [members, candidates, campaigns, templates] = await Promise.all([
    poolIds.length ? db.from('recruitment_talent_pool_members').select('pool_id, candidate_id, status, recruitment_candidates(full_name, primary_email)').in('pool_id', poolIds).eq('status', 'active') : Promise.resolve({ data: [], error: null }),
    candidatesQuery,
    poolIds.length ? db.from('recruitment_nurture_campaigns').select('id, pool_id, name, status, scheduled_at, template_id').in('pool_id', poolIds).order('created_at', { ascending: false }) : Promise.resolve({ data: [], error: null }),
    db.from('recruitment_message_templates').select('id, name, language_code').eq('channel', 'email').eq('status', 'active').order('name'),
  ]); for (const result of [members, candidates, campaigns, templates]) if (result.error) throw result.error
  return <><WorkforceHeading title="Talent pools" subtitle="Consented prospects, scoped candidate segments and scheduled nurture audiences." /><section className={`${PANEL} p-5`}><h2 className="text-xs font-bold uppercase tracking-wider text-gray-500">Create talent pool</h2>
      {/* The submit is a button, not a full-width bar: it was spanning all three
          columns, which made "create a pool" look like the point of the page
          rather than the pools themselves. Visibility carries a label because,
          like every select showing a default, "Recruiting team" reads as a
          value with no clue what it is the value OF. */}
      <form action={createTalentPool} className="mt-4 space-y-3">
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="block"><span className={label}>Pool name</span><input name="name" required placeholder="Senior engineers, Dar" className={input} /></label>
          <label className="block"><span className={label}>Purpose and audience</span><input name="description" placeholder="Who belongs in it, and why" className={input} /></label>
          <label className="block"><span className={label}>Visible to</span>
            <select name="visibility" className={input}><option value="recruiting">Recruiting team</option><option value="private">Owner only</option><option value="company">Company</option></select>
          </label>
        </div>
        <div className="flex justify-end"><button className={primary}>Create pool</button></div>
      </form></section><div className="mt-5 grid gap-5 xl:grid-cols-2">{(pools.data ?? []).map((pool) => { const poolMembers = (members.data ?? []).filter((member) => member.pool_id === pool.id); const poolCampaigns = (campaigns.data ?? []).filter((campaign) => campaign.pool_id === pool.id); return <section key={pool.id} className={`${PANEL} p-5 ${pool.status === 'archived' ? 'opacity-60' : ''}`}><div className="flex justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-sm font-bold text-gray-900">{pool.name}</h2>
            {/* Visibility is its own line with a word in front of it. Joined to
                the description by a dot it read as "No description · company",
                which is a sentence fragment attached to a raw enum value. */}
            <p className="mt-1 text-xs text-gray-500">Visible to {VISIBILITY[pool.visibility] ?? pool.visibility}</p>
            {pool.description && <p className="mt-1 text-sm text-gray-600">{pool.description}</p>}
          </div>
          {/* The pill was a bare "0" with nothing saying what was zero. */}
          <div className="flex shrink-0 items-center gap-2 self-start">
            {pool.status === 'archived' && <span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-semibold text-gray-500">Archived</span>}
            <span className="rounded-full bg-[#F0DFF6] px-2.5 py-1 text-xs font-semibold text-[#7E5896]">{poolMembers.length} {poolMembers.length === 1 ? 'member' : 'members'}</span>
          </div>
        </div>
        {poolMembers.length === 0
          ? <p className="mt-4 rounded-xl bg-gray-50 p-3 text-xs text-gray-500">Nobody in this pool yet. Add a candidate who has consented to being kept on file.</p>
          : <ul className="mt-4 divide-y divide-gray-100">{poolMembers.slice(0, 8).map((member) => { const candidate = Array.isArray(member.recruitment_candidates) ? member.recruitment_candidates[0] : member.recruitment_candidates; return <li key={member.candidate_id} className="flex items-center justify-between gap-2 py-2 text-sm"><span className="min-w-0"><span className="font-semibold">{candidate?.full_name}</span><span className="ml-2 text-xs text-gray-400">{candidate?.primary_email}</span></span><RemoveMemberButton poolId={pool.id} candidateId={member.candidate_id} candidateName={candidate?.full_name ?? 'this candidate'} /></li> })}</ul>}
        <details className="mt-4"><summary className={toggle}>Add consented candidate</summary><form action={addTalentPoolMember.bind(null, pool.id)} className="mt-2 flex gap-2"><select name="candidate_id" required className={`${input} min-w-0 flex-1`}><option value="">Choose candidate</option>{(candidates.data ?? []).map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.full_name} · {candidate.primary_email}</option>)}</select><button className={secondary}>Add</button></form></details><details className="mt-3"><summary className={toggle}>Create nurture campaign</summary><form action={createNurtureCampaign.bind(null, pool.id)} className="mt-2 grid gap-2 sm:grid-cols-2"><input name="name" required placeholder="Campaign name" className={input} /><select name="template_id" required className={input}><option value="">Approved email template</option>{(templates.data ?? []).map((template) => <option key={template.id} value={template.id}>{template.name} · {template.language_code}</option>)}</select><input name="scheduled_at" type="datetime-local" required className={input} /><button className={secondary}>Schedule</button></form></details><EditPoolForm pool={pool} />{poolCampaigns.length > 0 && <div className="mt-3 space-y-1">{poolCampaigns.map((campaign) => <p key={campaign.id} className="text-xs text-gray-500">{campaign.name} · {campaign.status}{campaign.scheduled_at ? ` · ${new Date(campaign.scheduled_at).toLocaleString('en-TZ')}` : ''}</p>)}</div>}</section> })}</div>
    {/* The page rendered an empty grid and nothing else, so it read as broken
        rather than empty. */}
    {(pools.data ?? []).length === 0 && <div className="mt-5"><EmptyState title="No talent pools yet" hint="Create a pool above to group consented prospects you want to keep warm for future roles." /></div>}
  </>
}
