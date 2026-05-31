import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../AuthContext';
import { fetchFromTable } from '../supabaseUtils';
import { supabase } from '../supabaseClient';
import { sendAdminEmail } from '../services/emailService';
import { getEmailRecipientsByRoles } from '../services/adminService';
import { fetchChartAccountEventLog, setChartAccountActiveWithActor } from '../services/chartOfAccountsService';
import { HelpTooltip } from '../components/HelpTooltip';
import editIcon from '../../assets/Images/resourceDirectory/Edit.png';
import deactivateIcon from '../../assets/Images/resourceDirectory/X.png';
import activateIcon from '../../assets/Images/resourceDirectory/Check.png';
import { CoaStaffEmailModal } from '../components/CoaStaffEmailModal';
import {
  attachBalancesToAccounts,
  buildMovementByAccount,
  getLatestEventTimestamp,
} from '../utils/chartOfAccountsData';
import { accountMatchesFilters, buildCoaActiveTokens } from '../utils/chartOfAccountsFilters';
import '../global.css';
import './ChartOfAccounts.css';

const defaultFilters = {
  accountName: '',
  accountNumber: '',
  category: '',
  subCategory: '',
  amountOperator: '',
  amountValue: '',
  status: ''
};

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

async function fetchLedgerMovementByAccount() {
  const columns = 'accountID, debit, credit';
  const primary = await supabase.from('Ledger').select(columns);
  if (!primary.error) return primary.data || [];

  if (shouldTryLowercaseLedgerTable(primary.error)) {
    const fallback = await supabase.from('ledger').select(columns);
    if (!fallback.error) return fallback.data || [];
  }
  throw primary.error;
}

function ChartOfAccounts() {
    const [deactivateTooltip, setDeactivateTooltip] = useState({});

    const tryDeactivateAccount = (account) => {
      if (Number(account.currentBalance) !== 0) {
        setDeactivateTooltip((prev) => ({ ...prev, [account.accountID]: true }));
        setTimeout(() => setDeactivateTooltip((prev) => ({ ...prev, [account.accountID]: false })), 2500);
        return;
      }
      handleDeactivate(account.accountID, account.active);
    };
  const [accounts, setAccounts] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [filterPopupVisible, setFilterPopupVisible] = useState(false);
  const [filters, setFilters] = useState(defaultFilters);
  const [viewMode, setViewMode] = useState('report');
  const [selectedAccountId, setSelectedAccountId] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [staffRecipients, setStaffRecipients] = useState([]);
  const [staffLoadError, setStaffLoadError] = useState(null);
  const [selectedStaffId, setSelectedStaffId] = useState('');
  const [staffEmailSubject, setStaffEmailSubject] = useState('');
  const [staffEmailMessage, setStaffEmailMessage] = useState('');
  const [staffEmailSending, setStaffEmailSending] = useState(false);
  const [staffEmailModalOpen, setStaffEmailModalOpen] = useState(false);
  const navigate = useNavigate();
  const { user } = useAuth();
  const isAdmin = user?.role === 'administrator';
  const canOpenLedger = !isAdmin;
  const dashboardPath =
    user?.role === 'administrator'
      ? '/admin-dashboard'
      : user?.role === 'manager'
        ? '/manager-dashboard'
        : user?.role === 'accountant'
          ? '/accountant-dashboard'
          : '/dashboard';

  useEffect(() => {
    if (!user) {
      navigate('/login');
      return;
    }
    loadAccounts();
  }, [user]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setStaffLoadError(null);
        const list = await getEmailRecipientsByRoles(['manager', 'accountant', 'administrator']);
        const currentUserId = user?.userID != null ? String(user.userID) : null;
        const filtered = currentUserId
          ? (list || []).filter((u) => String(u.userID) !== currentUserId)
          : list;
        if (!cancelled) setStaffRecipients(filtered);
      } catch (e) {
        if (!cancelled) setStaffLoadError(e?.message ?? String(e));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.userID]);

  useEffect(() => {
    if (!staffEmailModalOpen) return;
    const onKey = (e) => {
      if (e.key === 'Escape' && !staffEmailSending) setStaffEmailModalOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [staffEmailModalOpen, staffEmailSending]);

  const loadAccounts = async () => {
    setLoading(true);
    setError(null);
    try {
      const [{ data, error }, ledgerRows] = await Promise.all([
        fetchFromTable('chartOfAccounts', {
          orderBy: { column: 'accountNumber', ascending: true }
        }),
        fetchLedgerMovementByAccount(),
      ]);

      if (error) {
        setError('Failed to load accounts. You may not have permission.');
        console.error('RLS or fetch error:', error);
        setAccounts([]);
        return;
      }

      const lastModifiedByAccountId = new Map();
      await Promise.all(
        (data || []).map(async (account) => {
          try {
            const rows = await fetchChartAccountEventLog(account.accountID);
            const latest = getLatestEventTimestamp(rows);
            if (latest) {
              lastModifiedByAccountId.set(account.accountID, latest);
            }
          } catch {
            // silent catch that lets it keep loading. 
          }
        })
      );

      const movementByAccount = buildMovementByAccount(ledgerRows);
      setAccounts(attachBalancesToAccounts(data, movementByAccount, lastModifiedByAccountId));
    } catch (e) {
      console.error('Failed to load accounts with balances:', e);
      setError(e?.message || 'Failed to load current balances from the ledger.');
      setAccounts([]);
    } finally {
      setLoading(false);
    }
  };

  const handleDeactivate = async (id, currentStatus) => {
    const actorUserId = parseInt(user?.userID, 10);
    if (!Number.isFinite(actorUserId) || actorUserId <= 0) {
      alert('Unable to determine current administrator user ID.');
      return;
    }

    if (currentStatus) {
      const account = accounts.find((acc) => acc.accountID === id);
      if (account && account.initBalance > 0) {
        alert('Cannot deactivate an account with a balance greater than zero. Please zero out the balance first.');
        return;
      }
    }

    try {
      const newStatus = !currentStatus;
      await setChartAccountActiveWithActor(id, newStatus, actorUserId);

      const account = accounts.find((acc) => acc.accountID === id);
      const { data: admins, error: adminError } = await fetchFromTable('user', {
        select: 'email, fName, lName',
        filters: { role: 'administrator' }
      });
      if (!adminError && admins && account) {
        const subject = `Account Status Changed: ${account.accountName}`;
        const message = `The status of the following account has been changed to ${newStatus ? 'Active' : 'Inactive'} by ${user.fName} ${user.lName}:\n\nName: ${account.accountName}\nNumber: ${account.accountNumber}`;
        for (const admin of admins) {
          await sendAdminEmail(admin.email, `${admin.fName} ${admin.lName}`, subject, message);
        }
      }

      loadAccounts();
    } catch (err) {
      console.error('Failed to update account status:', err);
      alert(`Error: ${err.message}`);
    }
  };

  const handleSearch = () => setSearchQuery(searchTerm);

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') handleSearch();
  };

  const handleAmountValueChange = (value) => {
    if (value === '' || /^\d*(\.\d{0,2})?$/.test(value)) {
      setFilters({ ...filters, amountValue: value });
    }
  };

  const filteredAccounts = accounts.filter((account) =>
    accountMatchesFilters(account, filters, searchQuery),
  );

  const selectedAccount = accounts.find(account => account.accountID?.toString() === selectedAccountId);

  const activeTokens = buildCoaActiveTokens(searchQuery, filters);

  const resetAllFilters = () => {
    setFilters(defaultFilters);
    setSearchTerm('');
    setSearchQuery('');
  };

  const clearToken = (tokenKey) => {
    if (tokenKey === 'searchQuery') {
      setSearchTerm('');
      setSearchQuery('');
      return;
    }
    if (tokenKey === 'amount') {
      setFilters(prev => ({ ...prev, amountOperator: '', amountValue: '' }));
      return;
    }
    setFilters(prev => ({ ...prev, [tokenKey]: '' }));
  };

  const fmt = (val) => (val || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const handleSendStaffEmail = async (e) => {
    e.preventDefault();
    if (!selectedStaffId) {
      alert('Select a manager or accountant to email.');
      return;
    }
    const subject = staffEmailSubject.trim();
    const message = staffEmailMessage.trim();
    if (!subject || !message) {
      alert('Subject and message are required.');
      return;
    }
    const recipient = staffRecipients.find((u) => String(u.userID) === String(selectedStaffId));
    if (!recipient?.email) {
      alert('Selected user has no email on file.');
      return;
    }
    const displayName =
      [recipient.fName, recipient.lName].filter(Boolean).join(' ') || recipient.username || 'User';
    setStaffEmailSending(true);
    try {
      await sendAdminEmail(recipient.email.trim(), displayName, subject, message);
      alert(`Email sent to ${displayName} (${recipient.role}).`);
      setStaffEmailSubject('');
      setStaffEmailMessage('');
      setStaffEmailModalOpen(false);
    } catch (err) {
      console.error(err);
      alert(err?.message ?? 'Failed to send email.');
    } finally {
      setStaffEmailSending(false);
    }
  };

  return (
    <div className="page-chart-of-accounts">
      <div className="page-header">
      <h1>Chart of Accounts</h1>
      </div>
      <div className="header-row">
        <div className="button-group">
          {isAdmin && (
            <HelpTooltip text="Create a new account in the chart of accounts (administrators only).">
              <button className="button-primary" onClick={() => navigate('/admin/add-account')}>Add New Account</button>
            </HelpTooltip>
          )}
          <HelpTooltip text="Open a window to email a manager, accountant, or administrator about the chart of accounts.">
            <button
              type="button"
              onClick={() => setStaffEmailModalOpen(true)}
              className="button-primary"
            >
              Send an Email
            </button>
          </HelpTooltip>
          {viewMode === 'individual' ? (
            <HelpTooltip text="Show all accounts in a single table report.">
              <button className="button-primary" onClick={() => setViewMode('report')}>All Accounts</button>
            </HelpTooltip>
          ) : (
            <HelpTooltip text="Pick one account from a list to view its details.">
              <button className="button-primary" onClick={() => setViewMode('individual')}>Individual Account</button>
            </HelpTooltip>
          )}
        </div>
      <CoaStaffEmailModal
        open={staffEmailModalOpen}
        sending={staffEmailSending}
        loadError={staffLoadError}
        recipients={staffRecipients}
        selectedStaffId={selectedStaffId}
        onSelectedStaffIdChange={setSelectedStaffId}
        subject={staffEmailSubject}
        onSubjectChange={setStaffEmailSubject}
        message={staffEmailMessage}
        onMessageChange={setStaffEmailMessage}
        onClose={() => setStaffEmailModalOpen(false)}
        onSubmit={handleSendStaffEmail}
      />
      </div>
      <div className="chart-of-accounts-container">
        {viewMode !== 'individual' && <div className="search-and-filter">
          <div className="search-group">
            <div className="clear-input-container" role="group">
              <input className="input" type="text" placeholder="Search by account name or number..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} onKeyDown={handleKeyDown}/>
              <button type="button" className="button-clear" onClick={() => setSearchTerm('')} aria-label="Clear search input">X</button>
            </div>
            <HelpTooltip text="Apply the search box and current filters to narrow the account list.">
              <button className="button-secondary" style={{ height: '44px' }} onClick={handleSearch}>Search</button>
            </HelpTooltip>
              <button className="button-primary" onClick={() => setFilterPopupVisible(!filterPopupVisible)}>Filters {filterPopupVisible ? '▲' : '▼'}</button>
          </div>

          {filterPopupVisible && (
            <div className="filter-popup">
              <div className="filter-item">
                <label>Account Name:</label>
                <input
                  type="text"
                  value={filters.accountName}
                  onChange={(e) => setFilters({ ...filters, accountName: e.target.value })}
                  className="input"
                  style={{ width: '180px' }}
                  placeholder="e.g., Cash"
                />
              </div>
              <div className="filter-item">
                <label>Account Number:</label>
                <input
                  type="text"
                  value={filters.accountNumber}
                  onChange={(e) => setFilters({ ...filters, accountNumber: e.target.value })}
                  className="input"
                  style={{ width: '140px' }}
                  placeholder="e.g., 10000001"
                />
              </div>
              <div className="filter-item">
                <label>Category:</label>
                <select
                  value={filters.category}
                  onChange={(e) => setFilters({ ...filters, category: e.target.value })}
                  className="input"
                  style={{ width: 'auto' }}
                >
                  <option value="">All Categories</option>
                  <option value="Assets">Assets</option>
                  <option value="Liabilities">Liabilities</option>
                  <option value="Equity">Equity</option>
                  <option value="Revenue">Revenue</option>
                  <option value="Expenses">Expenses</option>
                </select>
              </div>
              <div className="filter-item">
                <label>Subcategory:</label>
                <input
                  type="text"
                  value={filters.subCategory}
                  onChange={(e) => setFilters({ ...filters, subCategory: e.target.value })}
                  className="input"
                  style={{ width: '180px' }}
                  placeholder="e.g., Current Assets"
                />
              </div>
              <div className="filter-item" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <label>Amount:</label>
                <div style={{ display: 'flex', gap: '6px' }}>
                  <select
                    value={filters.amountOperator}
                    onChange={(e) => setFilters({ ...filters, amountOperator: e.target.value })}
                    className="input"
                    style={{ width: '75px' }}
                  >
                    <option value="">-</option>
                    <option value="=">=</option>
                    <option value=">">&gt;</option>
                    <option value="<">&lt;</option>
                    <option value=">=">&gt;=</option>
                    <option value="<=">&lt;=</option>
                  </select>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={filters.amountValue}
                    onChange={(e) => handleAmountValueChange(e.target.value)}
                    className="input"
                    style={{ width: '130px' }}
                    placeholder="0.00"
                  />
                </div>
              </div>
              <div className="filter-item">
                <label>Status:</label>
                <select
                  value={filters.status}
                  onChange={(e) => setFilters({ ...filters, status: e.target.value })}
                  className="input"
                  style={{  width: 'auto' }}
                >
                  <option value="">All Statuses</option>
                  <option value="Active">Active</option>
                  <option value="Inactive">Inactive</option>
                </select>
              </div>
              <HelpTooltip text="Clear all filter fields in the popup back to defaults.">
                <button
                  onClick={resetAllFilters}
                  className="button-primary"
                  style={{ margin: '0 0 0 12px' }}
                >
                  Reset
                </button>
              </HelpTooltip>
            </div>
          )}
        </div>}
        {viewMode !== 'individual' && <div className="filter-tokens-container">
                {activeTokens.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                  {activeTokens.map((token) => (
                    <span
                      key={token.key}
                      style={{
                        color: 'var(--bff-dark-text)',
                        borderRadius: '12px',
                        padding: '2px 10px',
                        fontSize: '0.85rem',
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '6px'
                      }}
                    >
                      {token.label}
                      <HelpTooltip text={`Remove the "${token.label}" filter from the active filters.`}>
                        <button
                          onClick={() => clearToken(token.key)}
                          style={{
                            border: 'none',
                            background: 'transparent',
                            cursor: 'pointer',
                            color: 'var(--bff-primary)',
                            fontWeight: 700,
                            lineHeight: 1,
                          }}
                          aria-label={`Clear ${token.label}`}
                          type="button"
                        >
                          X
                        </button>
                      </HelpTooltip>
                    </span>
                  ))}
                </div>
              )}
          </div>}
        {loading && <p>Loading accounts...</p>}
        {error && <p style={{ color: 'red' }}>{error}</p>}

      {!loading && !error && viewMode === 'report' && (
        <table
          className={`user-report-table COA-table${isAdmin ? '' : ' COA-no-actions'}`}
        >
          <thead>
            <tr>
              <th className="COA-number">Number</th>
              <th className="COA-name">Account Name</th>
              <th className="COA-description">Description</th>
              <th className="COA-type">Type</th>
              <th className="COA-normal">Normal Side</th>
              <th className="COA-init money">Initial Balance</th>
              <th className="COA-debit money">Debit</th>
              <th className="COA-credit money">Credit</th>
              <th className="COA-current money">Current Balance</th>
              <th className="COA-added">Added At</th>
              <th className="COA-modified">Last Modified</th>
              <th className="COA-status">Status</th>
              <th className="COA-comment">Comment</th>
              <th className="COA-event">Event Log</th>
              {isAdmin && <th className="COA-actions">Actions</th>}
            </tr>
          </thead>
          <tbody>
            {filteredAccounts.length === 0 ? (
              <tr>
                <td
                  colSpan={isAdmin ? 15 : 14}
                  style={{ textAlign: 'center', padding: '20px', color: 'var(--bff-dark-text)' }}
                >
                  No accounts exist for the selected filters.
                </td>
              </tr>
            ) : (
              filteredAccounts.map((account) => (
                <tr
                  key={account.accountID}
                  onClick={() => {
                    if (canOpenLedger) navigate(`/admin/ledger/${account.accountNumber}`);
                  }}
                  style={{ cursor: canOpenLedger ? 'pointer' : 'default' }}
                  title={canOpenLedger ? 'Open account ledger' : undefined}
                >
                  <td className="COA-number">
                    <span className={canOpenLedger ? 'coa-ledger-link' : undefined}>
                      {account.accountNumber}
                    </span>
                  </td>
                  <td className="COA-name">
                    <span className={canOpenLedger ? 'coa-ledger-link' : undefined}>
                      {account.accountName}
                    </span>
                  </td>
                  <td className="COA-description">{account.description || 'N/A'}</td>
                  <td className="COA-type">{account.subType}</td>
                  <td className="COA-normal">{account.normalSide}</td>
                  <td className="COA-init money">${fmt(account.initBalance)}</td>
                  <td className="COA-debit money">${fmt(account.ledgerDebitTotal)}</td>
                  <td className="COA-credit money">${fmt(account.ledgerCreditTotal)}</td>
                  <td className="COA-current money">${fmt(account.currentBalance ?? account.initBalance)}</td>
                  <td className="COA-added">{account.createdAt ? new Date(account.createdAt).toLocaleString() : 'N/A'}</td>
                  <td className="COA-modified">{account.lastModifiedAt ? new Date(account.lastModifiedAt).toLocaleString() : 'N/A'}</td>
                  <td className="COA-status">{account.active ? 'Active' : 'Inactive'}</td>
                  <td className="COA-comment">{account.comment || 'N/A'}</td>
                  <td className="COA-event" onClick={(e) => e.stopPropagation()}>
                    <HelpTooltip text="View audit events for this account (before/after snapshots, who changed it, when).">
                      <button
                        type="button"
                        className="button-primary"
                        style={{ padding: '4px 10px', fontSize: '13px', }}
                        onClick={() => navigate(`/admin/chart-of-accounts/account/${account.accountID}/events`)}
                      >
                        View
                      </button>
                    </HelpTooltip>
                  </td>
                  {isAdmin && (
                    <td className="COA-actions">
                      <div className="COA-action-buttons">
                        <HelpTooltip text="Open the form to change this account's details.">
                          <button
                            type="button"
                            className="button-primary"
                            onClick={(e) => {
                              e.stopPropagation();
                              navigate(`/admin/edit-account/${account.accountID}`);
                            }}
                            style={{ padding: '4px 8px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                          >
                            <img src={editIcon} alt="Edit" style={{ height: '20px', width: 'auto' }} />
                          </button>
                        </HelpTooltip>
                        <HelpTooltip
                          text={
                            deactivateTooltip[account.accountID]
                              ? 'Cannot deactivate an account with an active balance.'
                              : account.active
                                ? 'Mark this account inactive so it cannot be used for new entries.'
                                : 'Mark this account active again for use in the system.'
                          }
                        >
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              tryDeactivateAccount(account);
                            }}
                            style={{ padding: '4px 8px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                          >
                            {account.active ? <img src={deactivateIcon} alt="Deactivate" className="icon-deactivate" style={{ height: '20px', width: 'auto' }} /> : <img src={activateIcon} alt="Activate" className="icon-activate" style={{ height: '20px', width: 'auto'}} />}
                          </button>
                        </HelpTooltip>
                      </div>
                    </td>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>
        )}

      {!loading && !error && viewMode === 'individual' && (
        <div>
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center', marginBottom: '15px' }}>
            <label htmlFor="account-select"><strong>Select Account:</strong></label>
            <select
              id="account-select"
              value={selectedAccountId}
              onChange={(e) => setSelectedAccountId(e.target.value)}
              className="input"
              style={{ width: '340px' }}
            >
              <option value="">Choose an account</option>
              {filteredAccounts.map((account) => (
                <option key={account.accountID} value={account.accountID}>
                  {account.accountNumber} - {account.accountName}
                </option>
              ))}
            </select>
            {selectedAccount && (
              <>
                {canOpenLedger && (
                  <HelpTooltip text="View journal activity and balances for the selected account.">
                    <button
                      type="button"
                      onClick={() => navigate(`/admin/ledger/${selectedAccount.accountNumber}`)}
                      className="button-primary"
                    >
                      Open Ledger
                    </button>
                  </HelpTooltip>
                )}
                <HelpTooltip text="View audit events for this account (before/after snapshots).">
                  <button
                    type="button"
                    onClick={() =>
                      navigate(`/admin/chart-of-accounts/account/${selectedAccount.accountID}/events`)
                    }
                    className="button-primary"
                    style={{ marginLeft: '8px' }}
                  >
                    Event log
                  </button>
                </HelpTooltip>
              </>
            )}
          </div>

            {!selectedAccount && <p>Select an account to view individual details.</p>}

            {selectedAccount &&
            (
              <table>
                <tbody>
                  <tr><th>Account Number</th><td>{selectedAccount.accountNumber}</td></tr>
                  <tr>
                    <th>Account Name</th>
                    <td>
                      {canOpenLedger ? (
                        <button
                          type="button"
                          className="button-primary"
                          onClick={() => navigate(`/admin/ledger/${selectedAccount.accountNumber}`)}
                          style={{
                            background: 'transparent',
                            border: 'none',
                            padding: 0,
                            textDecoration: 'underline',
                            cursor: 'pointer',
                            font: 'inherit'
                          }}
                        >
                          {selectedAccount.accountName}
                        </button>
                      ) : (
                        selectedAccount.accountName
                      )}
                    </td>
                  </tr>
                  <tr><th>Description</th><td>{selectedAccount.description || 'N/A'}</td></tr>
                  <tr><th>Category</th><td>{selectedAccount.type || 'N/A'}</td></tr>
                  <tr><th>Subcategory</th><td>{selectedAccount.subType || 'N/A'}</td></tr>
                  <tr><th>Normal Side</th><td>{selectedAccount.normalSide || 'N/A'}</td></tr>
                  <tr><th className='money'>Initial Balance</th><td className="money">${fmt(selectedAccount.initBalance)}</td></tr>
                  <tr><th className='money'>Current Balance</th><td className="money">${fmt(selectedAccount.currentBalance ?? selectedAccount.initBalance)}</td></tr>
                  <tr><th>Statement Type</th><td>{selectedAccount.statementType || 'N/A'}</td></tr>
                  <tr><th>Status</th><td>{selectedAccount.active ? 'Active' : 'Inactive'}</td></tr>
                  <tr><th>Added At</th><td>{selectedAccount.createdAt ? new Date(selectedAccount.createdAt).toLocaleString() : 'N/A'}</td></tr>
                  <tr><th>Last Modified</th><td>{selectedAccount.lastModifiedAt ? new Date(selectedAccount.lastModifiedAt).toLocaleString() : 'N/A'}</td></tr>
                </tbody>
              </table>
            )}
          </div>
        )}
                  {!loading && !error && (
            <div style={{ marginBottom: '12px' }}>
              {viewMode !== 'individual' && <p style={{ marginBottom: '6px' }}>
                Showing {filteredAccounts.length} of {accounts.length} accounts.
              </p>}
            </div>
          )}
        </div>
    </div>
  );
}

export default ChartOfAccounts;

