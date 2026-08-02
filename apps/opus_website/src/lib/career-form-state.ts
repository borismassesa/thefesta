export type CareersFormState = {
  status: 'idle' | 'error' | 'success'
  message: string
  reference?: string
  fieldErrors?: Record<string, string>
}

export const INITIAL_CAREERS_FORM_STATE: CareersFormState = {
  status: 'idle',
  message: '',
}
