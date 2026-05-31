import { supabase } from '../supabaseClient';
import { hashPassword } from '../utils/passwordHash';
import { hashSecurityAnswer } from '../utils/securityAnswerHash';
import { sendAdminEmail, sendNewAccountRequest } from './emailService';
import { extractCreatedUserId, sendAccountReadyEmail } from './userNotificationHelpers';

async function hashOptionalSecurityAnswers(answer1, answer2, answer3) {
  return {
    hashedAnswer1: answer1 ? await hashSecurityAnswer(answer1) : null,
    hashedAnswer2: answer2 ? await hashSecurityAnswer(answer2) : null,
    hashedAnswer3: answer3 ? await hashSecurityAnswer(answer3) : null,
  };
}

function normalizeSecurityQuestionsRow(row) {
  if (!row) return null;
  const pick = (...keys) => keys.map((key) => row[key]).find((value) => value != null && value !== '') ?? '';
  return {
    question1: pick('question1', 'question_1', 'securityquestion1', 'securityQuestion1', 'security_question1', 'questiontext1', 'question_text1'),
    question2: pick('question2', 'question_2', 'securityquestion2', 'securityQuestion2', 'security_question2', 'questiontext2', 'question_text2'),
    question3: pick('question3', 'question_3', 'securityquestion3', 'securityQuestion3', 'security_question3', 'questiontext3', 'question_text3'),
  };
}

export async function createUser(
  email,
  fName,
  lName,
  address,
  dob,
  password,
  role,
  questionId1 = null,
  answer1 = null,
  questionId2 = null,
  answer2 = null,
  questionId3 = null,
  answer3 = null
) {
  try {
    const hashedPassword = await hashPassword(password);

    const { hashedAnswer1, hashedAnswer2, hashedAnswer3 } = await hashOptionalSecurityAnswers(
      answer1,
      answer2,
      answer3,
    );

    const { data, error } = await supabase.rpc('create_user_with_actor', {
      p_email: email,
      p_f_name: fName,
      p_l_name: lName,
      p_address: address,
      p_dob: dob,
      p_password: hashedPassword,
      p_role: role,
      p_questionid1: questionId1,
      p_secanswer1: hashedAnswer1,
      p_questionid2: questionId2,
      p_secanswer2: hashedAnswer2,
      p_questionid3: questionId3,
      p_secanswer3: hashedAnswer3,
    });

    if (error) {
      console.error('Error creating user (RPC):', error);
      throw error;
    }

    console.log('Created user JSON:', data);
    return data;
  } catch (err) {
    console.error('Error creating user:', err);
    throw err;
  }
}
export async function admin_createUser(
  email,
  fName,
  lName,
  address,
  dob,
  password,
  role,
  questionId1,
  answer1,
  questionId2,
  answer2,
  questionId3,
  answer3,
  changedByUserId
) {
  try {
    const hashedPassword = await hashPassword(password);

    const { hashedAnswer1, hashedAnswer2, hashedAnswer3 } = await hashOptionalSecurityAnswers(
      answer1,
      answer2,
      answer3,
    );

    const { data, error } = await supabase.rpc('create_user_with_actor', {
      p_email: email,
      p_f_name: fName,
      p_l_name: lName,
      p_address: address,
      p_dob: dob,
      p_password: hashedPassword,
      p_role: role,
      p_questionid1: questionId1,
      p_secanswer1: hashedAnswer1,
      p_questionid2: questionId2,
      p_secanswer2: hashedAnswer2,
      p_questionid3: questionId3,
      p_secanswer3: hashedAnswer3,
      p_changed_by: changedByUserId ?? null,
    });

    if (error) {
      console.error('Error creating user (RPC):', error);
      throw error;
    }

    const recipientEmail = String(email || '').trim();
    let accountCreationEmailSent = false;
    if (recipientEmail) {
      try {
        accountCreationEmailSent = await sendAccountReadyEmail({
          userId: extractCreatedUserId(data),
          fallbackEmail: recipientEmail,
          fallbackFName: fName,
          fallbackLName: lName,
          subject: 'Your account has been created',
          bodyIntro: 'An administrator has created your Better Finance account.',
        });
      } catch (emailError) {
        console.error('Error sending new account created email:', emailError);
      }
    }

    console.log('Created user JSON:', data);
    return {
      user: data,
      accountCreationEmailSent,
    };
  } catch (err) {
    console.error('Error creating user:', err);
    throw err;
  }
}

export async function createUserRequest(
  email,
  fName,
  lName,
  address,
  dob,
  password,
  questionId1,
  answer1,
  questionId2,
  answer2,
  questionId3,
  answer3,
  changedByUserId
) {
    try {
    const hashedPassword = await hashPassword(password);
    const { hashedAnswer1, hashedAnswer2, hashedAnswer3 } = await hashOptionalSecurityAnswers(
      answer1,
      answer2,
      answer3,
    );

    const { data } = await supabase.rpc('create_user_request', {
      p_email:       email,
      p_f_name:      fName,
      p_l_name:      lName,
      p_address:     address,
      p_dob:         dob,
      p_password:    hashedPassword,
      p_questionid1: questionId1,
      p_secanswer1:  hashedAnswer1,
      p_questionid2: questionId2,
      p_secanswer2:  hashedAnswer2,
      p_questionid3: questionId3,
      p_secanswer3:  hashedAnswer3,
    });

    console.log('User request JSON:', data);
    const fullName = `${fName} ${lName}`;

    try {
      await sendNewAccountRequest(fullName);
    } catch (emailError) {
      console.error('Error sending new account request email:', emailError);
    }

    return data;
    } 
    catch (error) {
        console.error('Error creating user request:', error);
        throw error;
    }
}

export async function getSecurityQuestions() {
  try {
    const { data, error } = await supabase.rpc('get_securityquestions');

    if (error) {
      console.error('Error getting security questions (RPC):', error);
      throw error;
    }

    return data || [];
  } catch (err) {
    console.error('Error in getSecurityQuestions:', err);
    throw err;
  }
}

export async function updateUser({
  userId,
  email,
  username,
  passwordHash,
  fName,
  lName,
  dob,
  address,
  picturePath,
  status,
  passwordExpires,
  role,
  suspendedTill,
  loginAttempts,
  changedBy,
}) {
  if (userId == null) {
    throw new Error('updateUser: userId is required');
  }

  const { data, error } = await supabase.rpc('update_user', {
    p_address:         address ?? null,
    p_dob:             dob ?? null,
    p_email:           email ?? null,
    p_fname:           fName ?? null,
    p_lname:           lName ?? null,
    p_loginattempts:   loginAttempts ?? null,
    p_password_hash:   passwordHash ?? null,
    p_passwordexpires: passwordExpires ?? null,
    p_picture_path:    picturePath ?? null,
    p_role:            role ?? null,
    p_status:          typeof status === 'boolean' ? status : null,
    p_suspendedtill:   suspendedTill ?? null,
    p_userid:          userId,
    p_username:        username ?? null,
    p_changed_by:      changedBy ?? null,
  });

  if (error) {
    console.error('Error updating user (RPC):', error);
    throw error;
  }

  return data;
}

export async function updateUserPicturePath({ userId, picturePath }) {
  if (userId == null) {
    throw new Error('updateUserPicturePath: userId is required');
  }

  const { data, error } = await supabase.rpc('update_user_picture_path', {
    p_userid: userId,
    p_picture_path: picturePath ?? null,
  });

  if (error) {
    console.error('Error updating user picture path (RPC):', error);
    throw error;
  }

  return data;
}



export async function getPasswords(){
    const { data, error } = await supabase.rpc('get_userpasswords');

    if (error) {
    console.error(error);
    } else {
    console.log(data);
    }
}

export async function getUser(userId) {
  try {
    const { data, error } = await supabase.rpc('get_user', {
      p_userid: userId,
    });

    if (error) {
      console.error('Error getting user:', error);
      throw error;
    }

    return data;
  } catch (error) {
    console.error('Error in getUser:', error);
    throw error;
  }
}

export async function checkEmail(email){
  try {
    const { data, error } = await supabase.rpc('check_email', { p_email: email });
    if (error) throw error;
    return !!data;
  } catch (error) {
    console.error('Error checking email:', error);
    return false;
  }
}

export async function getUserIdByEmailAndUsername(email, username) {
  try {
    const normalizedEmail = String(email ?? '').trim();
    const normalizedUsername = String(username ?? '').trim();
    if (!normalizedEmail || !normalizedUsername) {
      return null;
    }

    const { data, error } = await supabase
      .from('user')
      .select('userID')
      .eq('email', normalizedEmail)
      .eq('username', normalizedUsername)
      .maybeSingle();

    if (error) {
      console.error('Error looking up user ID by email/username:', error);
      throw error;
    }

    return data?.userID ?? null;
  } catch (error) {
    console.error('Error in getUserIdByEmailAndUsername:', error);
    throw error;
  }
}

export async function getUserSecurityQuestions(email, userId) {
  try {
    const parsedUserId = parseInt(String(userId ?? '').trim(), 10);
    if (Number.isNaN(parsedUserId)) {
      throw new Error('Invalid user ID.');
    }

    const { data, error } = await supabase.rpc('get_user_security_questions', {
      p_email: String(email ?? '').trim(),
      p_userid: parsedUserId,
    });

    if (error) {
      console.error('Error getting security questions:', error);
      throw error;
    }

    const row = Array.isArray(data) ? data[0] : data;
    return normalizeSecurityQuestionsRow(row);
  } catch (error) {
    console.error('Error in getUserSecurityQuestions:', error);
    throw error;
  }
}

export async function verifySecurityAnswers(email, userId, answer1, answer2, answer3) {
  try {
    const hashedAnswer1 = await hashSecurityAnswer(answer1);
    const hashedAnswer2 = await hashSecurityAnswer(answer2);
    const hashedAnswer3 = await hashSecurityAnswer(answer3);

    const { data, error } = await supabase.rpc('verify_security_answers', {
      p_email: email,
      p_userid: parseInt(userId, 10),
      p_answer1: hashedAnswer1,
      p_answer2: hashedAnswer2,
      p_answer3: hashedAnswer3,
    });

    if (error) {
      console.error('Error verifying security answers:', error);
      throw error;
    }

    return !!data;
  } catch (error) {
    console.error('Error in verifySecurityAnswers:', error);
    return false;
  }
}

export async function isPasswordReused(userId, newPassword) {
  try {
    const hashedPassword = await hashPassword(newPassword);

    const { data, error } = await supabase.rpc('is_password_reused', {
      p_userid: parseInt(userId, 10),
      p_new_password_hash: hashedPassword,
    });

    if (error) {
      console.error('Error checking password reuse (RPC):', error);
      throw error;
    }

    return !!data;
  } catch (err) {
    console.error('Error in isPasswordReused:', err);
    throw err;
  }
}

export async function updateUserPassword(userId, newPassword) {
  try {
    const hashedPassword = await hashPassword(newPassword);

    const { data, error } = await supabase.rpc('update_user_password', {
      p_userid: userId,
      p_new_password_hash: hashedPassword,
    });

    if (error) {
      console.error('Error updating user password (RPC):', error);
      throw error;
    }

    try {
      const { data: userRecord, error: userLookupError } = await supabase
        .from('user')
        .select('email, fName, lName, username')
        .eq('userID', userId)
        .maybeSingle();

      if (userLookupError) {
        throw userLookupError;
      }

      const recipientEmail = String(userRecord?.email ?? '').trim();
      if (recipientEmail) {
        const username = String(userRecord?.username ?? '').trim();
        const displayName =
          `${userRecord?.fName ?? ''} ${userRecord?.lName ?? ''}`.trim() ||
          username ||
          'User';

        const subject = 'Your password was reset';
        const message =
          `Hello ${displayName},\n\n` +
          'This is a confirmation that your Better Finance password was recently reset.\n\n' +
          `Username: ${username || '(not available)'}\n` +
          `Email: ${recipientEmail}\n\n` +
          'If you made this change, no further action is required.\n' +
          'If you did not request this change, contact your administrator immediately.';

        await sendAdminEmail(recipientEmail, displayName, subject, message);
      } else {
        console.warn('Password reset email not sent: user email is missing.');
      }
    } catch (notifyError) {
      console.error('Error sending password reset confirmation email:', notifyError);
    }

    return data;
  } catch (err) {
    console.error('Error in updateUserPassword:', err);
    throw err;
  }
}

export async function adminUpdateUserSecurityAnswers(userId, answer1, answer2, answer3) {
  try {
    const { hashedAnswer1, hashedAnswer2, hashedAnswer3 } = await hashOptionalSecurityAnswers(
      answer1,
      answer2,
      answer3,
    );

    const { data, error } = await supabase.rpc('admin_update_user_security_answers', {
      p_userid: parseInt(userId, 10),
      p_secanswer1: hashedAnswer1,
      p_secanswer2: hashedAnswer2,
      p_secanswer3: hashedAnswer3,
    });

    if (error) {
      console.error('Error updating user security answers (RPC):', error);
      throw error;
    }

    return data;
  } catch (err) {
    console.error('Error in adminUpdateUserSecurityAnswers:', err);
    throw err;
  }
}
export async function getAllUserRequests() {
  try {
    const { data, error } = await supabase.rpc('get_all_user_requests');

    if (error) {
      console.error('Error getting user requests (RPC):', error);
      throw error;
    }
    return data || [];
  } catch (err) {
    console.error('Error in getAllUserRequests:', err);
    throw err;
  }
}

export async function approveUserRequest(userRequestId, role, changedByUserId) {
  try {
    // Capture request contact info up front in case post-approval lookup is unavailable.
    let requestSnapshot = null;
    try {
      const { data: pendingRequests, error: pendingRequestsError } = await supabase.rpc('get_all_user_requests');
      if (pendingRequestsError) {
        throw pendingRequestsError;
      }
      requestSnapshot = (pendingRequests || []).find(
        (row) => String(row?.userID) === String(userRequestId)
      ) || null;
    } catch (prefetchError) {
      console.warn('Unable to prefetch account request details before approval:', prefetchError);
    }

    const { data, error } = await supabase.rpc('approve_user_request_with_actor', {
      p_userrequest_id: userRequestId,
      p_role: role,
      p_changed_by: changedByUserId ?? null,
    });

    if (error) {
      console.error('Error approving user request (RPC):', error);
      throw error;
    }

    let accountCreationEmailSent = false;
    try {
      const approvedRow = Array.isArray(data) ? data[0] : data;
      const fallbackEmail = String(approvedRow?.email || requestSnapshot?.email || '').trim();
      const fallbackUsername = String(approvedRow?.username || requestSnapshot?.username || '').trim();
      if (!fallbackEmail) {
        console.warn('Approval email not sent: could not resolve approved user identity.');
      } else {
        accountCreationEmailSent = await sendAccountReadyEmail({
          userId: extractCreatedUserId(data),
          fallbackEmail,
          fallbackUsername,
          fallbackFName: approvedRow?.fName || requestSnapshot?.fName,
          fallbackLName: approvedRow?.lName || requestSnapshot?.lName,
          subject: 'Your account request was approved',
          bodyIntro: 'Your Better Finance account request was approved by an administrator.',
        });
      }
    } catch (notifyError) {
      console.error('Error sending approved account email:', notifyError);
    }

    return {
      user: data,
      accountCreationEmailSent,
    };
  } catch (err) {
    console.error('Error in approveUserRequest:', err);
    throw err;
  }
}

export async function rejectUserRequest(userRequestId, changedByUserId) {
  try {
    const { data, error } = await supabase.rpc('reject_user_request_with_actor', {
      p_userrequest_id: userRequestId,
      p_changed_by: changedByUserId ?? null,
    });

    if (error) {
      console.error('Error rejecting user request (RPC):', error);
      throw error;
    }

    return data;
  } catch (err) {
    console.error('Error in rejectUserRequest:', err);
    throw err;
  }
}