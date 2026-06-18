//src/routes/+layout.js
import { createBrowserClient, createServerClient, isBrowser } from '@supabase/ssr'
import { PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY } from '$env/static/public'

export const load = async ({ data, depends, fetch }) => {
  depends('supabase:auth')
  depends('supabase:db');

  const supabase = isBrowser()
    ? createBrowserClient(PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY, {
      global: {
        fetch,
      },
    })
    : createServerClient(PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY, {
      global: {
        fetch,
      },
      cookies: {
        getAll() {
          return data.cookies
        },
      },
    })

  // Only use getUser() for verified user data
  let verifiedUser = null
  try {
    const {
      data: { user },
      error: userError
    } = await supabase.auth.getUser()
    verifiedUser = userError ? null : user
  } catch (error) {
    console.error('Failed to verify Supabase user:', error)
  }

  return {
    supabase,
    user: verifiedUser,
    // Get session and profile from the server-passed data
    session: data.session,
    profile: data.profile
  }
}
