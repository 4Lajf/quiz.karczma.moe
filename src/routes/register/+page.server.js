//src/routes/register/+page.server.js
import { redirect, fail } from '@sveltejs/kit';

export const actions = {
  register: async ({ request, locals: { supabase } }) => {
    const formData = await request.formData();
    const email = formData.get('email');
    const password = formData.get('password');
    const username = formData.get('username');

    // Validate input fields
    if (!email || !password || !username) {
      return fail(400, {
        error: 'All fields are required',
        email: email || '',
        username: username || ''
      });
    }

    // Validate username length
    if (username.length < 3) {
      return fail(400, {
        error: 'Username must be at least 3 characters long',
        email,
        username
      });
    }

    // Validate password length
    if (password.length < 6) {
      return fail(400, {
        error: 'Password must be at least 6 characters long',
        email,
        username
      });
    }

    // Check if username already exists
    const { data: existingUser } = await supabase
      .from('profiles')
      .select('username')
      .eq('username', username)
      .single();

    if (existingUser) {
      return fail(400, {
        error: 'Username already taken',
        email,
        username
      });
    }

    const { error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { username }
      }
    });

    if (signUpError) {
      let errorMessage = signUpError.message;
      switch (signUpError.message) {
        case 'User already registered':
          errorMessage = 'An account with this email already exists';
          break;
        case 'Password should be at least 6 characters':
          errorMessage = 'Password must be at least 6 characters long';
          break;
        default:
          errorMessage = 'An error occurred during registration. Please try again.';
      }

      return fail(400, {
        error: errorMessage,
        email,
        username
      });
    }

    // After successful registration, sign in the user
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password
    });

    if (signInError) {
      // In the unlikely case signing in fails after registration
      return fail(400, {
        error: 'Registration successful but automatic login failed. Please try logging in.',
        email,
        username
      });
    }

    throw redirect(303, '/admin');
  }
};