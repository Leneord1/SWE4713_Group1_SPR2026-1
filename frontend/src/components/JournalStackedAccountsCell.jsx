import React from 'react';
import PropTypes from 'prop-types';
import { partitionLinesByDebitCredit } from '../utils/journalLinePartition';

const ACCOUNT_BUTTON_STYLE = {
  background: 'none',
  border: 'none',
  padding: 0,
  cursor: 'pointer',
  textAlign: 'left',
};

const COLUMN_STYLE = {
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
  alignItems: 'flex-start',
};

export function JournalStackedAccountsCell({
  lines,
  journalEntryId,
  navigate,
  ledgerBasePath,
  emptyLabel = '—',
}) {
  const { debitLines, creditLines } = partitionLinesByDebitCredit(lines || []);

  return (
    <td style={{ verticalAlign: 'top', minWidth: 0, maxWidth: 360 }}>
      {debitLines.length === 0 && creditLines.length === 0 ? (
        emptyLabel
      ) : (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 10,
            alignItems: 'stretch',
            minWidth: 0,
          }}
        >
          <div style={COLUMN_STYLE}>
            {debitLines.length > 0 ? (
              debitLines.map((line) => (
                <div key={`d-${journalEntryId}-${line.accountID}`}>
                  <button
                    type="button"
                    className="link"
                    style={ACCOUNT_BUTTON_STYLE}
                    onClick={() => navigate(`${ledgerBasePath}/${line.accountNumber}`)}
                    title="Open account ledger"
                  >
                    {line.accountNumber} — {line.accountName}
                  </button>
                </div>
              ))
            ) : (
              <span style={{ color: 'var(--bff-border)', fontSize: 13 }}>—</span>
            )}
          </div>
          {creditLines.length > 0 && (
            <div
              style={{
                ...COLUMN_STYLE,
                paddingLeft: 28,
                marginLeft: 14,
                borderLeft: '2px solid var(--bff-primary)',
              }}
            >
              {creditLines.map((line) => (
                <div key={`c-${journalEntryId}-${line.accountID}`}>
                  <button
                    type="button"
                    className="link"
                    style={ACCOUNT_BUTTON_STYLE}
                    onClick={() => navigate(`${ledgerBasePath}/${line.accountNumber}`)}
                    title="Open account ledger"
                  >
                    {line.accountNumber} — {line.accountName}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </td>
  );
}

JournalStackedAccountsCell.propTypes = {
  lines: PropTypes.arrayOf(PropTypes.object),
  journalEntryId: PropTypes.oneOfType([PropTypes.string, PropTypes.number]).isRequired,
  navigate: PropTypes.func.isRequired,
  ledgerBasePath: PropTypes.string.isRequired,
  emptyLabel: PropTypes.string,
};
