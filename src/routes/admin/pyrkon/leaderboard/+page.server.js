// src/routes/admin/pyrkon/leaderboard/+page.server.js
import { error, redirect } from '@sveltejs/kit';

export const load = async ({ depends, locals: { supabase, safeGetSession } }) => {
  depends('admin-pyrkon-leaderboard');

  const { session, user } = await safeGetSession();

  if (!session) {
    throw redirect(302, '/login');
  }

  // Check if user has admin privileges
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  if (!profile || profile.role !== 'admin') {
    throw error(403, 'Access denied. Admin privileges required.');
  }

  return {
    session,
    user,
    profile
  };
};
