import { supabase } from '../supabaseClient';

function shouldTryLowercaseLedgerTable(error) {
  const message = String(error?.message || '').toLowerCase();
  const isPermission =
    error?.code === '42501' ||
    message.includes('permission denied') ||
    message.includes('row-level security');
  return (
    !isPermission &&
    (error?.code === 'PGRST205' ||
      message.includes('schema cache') ||
      message.includes('does not exist') ||
      (message.includes('could not find') && message.includes('table')))
  );
}

/**
 * @param {string} label
 * @returns {string | null}
 */
export function parsePeriodEndLabel(label) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(label).trim());
  if (!m) return null;
  return `${m[1]}-${m[2]}-${m[3]}`;
}

function shiftYmd(ymd, deltaDays) {
  const [y, m, d] = String(ymd).split('-').map(Number);
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return '';
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + deltaDays);
  const yy = dt.getFullYear();
  const mm = String(dt.getMonth() + 1).padStart(2, '0');
  const dd = String(dt.getDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

function isCreditNormal(account) {
  return String(account.normalSide || '').toLowerCase() === 'credit';
}

function netMovement(account, debit, credit) {
  const d = Number(debit) || 0;
  const c = Number(credit) || 0;
  return isCreditNormal(account) ? c - d : d - c;
}

export function absAmount(account, debit, credit) {
  return Math.abs(netMovement(account, debit, credit));
}

const COGS_NAME_RE = /cost\s+of\s+goods|cost\s+of\s+sales|\bcogs\b/i;
const SALES_NAME_RE = /\bsales\b|service\s+revenue|\brevenue\b/i;
const COGS_SUBTYPE_RE = /cost\s+of\s+goods|cost\s+of\s+sales|cost\s+of\s+revenue/i;
const INTEREST_CHARGE_NAME_RE = /\binterest\b|finance\s*charge|borrowing\s*cost|loan\s*cost|debt\s*service/i;
const FINANCIAL_SUBTYPE_RE = /financial\s+expenses?|financing\s+expenses?/i;
const AR_NAME_RE = /receivable|a\/r|accounts\s+receivable/i;
const INV_NAME_RE = /inventory|merchandise|finished\s*goods|supplies/i;
const FIXED_ASSET_NAME_RE = /equipment|machinery|building|land|vehicle|furniture|fixture|plant/i;
const CONTRA_ASSET_RE = /accumulated\s+depreciation|allowance/i;
const LEASE_NAME_RE = /lease|rent/i;
const TAX_NAME_RE = /tax|income\s+tax/i;

export function classifyAccount(a) {
  const type = String(a.type || '').toLowerCase();
  const sub = String(a.subType || '').toLowerCase();
  const name = String(a.accountName || '').toLowerCase();
  return {
    isRevenue: type === 'revenue',
    isExpense: type === 'expenses',
    isSales: type === 'revenue' && SALES_NAME_RE.test(a.accountName || ''),
    isAsset: type === 'assets',
    isLiability: type === 'liabilities',
    isEquity: type === 'equity',
    isCurrentAsset: type === 'assets' && sub.includes('current asset'),
    isCurrentLiab: type === 'liabilities' && sub === 'current liabilities',
    isLongTermLiab: type === 'liabilities' && sub === 'long-term liabilities',
    isFixedAsset:
      type === 'assets' &&
      !sub.includes('current asset') &&
      !CONTRA_ASSET_RE.test(a.accountName || '') &&
      (sub.includes('fixed asset') || FIXED_ASSET_NAME_RE.test(a.accountName || '')),
    isFinancialExpense: type === 'expenses' && FINANCIAL_SUBTYPE_RE.test(a.subType || ''),
    isInterestCharge:
      type === 'expenses' &&
      (INTEREST_CHARGE_NAME_RE.test(a.accountName || '') || INTEREST_CHARGE_NAME_RE.test(a.subType || '')),
    isLeaseObligation:
      (type === 'expenses' || type === 'liabilities') &&
      (LEASE_NAME_RE.test(a.accountName || '') || LEASE_NAME_RE.test(a.subType || '')),
    isTaxExpense:
      type === 'expenses' &&
      (TAX_NAME_RE.test(a.accountName || '') || TAX_NAME_RE.test(a.subType || '')),
    isCogs:
      type === 'expenses' &&
      (COGS_NAME_RE.test(a.accountName || '') || COGS_SUBTYPE_RE.test(a.subType || '')),
    isInventory: type === 'assets' && sub.includes('current asset') && INV_NAME_RE.test(name),
    isReceivable: type === 'assets' && sub.includes('current asset') && AR_NAME_RE.test(a.accountName || ''),
  };
}

async function fetchAccounts() {
  const { data, error } = await supabase
    .from('chartOfAccounts')
    .select('accountID, accountNumber, accountName, normalSide, initBalance, type, subType, active')
    .order('accountNumber', { ascending: true });

  if (error) throw error;
  return (data || []).filter((a) => a.active !== false);
}

async function fetchAllLedgerRows() {
  const columns = 'ledgerID, accountID, debit, credit, entryDate';
  const primary = await supabase
    .from('Ledger')
    .select(columns)
    .order('entryDate', { ascending: true })
    .order('ledgerID', { ascending: true })
    .limit(25000);

  if (!primary.error) return primary.data || [];

  if (shouldTryLowercaseLedgerTable(primary.error)) {
    const fallback = await supabase
      .from('ledger')
      .select(columns)
      .order('entryDate', { ascending: true })
      .order('ledgerID', { ascending: true })
      .limit(25000);
    if (!fallback.error) return fallback.data || [];
  }
  throw primary.error;
}

/**
 * @param {object} account
 * @param {object[]} entriesSorted — ascending by date
 * @param {string[]} periodEnds - YYYY-MM-DD
 */
function endingBalancesForPeriods(account, entriesSorted, periodEnds) {
  let balance = Number(account.initBalance) || 0;
  let ei = 0;
  const out = [];
  const credit = isCreditNormal(account);

  for (const endStr of periodEnds) {
    while (ei < entriesSorted.length) {
      const e = entriesSorted[ei];
      const dStr = e.entryDate ? String(e.entryDate).slice(0, 10) : '';
      if (!dStr || dStr > endStr) break;
      const debit = Number(e.debit) || 0;
      const cr = Number(e.credit) || 0;
      balance += credit ? cr - debit : debit - cr;
      ei += 1;
    }
    out.push(balance);
  }
  return out;
}

/** @returns {Record<string, number[]>} accountID -> balance at each quarter */
function computeEndingBalancesByPeriod(accounts, entriesByAccount, periodEnds) {
  /** @type {Record<string, number[]>} */
  const map = {};
  for (const account of accounts) {
    const id = account.accountID;
    const entries = entriesByAccount.get(id) || [];
    map[id] = endingBalancesForPeriods(account, entries, periodEnds);
  }
  return map;
}

function absBalanceAtIndex(balanceArrays, account, quarterIndex) {
  const arr = balanceArrays[account.accountID];
  if (!arr || arr[quarterIndex] === undefined) return 0;
  return Math.abs(arr[quarterIndex]);
}

function emptySeries(length) {
  return Array(length).fill(null);
}

function indexLedgerByAccount(ledgerRows) {
  const entriesByAccount = new Map();
  for (const e of ledgerRows) {
    const id = e.accountID;
    if (!entriesByAccount.has(id)) entriesByAccount.set(id, []);
    entriesByAccount.get(id).push(e);
  }
  for (const [, list] of entriesByAccount) {
    list.sort((a, b) => {
      const da = a.entryDate ? String(a.entryDate).slice(0, 10) : '';
      const db = b.entryDate ? String(b.entryDate).slice(0, 10) : '';
      if (da !== db) return da < db ? -1 : 1;
      return (a.ledgerID || 0) - (b.ledgerID || 0);
    });
  }
  return entriesByAccount;
}

function aggregatePeriodFlows(ledgerRows, accountsById, classificationById, start, end) {
  let rev = 0;
  let salesQ = 0;
  let exp = 0;
  let cogsQ = 0;
  let intByNameQ = 0;
  let intFinancialQ = 0;
  let leaseQ = 0;
  let taxQ = 0;

  for (const e of ledgerRows) {
    const dStr = e.entryDate ? String(e.entryDate).slice(0, 10) : '';
    if (!dStr || dStr < start || dStr > end) continue;

    const acct = accountsById.get(e.accountID);
    const c = classificationById.get(e.accountID);
    if (!acct || !c) continue;

    const amt = absAmount(acct, e.debit, e.credit);
    if (c.isRevenue) {
      rev += amt;
      if (c.isSales) salesQ += amt;
    }
    if (c.isExpense) {
      exp += amt;
      if (c.isCogs) cogsQ += amt;
      if (c.isInterestCharge) intByNameQ += amt;
      if (c.isFinancialExpense) intFinancialQ += amt;
      if (c.isTaxExpense) taxQ += amt;
    }
    if (c.isLeaseObligation) leaseQ += amt;
  }

  return {
    sales: salesQ > 0 ? salesQ : rev,
    cogs: cogsQ,
    interestExp: intByNameQ > 0 ? intByNameQ : intFinancialQ,
    leaseObligations: leaseQ,
    taxExp: taxQ,
    netIncome: rev - exp,
  };
}

function aggregatePeriodBalances(classified, balanceAt, index) {
  let ta = 0;
  let tl = 0;
  let te = 0;
  let ca = 0;
  let cl = 0;
  let lt = 0;
  let fa = 0;
  let inv = 0;
  let arVal = 0;

  for (const { account: a, c } of classified) {
    if (c.isAsset) ta += absBalanceAtIndex(balanceAt, a, index);
    if (c.isLiability) tl += absBalanceAtIndex(balanceAt, a, index);
    if (c.isEquity) te += absBalanceAtIndex(balanceAt, a, index);
    if (c.isCurrentAsset) ca += absBalanceAtIndex(balanceAt, a, index);
    if (c.isCurrentLiab) cl += absBalanceAtIndex(balanceAt, a, index);
    if (c.isLongTermLiab) lt += absBalanceAtIndex(balanceAt, a, index);
    if (c.isFixedAsset) fa += absBalanceAtIndex(balanceAt, a, index);
    if (c.isInventory) inv += absBalanceAtIndex(balanceAt, a, index);
    if (c.isReceivable) arVal += absBalanceAtIndex(balanceAt, a, index);
  }

  return { totalAssets: ta, totalLiab: tl, totalEquity: te, currentAssets: ca, currentLiab: cl, longTermLiab: lt, fixedAssets: fa, inventory: inv, ar: arVal };
}

function buildRatioSeriesFromMetrics(periodCount, flows, balances) {
  const series = {
    grossMargin: emptySeries(periodCount),
    operatingMargin: emptySeries(periodCount),
    netMargin: emptySeries(periodCount),
    roa: emptySeries(periodCount),
    roe: emptySeries(periodCount),
    roce: emptySeries(periodCount),
    currentRatio: emptySeries(periodCount),
    quickRatio: emptySeries(periodCount),
    invToNwc: emptySeries(periodCount),
    debtToAssets: emptySeries(periodCount),
    debtToEquity: emptySeries(periodCount),
    ltDebtToEquity: emptySeries(periodCount),
    tie: emptySeries(periodCount),
    fixedCharge: emptySeries(periodCount),
    invTurnover: emptySeries(periodCount),
    faturn: emptySeries(periodCount),
    taturn: emptySeries(periodCount),
    arTurnover: emptySeries(periodCount),
    collectionDays: emptySeries(periodCount),
  };

  for (let i = 0; i < periodCount; i++) {
    const rev = flows.sales[i] || 0;
    const cogsQ = flows.cogs[i] || 0;
    const intQ = flows.interestExp[i] || 0;
    const leaseQ = flows.leaseObligations[i] || 0;
    const taxQ = flows.taxExp[i] || 0;
    const ni = flows.netIncome[i] ?? 0;
    const ta = balances.totalAssets[i] || 0;
    const teq = balances.totalEquity[i] || 0;
    const tl = balances.totalLiab[i] || 0;
    const ca = balances.currentAssets[i] || 0;
    const cl = balances.currentLiab[i] || 0;
    const inv = balances.inventory[i] || 0;
    const fa = balances.fixedAssets[i] || 0;
    const arV = balances.ar[i] || 0;
    const lt = balances.longTermLiab[i] || 0;

    series.grossMargin[i] = rev > 0 ? (rev - cogsQ) / rev : null;
    const ebitProxy = ni + intQ + taxQ;
    series.operatingMargin[i] = rev > 0 ? ebitProxy / rev : null;
    series.netMargin[i] = rev > 0 ? ni / rev : null;
    series.roa[i] = ta > 0 ? ni / ta : null;
    series.roe[i] = teq > 0 ? ni / teq : null;
    series.roce[i] = teq > 0 ? ni / teq : null;
    series.currentRatio[i] = cl > 0 ? ca / cl : null;
    series.quickRatio[i] = cl > 0 ? (ca - inv) / cl : null;
    const nwc = ca - cl;
    series.invToNwc[i] = nwc !== 0 ? inv / nwc : null;
    series.debtToAssets[i] = ta > 0 ? tl / ta : null;
    series.debtToEquity[i] = teq > 0 ? tl / teq : null;
    series.ltDebtToEquity[i] = teq > 0 ? lt / teq : null;
    series.tie[i] = intQ > 0 ? ebitProxy / intQ : null;
    series.fixedCharge[i] = intQ + leaseQ > 0 ? (ebitProxy + leaseQ) / (intQ + leaseQ) : null;
    series.invTurnover[i] = inv > 0 ? rev / inv : null;
    series.faturn[i] = fa > 0 ? rev / fa : null;
    series.taturn[i] = ta > 0 ? rev / ta : null;
    const annualCreditSales = rev * 52;
    series.arTurnover[i] = arV > 0 && annualCreditSales > 0 ? annualCreditSales / arV : null;
    const avgDailySales = annualCreditSales > 0 ? annualCreditSales / 365 : 0;
    series.collectionDays[i] = arV > 0 && avgDailySales > 0 ? arV / avgDailySales : null;
  }

  return series;
}

function collectPeriodMetrics(periodEnds, ledgerRows, accountsById, classificationById, classified, balanceAt) {
  const n = periodEnds.length;
  const flows = {
    sales: emptySeries(n),
    cogs: emptySeries(n),
    interestExp: emptySeries(n),
    leaseObligations: emptySeries(n),
    taxExp: emptySeries(n),
    netIncome: emptySeries(n),
  };
  const balances = {
    totalAssets: emptySeries(n),
    totalLiab: emptySeries(n),
    totalEquity: emptySeries(n),
    currentAssets: emptySeries(n),
    currentLiab: emptySeries(n),
    longTermLiab: emptySeries(n),
    fixedAssets: emptySeries(n),
    inventory: emptySeries(n),
    ar: emptySeries(n),
  };

  for (let i = 0; i < n; i++) {
    const end = periodEnds[i];
    const start = shiftYmd(end, -6);
    const periodFlows = aggregatePeriodFlows(ledgerRows, accountsById, classificationById, start, end);
    flows.sales[i] = periodFlows.sales;
    flows.cogs[i] = periodFlows.cogs;
    flows.interestExp[i] = periodFlows.interestExp;
    flows.leaseObligations[i] = periodFlows.leaseObligations;
    flows.taxExp[i] = periodFlows.taxExp;
    flows.netIncome[i] = periodFlows.netIncome;

    const periodBalances = aggregatePeriodBalances(classified, balanceAt, i);
    balances.totalAssets[i] = periodBalances.totalAssets;
    balances.totalLiab[i] = periodBalances.totalLiab;
    balances.totalEquity[i] = periodBalances.totalEquity;
    balances.currentAssets[i] = periodBalances.currentAssets;
    balances.currentLiab[i] = periodBalances.currentLiab;
    balances.longTermLiab[i] = periodBalances.longTermLiab;
    balances.fixedAssets[i] = periodBalances.fixedAssets;
    balances.inventory[i] = periodBalances.inventory;
    balances.ar[i] = periodBalances.ar;
  }

  return { flows, balances };
}

/**
 * @param {string[]} periodLabels — old first
 * @returns {Promise<{
 *   error: Error | null,
 *   series: Record<string, (number|null)[]>
 * }>}
 */
export async function fetchRatioSeriesFromLedger(periodLabels) {
  const periodEnds = periodLabels.map(parsePeriodEndLabel).filter(Boolean);
  if (!periodEnds.length) {
    return { error: null, series: {} };
  }

  try {
    const [accounts, ledgerRows] = await Promise.all([fetchAccounts(), fetchAllLedgerRows()]);

    const accountsById = new Map(accounts.map((a) => [a.accountID, a]));
    const classified = accounts.map((a) => ({ account: a, c: classifyAccount(a) }));
    const classificationById = new Map(
      classified.map(({ account, c }) => [account.accountID, c]),
    );

    const entriesByAccount = indexLedgerByAccount(ledgerRows);
    const balanceAt = computeEndingBalancesByPeriod(accounts, entriesByAccount, periodEnds);
    const { flows, balances } = collectPeriodMetrics(
      periodEnds,
      ledgerRows,
      accountsById,
      classificationById,
      classified,
      balanceAt,
    );

    return {
      error: null,
      series: buildRatioSeriesFromMetrics(periodEnds.length, flows, balances),
    };
  } catch (err) {
    console.error('fetchRatioSeriesFromLedger:', err);
    return {
      error: err instanceof Error ? err : new Error(String(err)),
      series: {},
    };
  }
}
