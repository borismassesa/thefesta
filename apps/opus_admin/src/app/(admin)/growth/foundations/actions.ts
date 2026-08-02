'use server'

import {
  approveTarget,
  archiveBusinessUnit,
  archiveMetricDefinition,
  createBusinessUnit,
  createCanonicalPeriod,
  createManualActual,
  createManualOverride,
  createMetricDefinition,
  createTargetDraft,
  createTargetRevision,
  rejectTarget,
  setPeriodStatus,
  submitTarget,
  updateBusinessUnit,
} from './services'

export async function createBusinessUnitAction(formData: FormData): Promise<void> {
  await createBusinessUnit(formData)
}

export async function updateBusinessUnitAction(formData: FormData): Promise<void> {
  await updateBusinessUnit(formData)
}

export async function archiveBusinessUnitAction(formData: FormData): Promise<void> {
  await archiveBusinessUnit(formData)
}

export async function createPeriodAction(formData: FormData): Promise<void> {
  await createCanonicalPeriod(formData)
}

export async function lockPeriodAction(formData: FormData): Promise<void> {
  await setPeriodStatus(formData, 'locked')
}

export async function closePeriodAction(formData: FormData): Promise<void> {
  await setPeriodStatus(formData, 'closed')
}

export async function createMetricDefinitionAction(formData: FormData): Promise<void> {
  await createMetricDefinition(formData)
}

export async function archiveMetricDefinitionAction(formData: FormData): Promise<void> {
  await archiveMetricDefinition(formData)
}

export async function createTargetDraftAction(formData: FormData): Promise<void> {
  await createTargetDraft(formData)
}

export async function submitTargetAction(formData: FormData): Promise<void> {
  await submitTarget(formData)
}

export async function approveTargetAction(formData: FormData): Promise<void> {
  await approveTarget(formData)
}

export async function rejectTargetAction(formData: FormData): Promise<void> {
  await rejectTarget(formData)
}

export async function createTargetRevisionAction(formData: FormData): Promise<void> {
  await createTargetRevision(formData)
}

export async function createManualActualAction(formData: FormData): Promise<void> {
  await createManualActual(formData)
}

export async function createManualOverrideAction(formData: FormData): Promise<void> {
  await createManualOverride(formData)
}
