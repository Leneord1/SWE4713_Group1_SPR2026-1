function getEventTimestamp(row) {
  if (!row || typeof row !== 'object') return null;
  return row.changedAt ?? row.changedat ?? row.updatedAt ?? row.updatedat ?? null;
}

export function getLatestEventTimestamp(rows) {
  const list = Array.isArray(rows) ? rows : [];
  let latestIso = null;
  let latestMs = Number.NEGATIVE_INFINITY;

  for (const row of list) {
    const ts = getEventTimestamp(row);
    if (!ts) continue;
    const ms = new Date(ts).getTime();
    if (!Number.isFinite(ms)) continue;
    if (ms > latestMs) {
      latestMs = ms;
      latestIso = ts;
    }
  }

  return latestIso;
}

export function buildMovementByAccount(ledgerRows) {
  const movementByAccount = new Map();
  for (const row of ledgerRows || []) {
    const accountId = row.accountID;
    const debit = Number(row.debit) || 0;
    const credit = Number(row.credit) || 0;
    const existing = movementByAccount.get(accountId) || { debit: 0, credit: 0 };
    existing.debit += debit;
    existing.credit += credit;
    movementByAccount.set(accountId, existing);
  }
  return movementByAccount;
}

export function attachBalancesToAccounts(data, movementByAccount, lastModifiedByAccountId) {
  return (data || []).map((account) => {
    const movement = movementByAccount.get(account.accountID) || { debit: 0, credit: 0 };
    const opening = Number(account.initBalance) || 0;
    const isCreditNormal = String(account.normalSide || '').toLowerCase() === 'credit';
    const netMovement = isCreditNormal
      ? movement.credit - movement.debit
      : movement.debit - movement.credit;

    return {
      ...account,
      ledgerDebitTotal: movement.debit,
      ledgerCreditTotal: movement.credit,
      currentBalance: opening + netMovement,
      lastModifiedAt:
        lastModifiedByAccountId.get(account.accountID) ??
        account.updatedAt ??
        account.createdAt ??
        null,
    };
  });
}
