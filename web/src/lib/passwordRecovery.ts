import { api, supabase } from './supabase';

export async function requestPasswordRecovery(email: string, origin: string) {
  const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
    redirectTo: new URL('/reset-password', origin).href,
  });
  if (error) throw error;
}

export async function saveOwnerPassword(password: string, confirmation: string) {
  if (password.length < 8) throw new Error('Use at least 8 characters.');
  if (password !== confirmation) throw new Error('The passwords do not match.');
  // Validate the current session against the existing owner gate before updating it.
  await api('/me');
  const { error } = await supabase.auth.updateUser({ password });
  if (error) throw error;
}
