// One-off local-dev helper: ensure dev@opusfesta.com has a workforce_employees
// row so the DISABLE_ADMIN_AUTH bypass can resolve a Workspace identity.
// Run: node --env-file=apps/opus_admin/.env.local scripts/dev-ensure-employee.mjs
import { createClient } from '@supabase/supabase-js'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const supabase = createClient(url, key, { auth: { persistSession: false } })
const EMAIL = 'dev@opusfesta.com'

const { data: existing, error: lookupError } = await supabase
  .from('workforce_employees')
  .select('id, employee_code, full_name, email, status, dashboard_access')
  .ilike('email', EMAIL)

if (lookupError) {
  console.error('Lookup failed:', lookupError.message)
  process.exit(1)
}

if (existing && existing.length > 0) {
  console.log('Already exists:', JSON.stringify(existing, null, 2))
  // Make sure dashboard_access is on so the owner bypass + workspace both work.
  const row = existing[0]
  if (!row.dashboard_access || row.status !== 'Active') {
    const { error } = await supabase
      .from('workforce_employees')
      .update({ dashboard_access: true, status: 'Active' })
      .eq('id', row.id)
    if (error) console.error('Update failed:', error.message)
    else console.log('Updated dashboard_access/status on', row.id)
  }
  process.exit(0)
}

// Mirror the employee_code convention of existing rows.
const { data: sample } = await supabase
  .from('workforce_employees')
  .select('employee_code')
  .order('created_at', { ascending: true })
  .limit(20)
console.log('Existing codes:', (sample ?? []).map((r) => r.employee_code).join(', '))

// dashboard_access requires a dashboard_role_id (workforce_employees_role_when_access).
const { data: ownerRole, error: roleError } = await supabase
  .from('workforce_roles')
  .select('id')
  .eq('slug', 'owner')
  .maybeSingle()
if (roleError || !ownerRole?.id) {
  console.error('Could not resolve owner role:', roleError?.message ?? 'missing')
  process.exit(1)
}

const { data: inserted, error: insertError } = await supabase
  .from('workforce_employees')
  .insert({
    employee_code: 'OF-016',
    full_name: 'Dev Admin',
    email: EMAIL,
    job_title: 'Owner',
    department: 'Founders',
    employment_type: 'Permanent',
    status: 'Active',
    location: 'Dar es Salaam',
    start_date: '2026-01-01',
    salary_tzs: 0,
    leave_balance_days: 28,
    avatar_color: '#F0DFF6',
    dashboard_access: true,
    dashboard_role_id: ownerRole.id,
    notes: 'Local development identity (DISABLE_ADMIN_AUTH bypass).',
  })
  .select('id, employee_code, full_name, email, status, dashboard_access')

if (insertError) {
  console.error('Insert failed:', insertError.message)
  process.exit(1)
}
console.log('Inserted:', JSON.stringify(inserted, null, 2))
