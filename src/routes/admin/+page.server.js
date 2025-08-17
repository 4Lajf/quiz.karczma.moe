//src/routes/admin/+page.server.js
export const load = async ({ depends, locals: { supabase, user, profile } }) => {
  depends('rooms');

  // Build query based on user role
  let query = supabase
    .from('rooms')
    .select(`
      id,
      type,
      name,
      created_by,
      created_at,
      is_active,
      enabled_fields,
      settings,
      screen_mode,
      profiles (
        id,
        username,
        avatar_url
      )
    `)
    .order('created_at', { ascending: false });

  // If user is not an admin, only show rooms they created
  if (!profile || profile.role !== 'admin') {
    query = query.eq('created_by', user.id);
  }

  const { data: rooms, error } = await query;

  return {
    rooms: rooms || [],
    // Use real authenticated user data
    profile,
    user
  };
};