import { hasPermission } from '@/lib/admin-auth'
import { workspaceErrorCode } from '@/lib/workspace/errors'
import { requireWorkspaceCapability } from '@/lib/workspace/guards'
import {
  getCheckIns,
  getCompetencies,
  getCurrentCycle,
  getDevelopmentActions,
  getEvidence,
  getFeedback,
  getFeedbackAskedOfMe,
  getGoalsAwaitingMyApproval,
  getMyReviews,
  getReviewRatings,
  getReviewSections,
  getVisibleGoals,
} from '@/lib/performance/queries'
import AccessNotice from '../_components/AccessNotice'
import WorkspaceHeading from '../_components/WorkspaceHeading'
import PerformanceClient from './PerformanceClient'
import {
  acknowledgeReview,
  addGoalEvidence,
  createDevelopmentAction,
  createGoal,
  decideGoalApproval,
  finaliseReview,
  requestFeedback,
  respondToFeedback,
  saveReviewSection,
  setReviewRating,
  submitGoalForApproval,
  submitReview,
  updateDevelopmentAction,
  updateGoalProgress,
} from './actions'

export const dynamic = 'force-dynamic'

// Goals and Performance.
//
// This page reads the most sensitive data in the product. Two things follow
// from that and are worth stating where somebody editing it will see them:
//
//  1. Nothing here is fetched and then filtered. Reviews go through
//     performance_can_view_review() and their sections through
//     performance_visible_sections(), so a calibration note about this employee
//     never enters this process at all.
//
//  2. The only reviews loaded in detail are the ones this employee is entitled
//     to open. A review id is not enough; the database re-checks on every read.
export default async function PerformancePage() {
  let context
  try {
    context = await requireWorkspaceCapability('tools.use', { action: 'performance.view' })
  } catch (error) {
    return (
      <>
        <WorkspaceHeading title="Goals and performance" />
        <AccessNotice code={workspaceErrorCode(error)} />
      </>
    )
  }

  const { employee } = context
  const isHr = await hasPermission('workforce.write')
  const cycle = await getCurrentCycle()
  const cycleId = cycle?.id ?? null

  const [goals, approvalQueue, reviews, competencies, development, checkIns, feedbackInbox, feedback] =
    await Promise.all([
      getVisibleGoals(employee, cycleId, isHr),
      getGoalsAwaitingMyApproval(employee),
      getMyReviews(employee, cycleId, isHr),
      getCompetencies(),
      getDevelopmentActions(employee),
      getCheckIns(employee, cycleId),
      getFeedbackAskedOfMe(employee),
      getFeedback(employee.id, employee, cycleId, isHr),
    ])

  // Section bodies and rating history are loaded only for the reviews this
  // employee may actually open, one authorization check each.
  const reviewDetail = await Promise.all(
    reviews.map(async (review) => ({
      reviewId: review.id,
      sections: await getReviewSections(review.id, employee, isHr),
      ratings: await getReviewRatings(review.id, employee, isHr),
    })),
  )

  const evidence = cycle
    ? await getEvidence(employee.id, employee, cycle.startsOn, cycle.endsOn, isHr)
    : []

  return (
    <>
      <WorkspaceHeading
        title="Goals and performance"
        subtitle="What you are working towards, how it is going, and the record of the conversation."
      />
      <PerformanceClient
        employeeId={employee.id}
        isHr={isHr}
        cycle={cycle}
        goals={goals}
        approvalQueue={approvalQueue}
        reviews={reviews}
        reviewDetail={reviewDetail}
        competencies={competencies}
        development={development}
        checkIns={checkIns}
        feedbackInbox={feedbackInbox}
        feedback={feedback}
        evidence={evidence}
        actions={{
          createGoal,
          updateGoalProgress,
          addGoalEvidence,
          submitGoalForApproval,
          decideGoalApproval,
          saveReviewSection,
          setReviewRating,
          submitReview,
          finaliseReview,
          acknowledgeReview,
          requestFeedback,
          respondToFeedback,
          createDevelopmentAction,
          updateDevelopmentAction,
        }}
      />
    </>
  )
}
