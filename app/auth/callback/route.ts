import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { todayIST } from '@/lib/date'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const next = searchParams.get('next') ?? '/'

  if (!code) {
    return NextResponse.redirect(`${origin}/login?error=no_code`)
  }

  const supabase = createClient()
  const { error: exchangeError, data } = await supabase.auth.exchangeCodeForSession(code)

  if (exchangeError || !data.user) {
    return NextResponse.redirect(`${origin}/login?error=exchange_failed`)
  }

  const authUser = data.user
  const adminClient = createAdminClient()

  // Check bootstrap state
  const { data: stateRow } = await adminClient
    .from('system_state')
    .select('bootstrap_state')
    .single()

  const bootstrapState = stateRow?.bootstrap_state ?? 'awaiting_root_admin'

  // Check if this auth user already has a users row
  const { data: existingUser } = await adminClient
    .from('users')
    .select('id, email, status')
    .eq('id', authUser.id)
    .single()

  // Bootstrap: first OAuth user becomes founder
  if (bootstrapState === 'awaiting_root_admin' && !existingUser) {
    const emailDomain = authUser.email?.split('@')[1]
    const allowedDomain = process.env.COMPANY_EMAIL_DOMAIN

    if (allowedDomain && emailDomain !== allowedDomain) {
      await supabase.auth.signOut()
      return NextResponse.redirect(
        `${origin}/setup?error=wrong_domain&domain=${allowedDomain}`
      )
    }

    // Create the founder user row
    const { error: createError } = await adminClient.from('users').insert({
      id: authUser.id,
      email: authUser.email!,
      full_name:
        authUser.user_metadata?.full_name ??
        authUser.user_metadata?.name ??
        authUser.email!.split('@')[0],
      role: 'founder',
      joined_at: todayIST(),
    })

    if (createError) {
      return NextResponse.redirect(`${origin}/login?error=user_create_failed`)
    }

    // Apply founder_full bundle via SQL function
    await adminClient.rpc('recompute_role_bundles', {
      p_user_id: authUser.id,
      p_new_role: 'founder',
    })

    // Advance bootstrap state
    await adminClient
      .from('system_state')
      .update({ bootstrap_state: 'awaiting_first_hr' })
      .eq('id', 1)

    return NextResponse.redirect(`${origin}/`)
  }

  // Sync email from Google if it changed
  if (existingUser && existingUser.email !== authUser.email) {
    await adminClient
      .from('users')
      .update({ email: authUser.email! })
      .eq('id', authUser.id)
  }

  // User is exited — deny login
  if (existingUser?.status === 'exited') {
    await supabase.auth.signOut()
    return NextResponse.redirect(`${origin}/login?error=account_exited`)
  }

  // No users row and not in bootstrap → contact HR
  if (!existingUser) {
    await supabase.auth.signOut()
    return NextResponse.redirect(`${origin}/login?error=not_onboarded`)
  }

  return NextResponse.redirect(`${origin}${next}`)
}
