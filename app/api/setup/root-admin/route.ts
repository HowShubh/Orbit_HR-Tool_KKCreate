import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { seedDefaultBalances } from '@/lib/db/seed-balances'

const CURRENT_LEAVE_YEAR = 2026

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
  const { full_name, email, password, promote_current } = body ?? {}

  if (!full_name) {
    return NextResponse.json(
      { error: 'Full name is required.' },
      { status: 400 }
    )
  }

  let userId: string
  let userEmail: string

  if (promote_current) {
    // Use the already-authenticated Supabase auth user
    const supabase = createClient()
    const {
      data: { user: authUser },
    } = await supabase.auth.getUser()

    if (!authUser?.email) {
      return NextResponse.json(
        { error: 'No authenticated user to promote.' },
        { status: 401 }
      )
    }

    userId = authUser.id
    userEmail = authUser.email
  } else {
    // Create a brand-new auth user from email + password
    if (!email || !password) {
      return NextResponse.json(
        { error: 'Email and password are required.' },
        { status: 400 }
      )
    }
    if (password.length < 8) {
      return NextResponse.json(
        { error: 'Password must be at least 8 characters.' },
        { status: 400 }
      )
    }

    const { data: authData, error: authError } = await adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    })

    if (authError || !authData.user) {
      return NextResponse.json(
        { error: authError?.message ?? 'Failed to create auth user.' },
        { status: 400 }
      )
    }

    userId = authData.user.id
    userEmail = email
  }

  // Create the users table row as founder
  const { error: userError } = await adminClient.from('users').insert({
    id: userId,
    email: userEmail,
    full_name,
    role: 'founder',
    joined_at: new Date().toISOString().split('T')[0],
  })

  if (userError) {
    // Roll back the auth user only if we created it ourselves
    if (!promote_current) {
      await adminClient.auth.admin.deleteUser(userId)
    }
    return NextResponse.json(
      { error: userError.message },
      { status: 500 }
    )
  }

  // Apply founder_full capability bundle
  await adminClient.rpc('recompute_role_bundles', {
    p_user_id: userId,
    p_new_role: 'founder',
  })

  // Seed default leave balances so founder's dashboard works on day one
  await seedDefaultBalances(adminClient, userId, CURRENT_LEAVE_YEAR)

  // Advance bootstrap state
  await adminClient
    .from('system_state')
    .update({ bootstrap_state: 'awaiting_first_hr' })
    .eq('id', 1)

  return NextResponse.json({ ok: true })
}
