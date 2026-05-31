export function getUserField(user, ...keys) {
  for (const key of keys) {
    if (user?.[key] !== undefined && user?.[key] !== null) {
      return user[key];
    }
  }
  return null;
}

export function attemptLabel(count) {
  return `${count} attempt${count !== 1 ? 's' : ''}`;
}

export function minuteLabel(count) {
  return `${count} minute${count !== 1 ? 's' : ''}`;
}

export function navigateForRole(navigate, role) {
  const routes = {
    administrator: '/admin-dashboard',
    manager: '/manager-dashboard',
    accountant: '/accountant-dashboard',
  };
  navigate(routes[role] || '/');
}

export async function applyLoginSecurityUpdate(supabase, userId, updates) {
  const { error: updateError } = await supabase.from('user').update(updates).eq('userID', userId);

  if (!updateError) return;

  const { error: rpcError } = await supabase.rpc('update_user', {
    p_userid: userId,
    p_loginattempts: updates.loginAttempts ?? null,
    p_suspendedtill: updates.suspendedTill ?? null,
  });

  if (rpcError) throw rpcError;
}

export async function resolveActiveSuspension(userData, today, applyUpdate) {
  const suspendedTill = getUserField(userData, 'suspendedTill', 'suspendedtill');
  if (!suspendedTill) return { blocked: false };

  const suspendedTillDate = new Date(suspendedTill);
  if (today <= suspendedTillDate) {
    const minutesRemaining = Math.ceil((suspendedTillDate - today) / (1000 * 60));
    return { blocked: true, minutesRemaining };
  }

  await applyUpdate(userData.userID, {
    suspendFrom: null,
    suspendedTill: null,
    loginAttempts: 3,
  });
  return { blocked: false };
}

export async function handleFailedPassword(userData, applyUpdate) {
  const currentAttempts = getUserField(userData, 'loginAttempts', 'loginattempts') ?? 3;
  const newAttempts = Math.max(0, currentAttempts - 1);

  if (newAttempts === 0) {
    const now = new Date();
    const suspendedTillDate = new Date(now.getTime() + 60 * 1000);
    await applyUpdate(userData.userID, {
      loginAttempts: 0,
      suspendFrom: now.toISOString(),
      suspendedTill: suspendedTillDate.toISOString(),
    });
    return {
      message: 'Too many failed login attempts. Your account has been suspended for 1 minute.',
    };
  }

  await applyUpdate(userData.userID, { loginAttempts: newAttempts });
  return {
    message: `Invalid password. ${attemptLabel(newAttempts)} remaining.`,
  };
}
