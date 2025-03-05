// src/routes/[roomId]/+page.server.js
import { error } from '@sveltejs/kit';

export const load = async ({ params, locals: { supabase } }) => {
  const { data: rooms, error: roomError } = await supabase
    .from('rooms')
    .select('*')
    .eq('id', params.roomId);

  if (roomError) {
    console.error('Room fetch error:', roomError);
    throw error(500, {
      message: 'Failed to fetch room',
      details: roomError.message,
      code: roomError.code
    });
  }

  if (!rooms || rooms.length === 0) {
    throw error(404, {
      message: 'Room not found',
      details: `No room found with id ${params.roomId}`,
      code: 'NOT_FOUND'
    });
  }

  return {
    room: rooms[0]
  };
};