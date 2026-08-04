import { hasAnyPermission, hasPermission } from '@/lib/admin-auth'
import { createSupabaseAdminClient } from '@/lib/supabase'
import { logGrowthDbError } from '../_lib/action-utils'
import { getGrowthEmployeeOptions, getKpiActuals, getKpiTargets } from '../_lib/queries'
import SocialClient, { type ChallengeRow, type ContentLogEntry } from './SocialClient'

export const dynamic = 'force-dynamic'

type ContentLogRow = {
  id: string
  post_date: string
  channel: string
  content_type: string
  topic: string
  posted_by_name: string
  likes: number
  comments: number
  shares: number
  saves: number
  reach: number
  new_followers: number
  notes: string
}

type ChallengeDbRow = {
  id: string
  launch_date: string
  theme: string
  lead_channel: string
  hashtag: string
  lead_owner_name: string
  posts_made: number | null
  total_reach: number | null
  total_engagements: number | null
  new_followers: number | null
  submissions_ugc: number | null
  result: string | null
  notes: string | null
}

function currentYear(): number {
  // eslint-disable-next-line react-hooks/purity -- server component, reflects request time
  const now = new Date()
  return now.getFullYear()
}

export default async function SocialMediaGrowthPage() {
  const canView = await hasAnyPermission(['growth.write', 'growth.admin'])
  if (!canView) throw new Error("You don't have permission to view the Social Media tracker.")
  const canWrite = await hasPermission('growth.write')
  const canAdmin = await hasPermission('growth.admin')

  const targets = await getKpiTargets('social_media')
  const actuals = await getKpiActuals(targets.map((t) => t.id))

  const supabase = createSupabaseAdminClient()
  const [{ data: contentRows, error: contentError }, { data: challengeRows, error: challengeError }, employeeOptions] =
    await Promise.all([
      supabase
        .from('growth_social_content_log')
        .select(
          'id, post_date, channel, content_type, topic, posted_by_name, likes, comments, shares, saves, reach, new_followers, notes',
        )
        .order('post_date', { ascending: false })
        .limit(300)
        .returns<ContentLogRow[]>(),
      supabase
        .from('growth_social_challenges')
        .select(
          'id, launch_date, theme, lead_channel, hashtag, lead_owner_name, posts_made, total_reach, total_engagements, new_followers, submissions_ugc, result, notes',
        )
        .order('launch_date', { ascending: true })
        .returns<ChallengeDbRow[]>(),
      getGrowthEmployeeOptions(),
    ])

  if (contentError) {
    logGrowthDbError('growth.social_content_log.select', contentError)
    throw new Error('Could not load Growth social content log.')
  }
  if (challengeError) {
    logGrowthDbError('growth.social_challenges.select', challengeError)
    throw new Error('Could not load Growth social challenges.')
  }

  const contentLog: ContentLogEntry[] = (contentRows ?? []).map((r) => ({
    id: r.id,
    postDate: r.post_date,
    channel: r.channel,
    contentType: r.content_type,
    topic: r.topic,
    postedByName: r.posted_by_name,
    likes: r.likes,
    comments: r.comments,
    shares: r.shares,
    saves: r.saves,
    reach: r.reach,
    newFollowers: r.new_followers,
    notes: r.notes,
  }))

  const challenges: ChallengeRow[] = (challengeRows ?? []).map((r) => ({
    id: r.id,
    launchDate: r.launch_date,
    theme: r.theme,
    leadChannel: r.lead_channel,
    hashtag: r.hashtag,
    leadOwnerName: r.lead_owner_name,
    postsMade: r.posts_made,
    totalReach: r.total_reach,
    totalEngagements: r.total_engagements,
    newFollowers: r.new_followers,
    submissionsUgc: r.submissions_ugc,
    result: r.result,
    notes: r.notes,
  }))

  return (
    <SocialClient
      targets={targets}
      actuals={actuals}
      initialYear={currentYear()}
      canWrite={canWrite}
      canAdmin={canAdmin}
      contentLog={contentLog}
      challenges={challenges}
      employeeNames={employeeOptions.map((e) => e.name)}
    />
  )
}
