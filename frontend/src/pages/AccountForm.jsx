import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../AuthContext';
import { supabase } from '../supabaseClient';
import { fetchFromTable } from '../supabaseUtils';
import {
  createChartAccountWithActor,
  updateChartAccountWithActor,
} from '../services/chartOfAccountsService';
import { getEmailRecipientsByRoles } from '../services/adminService';
import { sendAdminEmail } from '../services/emailService';
import { HelpTooltip } from '../components/HelpTooltip';
import '../global.css';
import './AccountForm.css';

const subcategoriesMap = {
  'Assets': ['Current Assets', 'Fixed Assets', 'Intangible Assets', 'Other Assets'],
  'Liabilities': ['Current Liabilities', 'Long-term Liabilities', 'Other Liabilities'],
  'Equity': ["Owner's Equity", 'Retained Earnings', 'Common Stock'],
  'Revenue': ['Operating Revenue', 'Non-operating Revenue'],
  'Expenses': ['Operating Expenses', 'Non-operating Expenses', 'Administrative Expenses', 'Financial Expenses']
};

const prefixes = {
  'Assets': '1',
  'Liabilities': '2',
  'Equity': '3',
  'Revenue': '4',
  'Expenses': '5'
};

const normalSideMap = {
  'Assets': 'Debit',
  'Liabilities': 'Credit',
  'Equity': 'Credit',
  'Revenue': 'Credit',
  'Expenses': 'Debit'
};

const statementTypeMap = {
  'Assets': 'Balance Sheet',
  'Liabilities': 'Balance Sheet',
  'Equity': 'Balance Sheet',
  'Revenue': 'Income Statement',
  'Expenses': 'Income Statement'
};

const MONETARY_FIELDS = new Set(['initBalance']);

function parseFieldValue(name, value, inputType) {
  if (MONETARY_FIELDS.has(name)) {
    const cleanValue = typeof value === 'string' ? value.replaceAll(',', '') : value;
    if (cleanValue === '') return 0;
    const parsed = Number.parseFloat(cleanValue);
    return Number.isNaN(parsed) ? 0 : parsed;
  }
  if (name === 'accountNumber') {
    return value.replace(/\D/g, '').slice(0, 8);
  }
  if (name === 'liquidityRank') {
    if (value === '') return '';
    const parsed = Number.parseInt(value, 10);
    return Number.isNaN(parsed) ? '' : parsed;
  }
  return inputType === 'number' ? Number.parseFloat(value) : value;
}

function applyTypeFieldUpdates(updated, typeValue) {
  return {
    ...updated,
    subType: '',
    normalSide: normalSideMap[typeValue] || 'Debit',
    statementType: statementTypeMap[typeValue] || '',
  };
}

function formatCurrencyValue(value) {
  if (value === '' || value === undefined || value === null) return '';
  const number = Number.parseFloat(value);
  if (Number.isNaN(number)) return '';
  return new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(number);
}

function isDuplicateForOtherAccount(account, isEditing, currentId) {
  if (!isEditing) return true;
  return account.accountID !== Number.parseInt(currentId, 10);
}

function validateNewLiquidityRank(liquidityRank) {
  if (liquidityRank === '' || liquidityRank === null || liquidityRank === undefined) {
    return 'Liquidity rank is required. Use a whole number: lower values mean higher liquidity (e.g. 1 = most liquid).';
  }
  const rank = typeof liquidityRank === 'number' ? liquidityRank : Number.parseInt(liquidityRank, 10);
  if (!Number.isInteger(rank) || rank < 1) {
    return 'Liquidity rank must be a whole number ≥ 1. Lower numbers indicate higher liquidity.';
  }
  return null;
}

function resolveLiquidityRankForSave(formData, isEditing) {
  if (!isEditing) {
    const rank = typeof formData.liquidityRank === 'number'
      ? formData.liquidityRank
      : Number.parseInt(formData.liquidityRank, 10);
    return { rank };
  }
  if (formData.liquidityRank === '' || formData.liquidityRank == null) {
    return { rank: null };
  }
  const rank = typeof formData.liquidityRank === 'number'
    ? formData.liquidityRank
    : Number.parseInt(formData.liquidityRank, 10);
  if (!Number.isInteger(rank) || rank < 1) {
    return {
      error: 'Liquidity rank must be a whole number ≥ 1. Lower numbers indicate higher liquidity.',
    };
  }
  return { rank };
}

function buildAccountPayload(formData, resolvedAccountNumber, actorUserId, isEditing, liquidityRankForSave) {
  return {
    accountName: formData.accountName,
    accountNumber: Number.parseInt(resolvedAccountNumber, 10),
    description: formData.description,
    comment: formData.comment,
    normalSide: formData.normalSide,
    type: formData.type,
    subType: formData.subType,
    initBalance: formData.initBalance,
    orderNumber: Number.parseInt(formData.orderNumber, 10) || 0,
    active: isEditing ? formData.active : true,
    statementType: formData.statementType,
    createdBy: isEditing ? formData.createdBy : actorUserId,
    createdAt: isEditing ? formData.createdAt : new Date().toISOString(),
    liquidityRank: liquidityRankForSave,
  };
}

async function notifyAdminsOfAccountChange(accountData, user, isEditing) {
  const { data: admins, error: adminError } = await fetchFromTable('user', {
    select: 'email, fName, lName',
    filters: { role: 'administrator' },
  });
  if (adminError || !admins) return;

  const subject = `Account ${isEditing ? 'Updated' : 'Added'}: ${accountData.accountName}`;
  const message = `The following account has been ${isEditing ? 'updated' : 'added'} by ${user.fName} ${user.lName}:

        Name: ${accountData.accountName}
        Number: ${accountData.accountNumber}
        Category: ${accountData.type}
        Subcategory: ${accountData.subType}
        Initial Balance: $${accountData.initBalance}
        Normal Side: ${accountData.normalSide}`;

  for (const admin of admins) {
    await sendAdminEmail(admin.email, `${admin.fName} ${admin.lName}`, subject, message);
  }
}

function AccountForm() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const isEditing = !!id;

  const [formData, setFormData] = useState({
    accountName: '',
    accountNumber: '',
    description: '',
    comment: '',
    normalSide: 'Debit',
    type: '',
    subType: '',
    initBalance: 0,
    orderNumber: 0,
    active: true,
    statementType: '',
    createdAt: '',
    createdBy: 0,
    liquidityRank: ''
  });

  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(isEditing);
  const [staffRecipients, setStaffRecipients] = useState([]);
  const [staffLoadError, setStaffLoadError] = useState(null);
  const [staffEmailModalOpen, setStaffEmailModalOpen] = useState(false);
  const [selectedStaffId, setSelectedStaffId] = useState('');
  const [staffEmailSubject, setStaffEmailSubject] = useState('');
  const [staffEmailMessage, setStaffEmailMessage] = useState('');
  const [staffEmailSending, setStaffEmailSending] = useState(false);

  useEffect(() => {
    if (user && user.role !== 'administrator') {
      alert('Unauthorized: Access to this page is restricted to administrators.');
      navigate('/admin/chart-of-accounts');
      return;
    }
    if (isEditing) loadAccount();
  }, [id, user, navigate]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setStaffLoadError(null);
        const list = await getEmailRecipientsByRoles(['manager', 'administrator']);
        const currentUserId = user?.userID == null ? null : String(user.userID);
        const filtered = (list || []).filter((u) => {
          if (currentUserId === null) return true;
          return String(u.userID) !== currentUserId;
        });
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
    globalThis.addEventListener('keydown', onKey);
    return () => globalThis.removeEventListener('keydown', onKey);
  }, [staffEmailModalOpen, staffEmailSending]);

  useEffect(() => {
    if (isEditing && formData.type && !formData.statementType) {
      const auto = statementTypeMap[formData.type] || '';
      if (auto) setFormData(prev => ({ ...prev, statementType: auto }));
    }
  }, [isEditing, formData.type, formData.statementType]);

  useEffect(() => {
    if (!isEditing && formData.type && formData.subType) {
      suggestAccountNumber(formData.type, formData.subType);
    }
  }, [formData.type, formData.subType]);

  const suggestAccountNumber = async (type, subType) => {
    const prefix = prefixes[type] || '';
    if (!prefix) return;

    const subcategories = subcategoriesMap[type] || [];
    const subIdx = subcategories.indexOf(subType);
    if (subIdx === -1) return;

    const { data, error } = await fetchFromTable('chartOfAccounts', { select: 'accountNumber' });

    let nextId = Math.max(subIdx * 25, 1);
    if (!error && data) {
      const identifiers = data
        .map(acc => acc.accountNumber?.toString())
        .filter(num => num && num.startsWith(prefix) && num.length === 8)
        .map(num => Number.parseInt(num.substring(1), 10))
        .filter(n => n >= subIdx * 25 && n < (subIdx * 25) + 25);

      if (identifiers.length > 0) nextId = Math.max(...identifiers) + 1;
    }

    if (nextId >= (subIdx * 25) + 25) {
      alert('Maximum number of accounts for this subType reached (24 or 25).');
      return;
    }

    const identifierStr = nextId.toString().padStart(7, '0');
    setFormData(prev => ({ ...prev, accountNumber: `${prefix}${identifierStr}` }));
  };

  const loadAccount = async () => {
    const { data, error } = await fetchFromTable('chartOfAccounts', {
      filters: { accountID: id },
      single: true
    });
    if (!error && data) {
      setFormData(data);
    } else {
      console.error('Error fetching account:', error);
      navigate('/admin/chart-of-accounts');
    }
    setFetching(false);
  };

  const handleChange = (e) => {
    const { name, value, type } = e.target;

    setFormData((prev) => {
      const updatedValue = parseFieldValue(name, value, type);
      const updated = { ...prev, [name]: updatedValue };
      return name === 'type' ? applyTypeFieldUpdates(updated, value) : updated;
    });
  };

  const findAvailableAccountNumber = async (startingNumber, existingNumbers) => {
    let candidate = startingNumber;
    const prefix = startingNumber.toString()[0];
    while (existingNumbers.has(candidate.toString())) {
      candidate += 1;
      if (candidate.toString().length > 8) return null;
      if (candidate.toString()[0] !== prefix) return null;
    }
    return candidate.toString();
  };

  const resolveAccountNumberIfNeeded = async (initialNumber) => {
    const { data: allAccounts, error: fetchError } = await fetchFromTable('chartOfAccounts', {
      select: 'accountNumber',
    });
    if (fetchError) {
      return { error: 'Error checking existing account numbers. Please try again.' };
    }

    const existingNumbers = new Set((allAccounts || []).map((acc) => acc.accountNumber?.toString()));
    if (!existingNumbers.has(initialNumber)) {
      return { number: initialNumber };
    }

    const next = await findAvailableAccountNumber(Number.parseInt(initialNumber, 10) + 1, existingNumbers);
    if (!next) {
      return {
        error: 'No available account numbers in this range. Please choose a different subcategory or adjust the number manually.',
      };
    }

    setFormData((prev) => ({ ...prev, accountNumber: next }));
    alert(`Account number ${initialNumber} was already taken. Assigned ${next} instead.`);
    return { number: next };
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (user?.role !== 'administrator') {
      alert('Unauthorized: Only administrators are authorized to add or edit accounts.');
      return;
    }

    const expectedPrefix = prefixes[formData.type];
    if (expectedPrefix && !formData.accountNumber.toString().startsWith(expectedPrefix)) {
      alert(`Invalid Account Number. Accounts in ${formData.type} must start with ${expectedPrefix}.`);
      return;
    }

    if (!/^\d{8}$/.test(formData.accountNumber.toString())) {
      alert('Account Number must be exactly 8 digits. No letters, decimals, or special characters allowed.');
      return;
    }

    const { data: numberDuplicates } = await supabase
      .from('chartOfAccounts')
      .select('accountID')
      .eq('accountNumber', Number.parseInt(formData.accountNumber, 10));

    const numberConflict = (numberDuplicates || []).filter((acc) =>
      isDuplicateForOtherAccount(acc, isEditing, id)
    );
    if (numberConflict.length > 0) {
      alert('An account with this account number already exists. Duplicate account numbers are not allowed.');
      return;
    }

    const { data: nameDuplicates } = await supabase
      .from('chartOfAccounts')
      .select('accountID')
      .eq('accountName', formData.accountName.trim());

    const nameConflict = (nameDuplicates || []).filter((acc) =>
      isDuplicateForOtherAccount(acc, isEditing, id)
    );
    if (nameConflict.length > 0) {
      alert('An account with this name already exists. Duplicate account names are not allowed');
      return;
    }

    setLoading(true);
    const actorUserId = Number.parseInt(user?.userID, 10);
    if (!Number.isFinite(actorUserId) || actorUserId <= 0) {
      alert('Unable to determine current administrator user ID.');
      setLoading(false);
      return;
    }

    const validSubcategories = subcategoriesMap[formData.type] || [];
    if (!validSubcategories.includes(formData.subType)) {
      alert(`Invalid subcategory "${formData.subType}" for category "${formData.type}". Please select a valid subcategory.`);
      setLoading(false);
      return;
    }

    if (!isEditing) {
      const liquidityError = validateNewLiquidityRank(formData.liquidityRank);
      if (liquidityError) {
        alert(liquidityError);
        setLoading(false);
        return;
      }
    }

    let resolvedAccountNumber = formData.accountNumber.toString();
    if (!isEditing) {
      const resolved = await resolveAccountNumberIfNeeded(resolvedAccountNumber);
      if (resolved.error) {
        alert(resolved.error);
        setLoading(false);
        return;
      }
      resolvedAccountNumber = resolved.number;
    }

    const liquidityResult = resolveLiquidityRankForSave(formData, isEditing);
    if (liquidityResult.error) {
      alert(liquidityResult.error);
      setLoading(false);
      return;
    }

    const accountData = buildAccountPayload(
      formData,
      resolvedAccountNumber,
      actorUserId,
      isEditing,
      liquidityResult.rank
    );

    console.log('Submitting account data to Supabase:', accountData);

    try {
      if (isEditing) {
        await updateChartAccountWithActor(Number.parseInt(id, 10), accountData, actorUserId);
      } else {
        await createChartAccountWithActor(accountData, actorUserId);
      }

      alert(`Account ${isEditing ? 'updated' : 'added'} successfully!`);
      try {
        await notifyAdminsOfAccountChange(accountData, user, isEditing);
      } catch (emailErr) {
        console.warn('Failed to send admin notification emails:', emailErr);
      }
      navigate('/admin/chart-of-accounts');
    } catch (error) {
      console.error('Supabase submission error:', error);
      alert(`Error: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleSendStaffEmail = async (e) => {
    e.preventDefault();
    if (!selectedStaffId) {
      alert('Select a manager or administrator to email.');
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

    const accountLabel = formData?.accountNumber ? `Account ${formData.accountNumber}` : 'Account';
    const composedSubject = subject || `${accountLabel}: update`;
    const composedMessage = [
      message,
      '',
      '---',
      'Chart of Accounts / Account page context',
      `From admin userID: ${user?.userID ?? 'N/A'}`,
      `Account ID: ${isEditing ? id : '(new)'}`,
      `Account Number: ${formData.accountNumber || 'N/A'}`,
      `Account Name: ${formData.accountName || 'N/A'}`,
    ].join('\n');

    setStaffEmailSending(true);
    try {
      await sendAdminEmail(recipient.email.trim(), displayName, composedSubject, composedMessage);
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

  if (fetching) return <p>Loading account details...</p>;

  return (
    <div className="container">
      <h1>{isEditing ? 'Edit Account' : 'Add New Account'}</h1>

      <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '12px' }}>
        <HelpTooltip text="Open a popup to email a manager or administrator about this account.">
          <button type="button" className="button-primary" onClick={() => setStaffEmailModalOpen(true)}>
            Email Manager / Admin
          </button>
        </HelpTooltip>
      </div>

      {staffEmailModalOpen && (
        <div
          className="account-email-modal-backdrop"
          onClick={() => !staffEmailSending && setStaffEmailModalOpen(false)}
          role="presentation"
        >
          <div
            className="account-email-modal"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="account-email-modal-title"
          >
            <div className="account-email-modal-header">
              <h2 id="account-email-modal-title" className="account-email-modal-title">
                Email Manager or Administrator
              </h2>
              <button
                type="button"
                className="button-primary account-email-modal-close"
                aria-label="Close"
                disabled={staffEmailSending}
                onClick={() => setStaffEmailModalOpen(false)}
              >
                X
              </button>
            </div>

            {staffLoadError && (
              <p style={{ color: '#b91c1c', fontSize: '0.9rem' }} role="alert">
                Could not load recipients: {staffLoadError}
              </p>
            )}

            {!staffLoadError && staffRecipients.length === 0 && (
              <p style={{ color: '#6b7280', fontSize: '0.9rem' }}>
                No active managers or administrators with an email address were found.
              </p>
            )}

            <form onSubmit={handleSendStaffEmail} className="account-email-form">
              <div className="account-email-row">
                <label htmlFor="account-email-recipient" className="account-email-label">
                  Recipient
                </label>
                <select
                  id="account-email-recipient"
                  className="input account-email-select"
                  value={selectedStaffId}
                  onChange={(e) => setSelectedStaffId(e.target.value)}
                  disabled={staffRecipients.length === 0}
                >
                  <option value="">— Select manager or administrator —</option>
                  {staffRecipients.map((u) => (
                    <option key={u.userID} value={u.userID}>
                      {[u.fName, u.lName].filter(Boolean).join(' ') || u.username} ({u.role}) — {u.email}
                    </option>
                  ))}
                </select>
              </div>

              <div className="account-email-row">
                <label htmlFor="account-email-subject" className="account-email-label">
                  Subject
                </label>
                <div className="clear-input-container" role="group">
                  <input
                    id="account-email-subject"
                    type="text"
                    className="input"
                    value={staffEmailSubject}
                    onChange={(e) => setStaffEmailSubject(e.target.value)}
                    placeholder="Subject…"
                    autoComplete="off"
                  />
                  <button className="button-clear" type="button" onClick={() => setStaffEmailSubject('')} aria-label="Clear subject">
                    X
                  </button>
                </div>
              </div>

              <div className="account-email-row account-email-row-grow">
                <label htmlFor="account-email-message" className="account-email-label">
                  Message
                </label>
                <textarea
                  id="account-email-message"
                  className="input account-email-textarea"
                  rows={4}
                  value={staffEmailMessage}
                  onChange={(e) => setStaffEmailMessage(e.target.value)}
                  placeholder="Your message…"
                />
              </div>

              <div className="account-email-actions">
                <HelpTooltip text="Send this message using the configured EmailJS admin template.">
                  <button type="submit" className="button-secondary" disabled={staffEmailSending || staffRecipients.length === 0}>
                    {staffEmailSending ? 'Sending…' : 'Send Email'}
                  </button>
                </HelpTooltip>
              </div>
            </form>
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit} className="form-grid">
        <div>
          <label>Account Name:</label>
          <div className="clear-input-container" role="group">
          <input
            type="text"
            name="accountName"
            value={formData.accountName}
            onChange={handleChange}
            required
            className="input"
          />
          <button type="button" className="button-clear" onClick={() => setFormData(prev => ({ ...prev, accountName: '' }))} aria-label="Clear account name input">X</button>
          </div>
        </div>
        <div>
          <label>Account Number:</label>
          <input
            type="text"
            name="accountNumber"
            value={formData.accountNumber}
            onChange={handleChange}
            required
            className="input"
            placeholder="Auto-generated"
          />
        </div>
        <div className="span-1">
          <label>Description:</label>
          <div className="clear-input-container" role="group">
          <textarea
            name="description"
            value={formData.description}
            onChange={handleChange}
            className="input"
          />
          <button type="button" className="button-clear" onClick={() => setFormData(prev => ({ ...prev, description: '' }))} aria-label="Clear description input">X</button>
          </div>
        </div>
        <div>
          <label>Normal Side:</label>
          <select name="normalSide" value={formData.normalSide} onChange={handleChange} className="input">
            <option value="Debit">Debit</option>
            <option value="Credit">Credit</option>
          </select>
        </div>
        <div>
          <label>Category:</label>
          <select name="type" value={formData.type} onChange={handleChange} required className="input">
            <option value="">Select a Category</option>
            <option value="Assets">Assets</option>
            <option value="Liabilities">Liabilities</option>
            <option value="Equity">Equity</option>
            <option value="Revenue">Revenue</option>
            <option value="Expenses">Expenses</option>
          </select>
        </div>
        <div>
          <label>Subcategory:</label>
          <select
            name="subType"
            value={formData.subType}
            onChange={handleChange}
            className="input"
            disabled={!formData.type}
          >
            <option value="">Select a Subcategory</option>
            {formData.type && subcategoriesMap[formData.type]?.map(sub => (
              <option key={sub} value={sub}>{sub}</option>
            ))}
          </select>
        </div>
        <div>
          <label>Order Number:</label>
          <input
            type="number"
            name="orderNumber"
            value={formData.orderNumber}
            onChange={handleChange}
            className="input"
          />
        </div>
        <div>
          <label htmlFor="liquidityRank" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
            Liquidity rank{isEditing ? ' (optional)' : ''}
            <HelpTooltip text="Whole number ≥ 1. Lower values mean higher liquidity (for example, 1 is more liquid than 10). Required when adding a new account.">
              <button type="button" className="button-clear" aria-label="About liquidity rank">
                ?
              </button>
            </HelpTooltip>
          </label>
          <input
            id="liquidityRank"
            type="number"
            name="liquidityRank"
            min={1}
            step={1}
            inputMode="numeric"
            value={formData.liquidityRank === '' || formData.liquidityRank == null ? '' : formData.liquidityRank}
            onChange={handleChange}
            className="input"
            required={!isEditing}
            placeholder={isEditing ? 'Leave blank to keep current' : 'e.g. 10'}
          />
        </div>
        <div>
          <label>Initial Balance:</label>
          <div className="clear-input-container" role="group">
          <input
            type="text"
            name="initBalance"
            value={formatCurrencyValue(formData.initBalance)}
            onChange={handleChange}
            className="input"
          />
          <button type="button" className="button-clear" onClick={() => setFormData(prev => ({ ...prev, initBalance: 0 }))} aria-label="Clear initial balance input">X</button>
          </div>
        </div>
        <div className="span-1">
          <label>Comment:</label>
          <div className="clear-input-container" role="group">
            <textarea
              name="comment"
              value={formData.comment ?? ''}
              onChange={handleChange}
              className="input"
            />
            <button
              type="button"
              className="button-clear"
              onClick={() => setFormData(prev => ({ ...prev, comment: '' }))}
              aria-label="Clear comment input"
            >
              X
            </button>
          </div>
        </div>
        <div className="span-2">
          <HelpTooltip
            text={
              isEditing
                ? 'Save changes to this account in the chart of accounts.'
                : 'Add this new account to the chart of accounts.'
            }
          >
            <button type="submit" className="button-secondary" disabled={loading}>
              {loading ? 'Saving...' : 'Save Account'}
            </button>
          </HelpTooltip>
          <HelpTooltip text="Discard unsaved changes and return to the chart of accounts list.">
            <button type="button" onClick={() => navigate('/admin/chart-of-accounts')} className="button-primary" style={{ marginLeft: '10px' }}>
              Cancel
            </button>
          </HelpTooltip>
        </div>
      </form>
    </div>
  );
}

export default AccountForm;