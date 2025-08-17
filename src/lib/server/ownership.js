// src/lib/server/ownership.js
import { error } from '@sveltejs/kit';

/**
 * Validates that a user owns a room or is an admin
 * @param {object} supabase - Supabase client
 * @param {string} roomId - Room ID to check ownership for
 * @param {object} user - User object from locals
 * @param {object} profile - Profile object from locals
 * @returns {Promise<object>} Room data if authorized
 * @throws {Error} If unauthorized or room not found
 */
export async function validateRoomOwnership(supabase, roomId, user, profile) {
  if (!user || !profile) {
    throw error(401, 'Authentication required');
  }

  if (!roomId) {
    throw error(400, 'Room ID is required');
  }

  // Build query based on user role
  let roomQuery = supabase
    .from('rooms')
    .select('id, created_by, name, type')
    .eq('id', roomId);

  // If user is not an admin, only allow access to rooms they created
  if (profile.role !== 'admin') {
    roomQuery = roomQuery.eq('created_by', user.id);
  }

  const { data: room, error: roomError } = await roomQuery.single();

  if (roomError || !room) {
    if (roomError?.code === 'PGRST116' || !room) {
      // No rows returned - either room doesn't exist or user doesn't own it
      if (profile.role !== 'admin') {
        throw error(403, 'Access denied. You can only access rooms you created.');
      } else {
        throw error(404, 'Room not found.');
      }
    }
    throw error(500, 'Failed to validate room ownership');
  }

  return room;
}

/**
 * Validates that a user owns a room through a round ID or is an admin
 * @param {object} supabase - Supabase client
 * @param {string} roundId - Round ID to check ownership for
 * @param {object} user - User object from locals
 * @param {object} profile - Profile object from locals
 * @returns {Promise<object>} Round and room data if authorized
 * @throws {Error} If unauthorized or round not found
 */
export async function validateRoundOwnership(supabase, roundId, user, profile) {
  if (!user || !profile) {
    throw error(401, 'Authentication required');
  }

  if (!roundId) {
    throw error(400, 'Round ID is required');
  }

  // Get the round and associated room
  const { data: round, error: roundError } = await supabase
    .from('quiz_rounds')
    .select(`
      id,
      room_id,
      round_number,
      rooms!inner (
        id,
        created_by,
        name,
        type
      )
    `)
    .eq('id', roundId)
    .single();

  if (roundError || !round) {
    throw error(404, 'Round not found');
  }

  // Check room ownership
  if (profile.role !== 'admin' && round.rooms.created_by !== user.id) {
    throw error(403, 'Access denied. You can only access rounds from rooms you created.');
  }

  return {
    round,
    room: round.rooms
  };
}
