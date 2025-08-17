// src/lib/client/roomSecurity.js
import { error } from '@sveltejs/kit';

/**
 * Validates that a user can modify a room on the client side
 * @param {object} room - Room object with created_by field
 * @param {object} user - Current user object
 * @param {object} profile - Current user profile with role
 * @returns {boolean} true if user can modify the room
 * @throws {Error} if unauthorized
 */
export function canModifyRoom(room, user, profile) {
  if (!user || !profile) {
    throw new Error('Authentication required');
  }

  if (!room) {
    throw new Error('Room not found');
  }

  // Admin users can modify any room
  if (profile.role === 'admin') {
    return true;
  }

  // Regular users can only modify rooms they created
  if (room.created_by !== user.id) {
    throw new Error('Access denied. You can only modify rooms you created.');
  }

  return true;
}

/**
 * Validates that a user can access room-related resources
 * @param {string} roomId - Room ID to check
 * @param {object} supabase - Supabase client
 * @param {object} user - Current user object
 * @param {object} profile - Current user profile with role
 * @returns {Promise<object>} Room data if authorized
 * @throws {Error} if unauthorized or room not found
 */
export async function validateClientRoomAccess(roomId, supabase, user, profile) {
  if (!user || !profile) {
    throw new Error('Authentication required');
  }

  if (!roomId) {
    throw new Error('Room ID is required');
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
        throw new Error('Access denied. You can only access rooms you created.');
      } else {
        throw new Error('Room not found.');
      }
    }
    throw new Error('Failed to validate room access');
  }

  return room;
}
