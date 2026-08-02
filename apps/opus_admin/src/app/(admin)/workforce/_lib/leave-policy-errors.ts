type LeavePolicyQueryError = {
  code?: string | null
}

export function isMissingLeavePolicyTable(error: LeavePolicyQueryError | null | undefined): boolean {
  return error?.code === 'PGRST205' || error?.code === '42P01'
}
