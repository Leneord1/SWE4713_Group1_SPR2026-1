import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from 'recharts';
import { useAuth } from '../AuthContext';
import { HelpTooltip } from '../components/HelpTooltip';
import { currentQuarterWeekLabels, fetchRatioPagePeriodContext } from '../services/ratioPeriodsService';
import { fetchRatioSeriesFromLedger } from '../services/ratioLedgerService';
import { evaluateHealth, HEALTH_COLORS } from '../utils/ratioHealth';
import '../global.css';
import './Ratio.css';

function seriesFromValues(values, periods) {
  if (!periods?.length) return [];
  const vals = values || [];
  return periods.map((period, i) => ({
    period,
    value:
      vals[i] !== undefined && vals[i] !== null && Number.isFinite(vals[i]) ? vals[i] : null,
  }));
}

function formatPercent(v) {
  if (v === undefined || v === null || Number.isNaN(v)) return '';
  return `${(v * 100).toFixed(1)}%`;
}

function formatTimes(v) {
  if (v === undefined || v === null || Number.isNaN(v)) return '';
  return `${v.toFixed(2)}×`;
}

function formatDays(v) {
  if (v === undefined || v === null || Number.isNaN(v)) return '';
  return `${Math.round(v)} d`;
}

function RatioWheelCard({ title, data, valueFormatter, valueLabel = 'Ratio' }) {
  const trendData = (data || []).map((item) => {
    const healthForPoint = evaluateHealth(title, item?.value);
    return {
      ...item,
      pointColor: healthForPoint.color,
      pointLabel: healthForPoint.label,
    };
  });
  const hasData = trendData.some((item) => Number.isFinite(item?.value));
  const latestPoint = [...trendData].reverse().find((item) => Number.isFinite(item?.value)) || null;
  const health = evaluateHealth(title, latestPoint?.value);

  return (
    <article className="ratio-wheel-card">
      <h3 className="ratio-wheel-title">{title}</h3>
      <div className="ratio-wheel-chart">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={trendData}
            margin={{ top: 12, right: 12, left: 0, bottom: 6 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis
              dataKey="period"
              tick={{ fill: '#475569', fontSize: 11 }}
              axisLine={{ stroke: '#cbd5e1' }}
              tickLine={{ stroke: '#cbd5e1' }}
            />
            <YAxis
              tick={{ fill: '#475569', fontSize: 11 }}
              axisLine={{ stroke: '#cbd5e1' }}
              tickLine={{ stroke: '#cbd5e1' }}
              width={46}
            />
            <Tooltip
              formatter={(_, __, item) => {
                const actual = item?.payload?.value;
                return [valueFormatter(actual), valueLabel];
              }}
              labelFormatter={(label, payload) => {
                const p = payload?.[0]?.payload;
                const tag = p?.pointLabel ? ` (${p.pointLabel})` : '';
                return `${label}${tag}`;
              }}
            />
            <Line
              type="monotone"
              dataKey="value"
              stroke="#334155"
              strokeWidth={2}
              connectNulls={false}
              isAnimationActive={false}
              dot={({ cx, cy, payload }) => {
                if (!Number.isFinite(payload?.value)) return null;
                return (
                  <circle
                    cx={cx}
                    cy={cy}
                    r={4.5}
                    fill={payload.pointColor}
                    stroke="#0f172a"
                    strokeWidth={1}
                  />
                );
              }}
              activeDot={({ cx, cy, payload }) => {
                if (!Number.isFinite(payload?.value)) return null;
                return (
                  <circle
                    cx={cx}
                    cy={cy}
                    r={6}
                    fill={payload.pointColor}
                    stroke="#0f172a"
                    strokeWidth={1.5}
                  />
                );
              }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <p className="ratio-wheel-meta">
        {hasData
          ? `Trend over time. Latest: ${valueFormatter(latestPoint?.value)}`
          : 'No ratio data available'}
      </p>
      <div className="ratio-point-legend" aria-hidden="true">
        <span><i style={{ background: HEALTH_COLORS.risk }} />Risk</span>
        <span><i style={{ background: HEALTH_COLORS.caution }} />Caution</span>
        <span><i style={{ background: HEALTH_COLORS.healthy }} />Healthy</span>
      </div>
      <p className="ratio-wheel-health" style={{ color: health.color }}>
        Health: {health.label}
      </p>
    </article>
  );
}

function Section({ title, children }) {
  return (
    <section className="ratio-section">
      <h2 className="ratio-section-title">{title}</h2>
      <div className="ratio-card-row">
        {children}
      </div>
    </section>
  );
}

export default function Ratio() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [periods, setPeriods] = useState(() => currentQuarterWeekLabels(new Date()));
  const [periodsInfo, setPeriodsInfo] = useState({
    loading: true,
    error: null,
    ledgerMin: null,
    ledgerMax: null,
  });
  const [ratioSeries, setRatioSeries] = useState({});
  const [ratioLoading, setRatioLoading] = useState(true);
  const [ratioError, setRatioError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setPeriodsInfo((s) => ({ ...s, loading: true, error: null }));
      try {
        const { periods: labels, ledgerMin, ledgerMax } = await fetchRatioPagePeriodContext();
        if (cancelled) return;
        if (labels.length) setPeriods(labels);
        setPeriodsInfo({
          loading: false,
          error: null,
          ledgerMin,
          ledgerMax,
        });
      } catch (err) {
        console.error(err);
        if (!cancelled) {
          setPeriodsInfo({
            loading: false,
            error: err?.message || 'Could not load ledger dates.',
            ledgerMin: null,
            ledgerMax: null,
          });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    if (!periods.length) {
      setRatioLoading(false);
      return undefined;
    }
    (async () => {
      setRatioLoading(true);
      setRatioError(null);
      try {
        const { error, series } = await fetchRatioSeriesFromLedger(periods);
        if (cancelled) return;
        if (error) setRatioError(error.message);
        setRatioSeries(series || {});
      } catch (err) {
        console.error(err);
        if (!cancelled) setRatioError(err?.message || 'Could not compute ratios from the ledger.');
        setRatioSeries({});
      } finally {
        if (!cancelled) setRatioLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [periods]);

  const dashboardPath =
    user?.role === 'administrator'
      ? '/admin-dashboard'
      : user?.role === 'manager'
        ? '/manager-dashboard'
        : user?.role === 'accountant'
          ? '/accountant-dashboard'
          : '/dashboard';

  const s = ratioSeries;

  return (
    <div className="ratio-page-container" style={{ paddingBottom: 48 }}>
      <div className="header-row" style={{ alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
        <h1>Key Financial Ratios</h1>
      </div>

      <p style={{ marginBottom: 10, maxWidth: '90vw', color: '#64748b', fontSize: '0.9rem', textAlign: 'center' }}>
        {periodsInfo.loading && 'Loading chart periods… '}
        {!periodsInfo.loading &&
          !periodsInfo.error &&
          (periodsInfo.ledgerMin && periodsInfo.ledgerMax
            ? `Posting range on the ledger: ${String(periodsInfo.ledgerMin).slice(0, 10)} → ${String(
                periodsInfo.ledgerMax,
              ).slice(0, 10)}. `
            : '')}
        {!periodsInfo.loading && periodsInfo.error && (
          <span style={{ color: 'var(--bff-red)' }}>{periodsInfo.error} </span>
        )}
        {ratioLoading && 'Loading ratios from ledger activity… '}
        {!ratioLoading && ratioError && (
          <span style={{ color: 'var(--bff-red)' }}>{ratioError} </span>
        )}
        {!periodsInfo.loading && <span>Periods: {periods.join(' · ')}.</span>}
      </p>

      <Section title="Profitability Ratios">
        <RatioWheelCard
          title="Gross Profit Margin"
          data={seriesFromValues(s.grossMargin, periods)}
          valueFormatter={formatPercent}
          valueLabel="Margin"
        />
        <RatioWheelCard
          title="Operating Profit Margin (Return on Sales)"
          data={seriesFromValues(s.operatingMargin, periods)}
          valueFormatter={formatPercent}
          valueLabel="Margin"
        />
        <RatioWheelCard
          title="Net Profit Margin (Net Return on Sales)"
          data={seriesFromValues(s.netMargin, periods)}
          valueFormatter={formatPercent}
          valueLabel="Margin"
        />
        <RatioWheelCard
          title="Return on Total Assets"
          data={seriesFromValues(s.roa, periods)}
          valueFormatter={formatPercent}
          valueLabel="ROA"
        />
        <RatioWheelCard
          title="Return on Stockholders' Equity"
          data={seriesFromValues(s.roe, periods)}
          valueFormatter={formatPercent}
          valueLabel="ROE"
        />
        <RatioWheelCard
          title="Return on Common Equity"
          data={seriesFromValues(s.roce, periods)}
          valueFormatter={formatPercent}
          valueLabel="ROCE"
        />
      </Section>

      <Section title="Liquidity Ratios">
        <RatioWheelCard
          title="Current Ratio"
          data={seriesFromValues(s.currentRatio, periods)}
          valueFormatter={formatTimes}
          valueLabel="Ratio"
        />
        <RatioWheelCard
          title="Quick (Acid-Test) Ratio"
          data={seriesFromValues(s.quickRatio, periods)}
          valueFormatter={formatTimes}
          valueLabel="Ratio"
        />
        <RatioWheelCard
          title="Inventory to Net Working Capital"
          data={seriesFromValues(s.invToNwc, periods)}
          valueFormatter={formatTimes}
          valueLabel="Ratio"
        />
      </Section>

      <Section title="Leverage Ratios">
        <RatioWheelCard
          title="Debt-to-Assets"
          data={seriesFromValues(s.debtToAssets, periods)}
          valueFormatter={formatPercent}
          valueLabel="Debt / Assets"
        />
        <RatioWheelCard
          title="Debt-to-Equity"
          data={seriesFromValues(s.debtToEquity, periods)}
          valueFormatter={formatTimes}
          valueLabel="D/E"
        />
        <RatioWheelCard
          title="Long-term Debt-to-Equity"
          data={seriesFromValues(s.ltDebtToEquity, periods)}
          valueFormatter={formatTimes}
          valueLabel="LT D/E"
        />
        <RatioWheelCard
          title="Times Interest Earned"
          data={seriesFromValues(s.tie, periods)}
          valueFormatter={formatTimes}
          valueLabel="Coverage"
        />
        <RatioWheelCard
          title="Fixed-Charge Coverage"
          data={seriesFromValues(s.fixedCharge, periods)}
          valueFormatter={formatTimes}
          valueLabel="Coverage"
        />
      </Section>

      <Section title="Activity Ratios">
        <RatioWheelCard
          title="Inventory Turnover"
          data={seriesFromValues(s.invTurnover, periods)}
          valueFormatter={formatTimes}
          valueLabel="Turns"
        />
        <RatioWheelCard
          title="Fixed Assets Turnover"
          data={seriesFromValues(s.faturn, periods)}
          valueFormatter={formatTimes}
          valueLabel="Turns"
        />
        <RatioWheelCard
          title="Total Assets Turnover"
          data={seriesFromValues(s.taturn, periods)}
          valueFormatter={formatTimes}
          valueLabel="Turns"
        />
        <RatioWheelCard
          title="Accounts Receivable Turnover"
          data={seriesFromValues(s.arTurnover, periods)}
          valueFormatter={formatTimes}
          valueLabel="Turns"
        />
        <RatioWheelCard
          title="Average Collection Period"
          data={seriesFromValues(s.collectionDays, periods)}
          valueFormatter={formatDays}
          valueLabel="Days"
        />
      </Section>
    </div>
  );
}
