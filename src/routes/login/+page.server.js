//src/routes/login/+page.server.js
import { redirect, fail } from '@sveltejs/kit';

export const actions = {
  login: async ({ request, locals: { supabase } }) => {
    const formData = await request.formData();
    const email = formData.get('email');
    const password = formData.get('password');

    if (!email || !password) {
      return fail(400, {
        error: 'Email and password are required',
        email: email || ''  // Preserve the email if provided
      });
    }

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password
    });

    if (error) {
      // Map Supabase error messages to user-friendly messages
      let errorMessage = error.message;
      switch (error.message) {
        case 'Invalid login credentials':
          errorMessage = 'Invalid email or password';
          break;
        case 'Email not confirmed':
          errorMessage = 'Please verify your email before logging in';
          break;
        default:
          errorMessage = 'An error occurred during login. Please try again.';
      }

      return fail(400, {
        error: errorMessage,
        email: email // Preserve the email
      });
    }

    throw redirect(303, '/');
  }
};