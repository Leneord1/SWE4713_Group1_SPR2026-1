import { supabase } from '../supabaseClient';
import { sendAdminEmail } from './emailService';

export function extractCreatedUserId(data) {
  const createdRow = Array.isArray(data) ? data[0] : data;
  return (
    createdRow?.userID ??
    createdRow?.userid ??
    createdRow?.user_id ??
    createdRow?.approved_user_id ??
    createdRow?.new_user_id ??
    createdRow?.id ??
    null
  );
}

export async function lookupUserContact({ userId, email }) {
  let query = supabase.from('user').select('email, fName, lName, username');

  if (userId != null) {
    query = query.eq('userID', userId);
  } else if (email) {
    query = query.eq('email', email);
  } else {
    return null;
  }

  const { data, error } = await query.maybeSingle();
  if (error) throw error;
  return data;
}

export function formatUserDisplay(record, fallbacks = {}) {
  const email = String(record?.email || fallbacks.email || '').trim();
  const username = String(record?.username || fallbacks.username || '').trim();
  const nameFromRecord = record
    ? `${record.fName || ''} ${record.lName || ''}`.trim()
    : '';
  const nameFromFallback = `${fallbacks.fName || ''} ${fallbacks.lName || ''}`.trim();

  const displayName = record
    ? nameFromRecord || username || fallbacks.displayName || 'User'
    : username || nameFromFallback || fallbacks.displayName || 'User';

  return { email, username, displayName };
}

export async function sendAccountReadyEmail({
  userId,
  fallbackEmail,
  fallbackUsername = '',
  fallbackFName = '',
  fallbackLName = '',
  subject,
  bodyIntro,
}) {
  const recipientEmail = String(fallbackEmail || '').trim();
  if (!recipientEmail) return false;

  const fallbacks = {
    email: recipientEmail,
    username: fallbackUsername,
    fName: fallbackFName,
    lName: fallbackLName,
  };
  let contact = formatUserDisplay(null, fallbacks);

  try {
    const record = await lookupUserContact({ userId, email: recipientEmail });
    contact = formatUserDisplay(record, fallbacks);
  } catch (lookupError) {
    console.error('Error looking up user for notification email:', lookupError);
  }

  if (!contact.email) return false;

  const message =
    `Hello ${contact.displayName},\n\n` +
    `${bodyIntro}\n\n` +
    `Username: ${contact.username || '(not available)'}\n` +
    `Email: ${contact.email}\n\n` +
    'You can now sign in with your account credentials.\n\n' +
    'If you did not expect this account, please contact your administrator.';

  await sendAdminEmail(contact.email, contact.displayName, subject, message);
  return true;
}
