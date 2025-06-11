// src/routes/admin/pyrkon/stats/+page.server.js
import { redirect } from '@sveltejs/kit';

/** @type {import('./$types').PageServerLoad} */
export async function load({ locals }) {
  // Check authentication and admin privileges
  const { session, user } = await locals.safeGetSession();
  
  if (!session) {
    throw redirect(303, '/auth');
  }

  const { data: profile } = await locals.supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  if (!profile || profile.role !== 'admin') {
    throw redirect(303, '/');
  }

  return {
    user,
    profile
  };
}
