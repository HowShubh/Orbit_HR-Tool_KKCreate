import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function POST(request: Request) {
  const adminClient = createAdminClient()

  // Only callable while in awaiting_root_admin state
  const { data: stateRow } = await adminClient
    .from('system_state')
    .select('bootstrap_state')
    .single()

  if (stateRow?.bootstrap_state !== 'awaiting_root_admin') {
    return NextResponse.json(
      { error: 'Setup is already complete.' },
      { status: 410 }
    )
  }

  const body = await request.json()
  const { full_name, email, password } = body ?? {}

  if (!full_name || !email || !password) {
    return NextResponse.json(
      { error: 'full_name, email, and password are required.' },
      { status: 400 }
    )
  }

  if (password.length < 8) {
    return NextResponse.json(
      { error: 'Password must be at least 8 characters.' },
      { status: 400 }
    )
  }

  // Create the Supabase auth user
  const { data: authData, error: authError } = await adminClient.auth.admin.createUser({
    email,
    password,
    email_confirm: true, // skip email confirmation
  })

  if (authError || !authData.user) {
    return NextResponse.json(
      { error: authError?.message ?? 'Failed to create auth user.' },
      { status: 400 }
    )
  }

  // Create the users table row as founder
  const { error: userError } = await adminClient.from('users').insert({
    id: authData.user.id,
    email,
    full_name,
    role: 'founder',
    joined_at: new Date().toISOString().split('T')[0],
  })

  if (userError) {
    // Roll back the auth user
    await adminClient.auth.admin.deleteUser(authData.user.id)
    return NextResponse.json(
      { error: userError.message },
      { status: 500 }
    )
  }

  // Apply founder_full capability bundle
  await adminClient.rpc('recompute_role_bundles', {
    p_user_id: authData.user.id,
    p_new_role: 'founder',
  })

  // Advance bootstrap state
  await adminClient
    .from('system_state')
    .update({ bootstrap_state: 'awaiting_first_hr' })
    .eq('id', 1)

  return NextResponse.json({ ok: true })
}
