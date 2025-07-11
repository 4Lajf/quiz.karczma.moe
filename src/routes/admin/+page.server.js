//src/routes/admin/+page.server.js
export const load = async ({ depends, locals: { supabase } }) => {
  depends('rooms');

  const { data: rooms, error } = await supabase
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

  return {
    rooms: rooms || [],
    // Provide default values since authentication is no longer required
    profile: { username: 'admin', role: 'admin' },
    user: { id: 'admin' }
  };
};