const HEALTH_COLORS = {
  healthy: '#16A34A',
  caution: '#F59E0B',
  risk: '#DC2626',
  unknown: '#64748B',
};

const HEALTH_CONFIG_BY_TITLE = {
  'Gross Profit Margin': { mode: 'higherBetter', caution: 0.1, healthy: 0.2 },
  'Operating Profit Margin (Return on Sales)': { mode: 'higherBetter', caution: 0.07, healthy: 0.15 },
  'Net Profit Margin (Net Return on Sales)': { mode: 'higherBetter', caution: 0.05, healthy: 0.1 },
  'Return on Total Assets': { mode: 'higherBetter', caution: 0.04, healthy: 0.08 },
  "Return on Stockholders' Equity": { mode: 'higherBetter', caution: 0.08, healthy: 0.15 },
  'Return on Common Equity': { mode: 'higherBetter', caution: 0.08, healthy: 0.15 },
  'Current Ratio': { mode: 'targetRange', riskLow: 1, cautionLow: 1.5, healthyLow: 1.5, healthyHigh: 3, cautionHigh: 4, riskHigh: 4 },
  'Quick (Acid-Test) Ratio': { mode: 'targetRange', riskLow: 0.7, cautionLow: 1, healthyLow: 1, healthyHigh: 2, cautionHigh: 2.5, riskHigh: 2.5 },
  'Inventory to Net Working Capital': { mode: 'lowerBetter', healthy: 0.6, caution: 1 },
  'Debt-to-Assets': { mode: 'lowerBetter', healthy: 0.5, caution: 0.65 },
  'Debt-to-Equity': { mode: 'lowerBetter', healthy: 1, caution: 2 },
  'Long-term Debt-to-Equity': { mode: 'lowerBetter', healthy: 0.8, caution: 1.5 },
  'Times Interest Earned': { mode: 'higherBetter', caution: 2, healthy: 3 },
  'Fixed-Charge Coverage': { mode: 'higherBetter', caution: 1.5, healthy: 2.5 },
  'Inventory Turnover': { mode: 'higherBetter', caution: 3, healthy: 5 },
  'Fixed Assets Turnover': { mode: 'higherBetter', caution: 0.8, healthy: 1.2 },
  'Total Assets Turnover': { mode: 'higherBetter', caution: 0.6, healthy: 1 },
  'Accounts Receivable Turnover': { mode: 'higherBetter', caution: 5, healthy: 8 },
  'Average Collection Period': { mode: 'lowerBetter', healthy: 45, caution: 60 },
};

const HEALTHY = { status: 'healthy', color: HEALTH_COLORS.healthy, score: 1, label: 'Healthy' };
const CAUTION = { status: 'caution', color: HEALTH_COLORS.caution, score: 0.55, label: 'Caution' };
const RISK = { status: 'risk', color: HEALTH_COLORS.risk, score: 0.15, label: 'Risk' };
const UNKNOWN = { status: 'unknown', color: HEALTH_COLORS.unknown, score: 0, label: 'No data' };
const UNRATED = { status: 'unknown', color: HEALTH_COLORS.unknown, score: 0.5, label: 'Unrated' };

function evaluateHigherBetter(value, cfg) {
  if (value >= cfg.healthy) return HEALTHY;
  if (value >= cfg.caution) return CAUTION;
  return RISK;
}

function evaluateLowerBetter(value, cfg) {
  if (value <= cfg.healthy) return HEALTHY;
  if (value <= cfg.caution) return CAUTION;
  return RISK;
}

function evaluateTargetRange(value, cfg) {
  if (value >= cfg.healthyLow && value <= cfg.healthyHigh) return HEALTHY;
  const inCautionBand =
    (value >= cfg.cautionLow && value < cfg.healthyLow) ||
    (value > cfg.healthyHigh && value <= cfg.cautionHigh);
  if (inCautionBand) return CAUTION;
  return RISK;
}

const MODE_EVALUATORS = {
  higherBetter: evaluateHigherBetter,
  lowerBetter: evaluateLowerBetter,
  targetRange: evaluateTargetRange,
};

export function evaluateHealth(title, value) {
  if (!Number.isFinite(value)) return UNKNOWN;

  const cfg = HEALTH_CONFIG_BY_TITLE[title];
  if (!cfg) return UNRATED;

  const evaluate = MODE_EVALUATORS[cfg.mode];
  return evaluate ? evaluate(value, cfg) : UNRATED;
}

export { HEALTH_COLORS };
