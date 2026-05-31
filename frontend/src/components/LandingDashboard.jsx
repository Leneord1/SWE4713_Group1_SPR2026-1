import React, { useEffect, useMemo, useState } from 'react';
import PropTypes from 'prop-types';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../AuthContext';
import { fetchRatioPagePeriodContext } from '../services/ratioPeriodsService';
import { fetchRatioSeriesFromLedger } from '../services/ratioLedgerService';
import { getJournalEntries } from '../services/journalService';
import './LandingDashboard.css';

const STATUS = {
  good: 'good',
  warning: 'warning',
  risk: 'risk',
  unknown: 'unknown',
};

function classifyByRange(value, ranges) {
  if (!Number.isFinite(value)) {
    return { status: STATUS.unknown, message: 'Not enough data yet' };
  }
  if (ranges.good(value)) {
    return { status: STATUS.good, message: ranges.goodText };
  }
  if (ranges.warning(value)) {
    return { status: STATUS.warning, message: ranges.warningText };
  }
  return { status: STATUS.risk, message: ranges.riskText };
}

function formatValue(kind, value) {
  if (!Number.isFinite(value)) return '--';
  if (kind === 'percent') return `${(value * 100).toFixed(1)}%`;
  if (kind === 'days') return `${Math.round(value)} days`;
  return `${value.toFixed(2)}x`;
}

function latestValue(series) {
  if (!Array.isArray(series)) return null;
  for (let i = series.length - 1; i >= 0; i -= 1) {
    if (Number.isFinite(series[i])) return series[i];
  }
  return null;
}

export default function LandingDashboard({ title, subtitle, actions = [] }) {
  const navigate = useNavigate();
  const { user } = useAuth();

  const [ratioSeries, setRatioSeries] = useState({});
  const [pendingCount, setPendingCount] = useState(0);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setError('');
      try {
        const [{ periods: labels }, pendingEntries] = await Promise.all([
          fetchRatioPagePeriodContext(),
          getJournalEntries('pending'),
        ]);
        if (cancelled) return;
        setPendingCount((pendingEntries || []).length);

        if (labels?.length) {
          const { error: ratioError, series } = await fetchRatioSeriesFromLedger(labels);
          if (cancelled) return;
          if (ratioError) setError(ratioError.message || 'Could not load ratio dashboard.');
          setRatioSeries(series || {});
        }
      } catch (err) {
        if (!cancelled) {
          setError(err?.message || 'Could not load dashboard data.');
          setRatioSeries({});
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const ratioCards = useMemo(() => {
    const definitions = [
      {
        key: 'currentRatio',
        label: 'Current Ratio',
        kind: 'times',
        ranges: {
          good: (v) => v >= 1.5,
          warning: (v) => v >= 1,
          goodText: 'Healthy short-term liquidity',
          warningText: 'Borderline liquidity',
          riskText: 'Potential liquidity pressure',
        },
      },
      {
        key: 'quickRatio',
        label: 'Quick Ratio',
        kind: 'times',
        ranges: {
          good: (v) => v >= 1,
          warning: (v) => v >= 0.8,
          goodText: 'Strong liquid coverage',
          warningText: 'Monitor near-term obligations',
          riskText: 'Low liquid cushion',
        },
      },
      {
        key: 'debtToAssets',
        label: 'Debt-to-Assets',
        kind: 'percent',
        ranges: {
          good: (v) => v <= 0.5,
          warning: (v) => v <= 0.65,
          goodText: 'Conservative leverage',
          warningText: 'Moderate leverage',
          riskText: 'High leverage level',
        },
      },
      {
        key: 'netMargin',
        label: 'Net Profit Margin',
        kind: 'percent',
        ranges: {
          good: (v) => v >= 0.1,
          warning: (v) => v >= 0.05,
          goodText: 'Strong profitability',
          warningText: 'Thin profitability',
          riskText: 'Weak profitability',
        },
      },
      {
        key: 'roa',
        label: 'Return on Assets',
        kind: 'percent',
        ranges: {
          good: (v) => v >= 0.05,
          warning: (v) => v >= 0.02,
          goodText: 'Good asset productivity',
          warningText: 'Average asset productivity',
          riskText: 'Low asset productivity',
        },
      },
      {
        key: 'collectionDays',
        label: 'Collection Period',
        kind: 'days',
        ranges: {
          good: (v) => v <= 45,
          warning: (v) => v <= 60,
          goodText: 'Receivables collected quickly',
          warningText: 'Collections are slowing',
          riskText: 'Collections need attention',
        },
      },
    ];

    return definitions.map((def) => {
      const value = latestValue(ratioSeries[def.key]);
      const rating = classifyByRange(value, def.ranges);
      return {
        ...def,
        value,
        status: rating.status,
        statusText: rating.message,
      };
    });
  }, [ratioSeries]);

  const messages = useMemo(() => {
    const list = [];
    if (pendingCount > 0) {
      if (user?.role === 'manager') {
        list.push(`${pendingCount} journal entr${pendingCount === 1 ? 'y is' : 'ies are'} waiting for your approval.`);
      } else {
        list.push(`${pendingCount} journal entr${pendingCount === 1 ? 'y is' : 'ies are'} pending manager approval.`);
      }
    } else {
      list.push('No journal entries are currently waiting for approval.');
    }
    if (error) {
      list.push(`Dashboard data warning: ${error}`);
    }
    return list;
  }, [pendingCount, user?.role, error]);

  return (
    <main className="landing-dashboard-main">
      <section className="landing-dashboard-card">
        <header className="landing-dashboard-header">
          <h1>{title}</h1>
          <p>{subtitle}</p>
        </header>

        <section className="landing-dashboard-actions">
          <h2>Menu Shortcuts</h2>
          <div className="landing-action-grid">
            {actions.map((action) => (
              <button key={action.path} type="button" className="button-primary" onClick={() => navigate(action.path)}>
                {action.label}
              </button>
            ))}
            <button type="button" className="button-primary" onClick={() => navigate('/ratios')}>
              Financial Ratios
            </button>
          </div>
        </section>

        <section className="landing-dashboard-status">
          <div className="landing-status-header">
            <h2>Financial Ratio Dashboard</h2>
            <p>Color coding: Green = good, Yellow = warning, Red = needs attention.</p>
          </div>
          <div className="landing-ratio-grid">
            {ratioCards.map((card) => (
              <article key={card.key} className={`landing-ratio-card status-${card.status}`}>
                <h3>{card.label}</h3>
                <strong>{formatValue(card.kind, card.value)}</strong>
                <span>{card.statusText}</span>
              </article>
            ))}
          </div>
        </section>

        <section className="landing-dashboard-messages">
          <h2>Important Messages</h2>
          <ul>
            {messages.map((message) => (
              <li key={message}>{message}</li>
            ))}
          </ul>
        </section>
      </section>
    </main>
  );
}

LandingDashboard.propTypes = {
  title: PropTypes.string.isRequired,
  subtitle: PropTypes.string,
  actions: PropTypes.arrayOf(PropTypes.node),
};
