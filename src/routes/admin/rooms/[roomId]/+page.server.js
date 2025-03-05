// src/routes/admin/rooms/[roomId]/+page.server.js
import { error } from '@sveltejs/kit';

export const load = async ({ depends, params, locals: { supabase } }) => {

  // Add dependency tracking for realtime updates
  depends('room');
  depends('answers');
  depends('players');
  depends('rounds');

  try {
    // Fetch room data with all configurations
    const { data: rooms, error: roomError } = await supabase
      .from('rooms')
      .select(`
        *,
        enabled_fields,
        points_config
      `)
      .eq('id', params.roomId);

    if (roomError) {
      console.error('Room fetch error:', roomError);
      throw error(500, { message: 'Failed to fetch room' });
    }
    if (!rooms?.length) throw error(404, { message: 'Room not found' });

    const room = rooms[0];

    // Fetch all rounds for this room
    const { data: rounds, error: roundError } = await supabase
      .from('quiz_rounds')
      .select('*')
      .eq('room_id', params.roomId)
      .order('round_number', { ascending: false });

    if (roundError) {
      console.error('Rounds fetch error:', roundError);
      throw error(500, { message: 'Failed to fetch rounds' });
    }

    const currentRound = rounds[0] || null;

    // Fetch players
    const { data: players, error: playersError } = await supabase
      .from('players')
      .select('*')
      .eq('room_id', params.roomId)
      .order('score', { ascending: false })
      .order('tiebreaker', { ascending: false });

    if (playersError) {
      console.error('Players fetch error:', playersError);
      throw error(500, { message: 'Failed to fetch players' });
    }

    // Fetch correct answers for all rounds
    const { data: correctAnswers, error: correctAnswersError } = await supabase
      .from('correct_answers')
      .select('*')
      .in('round_id', rounds.map(r => r.id));

    if (correctAnswersError) {
      console.error('Correct Answers fetch error:', correctAnswersError);
      throw error(500, { message: 'Failed to fetch correct answers' });
    }

    // Fetch answers for all rounds, including answer status and extra fields
    const { data: allAnswers, error: answersError } = await supabase
      .from('answers')
      .select(`
        *,
        answer_status,
        extra_fields
      `)
      .eq('room_id', params.roomId);

    if (answersError) {
      console.error('Answers fetch error:', answersError);
      throw error(500, { message: 'Failed to fetch answers' });
    }

    // Annotate answers with correct status based on correct_answers
    const annotatedAnswers = allAnswers.map(answer => {
      // If the answer already has a status set (any field is true), 
      // respect the manually set values
      const hasManualChanges = answer.answer_status && (
        answer.answer_status.main_answer === true ||
        answer.answer_status.song_title === true ||
        answer.answer_status.song_artist === true ||
        answer.answer_status.other === true
      );
      
      // If manually edited, keep the existing status
      if (hasManualChanges) {
        return answer;
      }
      
      // Otherwise, perform automatic checking
      const roundCorrectAnswers = correctAnswers.filter(ca => ca.round_id === answer.round_id);
      
      // Start with existing answer status or default
      const newAnswerStatus = {
        ...(answer.answer_status || {}),
        main_answer: false,
        song_title: false,
        song_artist: false,
        other: false
      };
      
      // Helper for text normalization
      const normalizeText = (text) => (text ? text.toLowerCase().trim() : '');
      
      // Check main answer against all correct answers
      const mainAnswerMatches = roundCorrectAnswers.some(correctAnswer => 
        normalizeText(correctAnswer.content) === normalizeText(answer.content)
      );
      
      if (mainAnswerMatches) {
        newAnswerStatus.main_answer = true;
      }
      
      // Check extra fields individually
      if (answer.extra_fields) {
        // Check song_title
        if (answer.extra_fields.song_title) {
          const songTitleMatches = roundCorrectAnswers.some(correctAnswer => 
            correctAnswer.extra_fields?.song_title && 
            normalizeText(correctAnswer.extra_fields.song_title) === normalizeText(answer.extra_fields.song_title)
          );
          if (songTitleMatches) {
            newAnswerStatus.song_title = true;
          }
        }
        
        // Check song_artist
        if (answer.extra_fields.song_artist) {
          const artistMatches = roundCorrectAnswers.some(correctAnswer => 
            correctAnswer.extra_fields?.song_artist && 
            normalizeText(correctAnswer.extra_fields.song_artist) === normalizeText(answer.extra_fields.song_artist)
          );
          if (artistMatches) {
            newAnswerStatus.song_artist = true;
          }
        }
        
        // Check other field
        if (answer.extra_fields.other) {
          const otherMatches = roundCorrectAnswers.some(correctAnswer => 
            correctAnswer.extra_fields?.other && 
            normalizeText(correctAnswer.extra_fields.other) === normalizeText(answer.extra_fields.other)
          );
          if (otherMatches) {
            newAnswerStatus.other = true;
          }
        }
      }
      
      return {
        ...answer,
        answer_status: newAnswerStatus
      };
    });

    // Organize answers by round
    const roundAnswers = rounds.reduce((acc, round) => {
      acc[round.id] = annotatedAnswers.filter(answer => answer.round_id === round.id);
      return acc;
    }, {});

    return {
      room,
      rounds,
      currentRound,
      players: players || [],
      roundAnswers,
      currentAnswers: roundAnswers[room.current_round] || []
    };
  } catch (err) {
    console.error('Load error:', err);
    if (err.status) throw err;
    throw error(500, { message: 'Internal server error' });
  }
};