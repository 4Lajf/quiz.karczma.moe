//src/hooks.server.js
import { createServerClient } from '@supabase/ssr'
import { redirect, error } from '@sveltejs/kit'
import { sequence } from '@sveltejs/kit/hooks'
import { PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY } from '$env/static/public'
import { initServer } from '$lib/server/init.js'

// Initialize server components on startup
initServer();

const supabase = async ({ event, resolve }) => {
  event.locals.supabase = createServerClient(PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY, {
    cookies: {
      getAll: () => event.cookies.getAll(),
      setAll: (cookiesToSet) => {
        cookiesToSet.forEach(({ name, value, options }) => {
          event.cookies.set(name, value, { ...options, path: '/' })
        })
      },
    },
  })

  event.locals.safeGetSession = async () => {
    const {
      data: { session },
    } = await event.locals.supabase.auth.getSession()
    if (!session) {
      return { session: null, user: null, profile: null }
    }

    const {
      data: { user },
      error: userError,
    } = await event.locals.supabase.auth.getUser()
    if (userError) {
      return { session: null, user: null, profile: null }
    }

    // Fetch user profile after confirming valid session
    const { data: profile } = await event.locals.supabase
      .from('profiles')
      .select('id, username, avatar_url, role')
      .eq('id', user.id)
      .single()
    return { session, user, profile }
  }

  return resolve(event, {
    filterSerializedResponseHeaders(name) {
      return name === 'content-range' || name === 'x-supabase-api-version'
    },
  })
}

const authGuard = async ({ event, resolve }) => {
  const { session, user, profile } = await event.locals.safeGetSession()
  event.locals.session = session
  event.locals.user = user
  event.locals.profile = profile

  // Guard admin routes - require authentication and admin role
  if (event.url.pathname.startsWith('/admin')) {
    // Check if user is authenticated
    if (!session || !user) {
      throw redirect(303, '/login?redirectTo=' + encodeURIComponent(event.url.pathname))
    }

    // Check if user has admin role
    if (!profile || profile.role !== 'admin') {
      throw error(403, 'Access denied. Admin privileges required.')
    }
  }

  // Redirect authenticated users away from login/register pages
  if (event.locals.session && ['/login', '/register'].includes(event.url.pathname)) {
    throw redirect(303, '/')
  }

  return resolve(event)
}

export const handle = sequence(supabase, authGuard)