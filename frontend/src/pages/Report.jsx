import React, { useState, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { HelpTooltip } from '../components/HelpTooltip';
import {
  REPORT_TYPES,
  generateReportHtml,
  downloadPdfReport,
  getReportPdfBase64,
  reportFilenameBase,
} from '../services/Report';
import { sendReportEmail } from '../services/emailService';
import { getAllUsers } from '../services/adminService';
import '../global.css';
import './ReportTables.css';

function formatUserDropdownLabel(user) {
  const name = [user?.fName, user?.lName].filter(Boolean).join(' ').trim();
  const display = name || user?.username || user?.email || 'User';
  const email = String(user?.email || '').trim();
  return `${display} - ${email}`;
}

function Report() {
  const navigate = useNavigate();
  const [generatedAt, setGeneratedAt] = useState('');
  const [reportTitle, setReportTitle] = useState('');
  const [reportHtml, setReportHtml] = useState('');
  const [activeType, setActiveType] = useState(null);
  const [generating, setGenerating] = useState(false);
  const [periodStartDate, setPeriodStartDate] = useState('');
  const [periodEndDate, setPeriodEndDate] = useState('');
  const [asOfDate, setAsOfDate] = useState('');
  const [emailUsers, setEmailUsers] = useState([]);
  const [selectedUserId, setSelectedUserId] = useState('');
  const [usersLoading, setUsersLoading] = useState(true);
  const [usersError, setUsersError] = useState('');
  const [sendingEmail, setSendingEmail] = useState(false);
  const [emailStatus, setEmailStatus] = useState('');
  const [downloadingPdf, setDownloadingPdf] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setUsersLoading(true);
      setUsersError('');
      try {
        const raw = await getAllUsers();
        if (cancelled) return;
        const withEmail = (raw || []).filter((u) => u?.email && String(u.email).trim());
        withEmail.sort((a, b) => {
          const ln = String(a.lName || '').localeCompare(String(b.lName || ''), undefined, {
            sensitivity: 'base',
          });
          if (ln !== 0) return ln;
          return String(a.fName || '').localeCompare(String(b.fName || ''), undefined, {
            sensitivity: 'base',
          });
        });
        setEmailUsers(withEmail);
      } catch (error) {
        console.error('Failed to load users for email:', error);
        if (!cancelled) setUsersError('Could not load users.');
      } finally {
        if (!cancelled) setUsersLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const generateReport = useCallback(async (typeKey) => {
    setGenerating(true);
    try {
      const isDurationReport =
        typeKey === REPORT_TYPES.INCOME_STATEMENT || typeKey === REPORT_TYPES.RETAINED_EARNINGS;
      const options = isDurationReport
        ? { startDate: periodStartDate, endDate: periodEndDate }
        : { asOfDate: asOfDate || periodEndDate };
      const { title, html } = await generateReportHtml(typeKey, options);
      setReportTitle(title);
      setReportHtml(html);
      setActiveType(typeKey);
      setGeneratedAt(new Date().toLocaleString());
    } catch (error) {
      console.error('Failed to generate report:', error);
      setReportTitle('Report');
      setReportHtml('<p>Unable to generate this report right now.</p>');
      setActiveType(typeKey);
      setGeneratedAt(new Date().toLocaleString());
    } finally {
      setGenerating(false);
    }
  }, [asOfDate, periodEndDate, periodStartDate]);

  const navigateToLedgerAccount = useCallback(
    (rawNumber) => {
      const n = rawNumber != null ? String(rawNumber).trim() : '';
      if (!n) return;
      navigate(`/admin/ledger/${encodeURIComponent(n)}`);
    },
    [navigate],
  );

  const handleReportPreviewClick = useCallback(
    (e) => {
      const el = e.target.closest('[data-ledger-account]');
      if (!el) return;
      const num = el.dataset.ledgerAccount;
      e.preventDefault();
      navigateToLedgerAccount(num);
    },
    [navigateToLedgerAccount],
  );

  const handleReportPreviewKeyDown = useCallback(
    (e) => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      const el = e.target.closest('[data-ledger-account]');
      if (!el || e.target !== el) return;
      e.preventDefault();
      navigateToLedgerAccount(el.dataset.ledgerAccount);
    },
    [navigateToLedgerAccount],
  );

  const handleDownload = useCallback(async () => {
    if (!reportHtml.trim()) return;
    setDownloadingPdf(true);
    try {
      await downloadPdfReport({
        title: reportTitle || 'Report',
        htmlFragment: reportHtml,
        filenameBase: reportFilenameBase(activeType),
      });
    } catch (error) {
      console.error('Failed to save PDF:', error);
    } finally {
      setDownloadingPdf(false);
    }
  }, [reportHtml, reportTitle, activeType]);

  const handleSendEmail = useCallback(async () => {
    if (!reportHtml.trim()) return;

    const selected = emailUsers.find((u) => String(u.userID) === String(selectedUserId));
    const trimmedEmail = selected?.email != null ? String(selected.email).trim() : '';
    if (!trimmedEmail) {
      setEmailStatus('Please select a user to email.');
      return;
    }

    setSendingEmail(true);
    setEmailStatus('');
    try {
      const pdfFilename = `${reportFilenameBase(activeType)}.pdf`;
      const pdfBase64 = await getReportPdfBase64({
        title: reportTitle || 'Report',
        htmlFragment: reportHtml,
      });
      const result = await sendReportEmail({
        recipientEmail: trimmedEmail,
        subject: `${reportTitle || 'Report'} - Report PDF`,
        filename: pdfFilename,
        contentType: 'application/pdf',
        attachmentBase64: pdfBase64,
      });
      if (result?.attachmentIncluded) {
        setEmailStatus(`Report emailed successfully to ${trimmedEmail} with PDF attachment.`);
      } else {
        setEmailStatus(`Report emailed to ${trimmedEmail}, but the PDF may not have attached.`);
      }
    } catch (error) {
      console.error('Failed to send report email:', error);
      setEmailStatus('Unable to send report email right now. Please try again.');
    } finally {
      setSendingEmail(false);
    }
  }, [activeType, emailUsers, reportHtml, reportTitle, selectedUserId]);

  const hasReport = Boolean(reportHtml.trim());
  const reportContentMaxWidth = '840px';

  return (
    <div className="container">
      <div className="header-row" style={{ alignItems: 'center' }}>
        <h1>Reports</h1>
      </div>

      <div>
        
        <div className="input-group" style={{ maxWidth: reportContentMaxWidth, margin: '0 auto' }}>
          <div style={{ display: 'flex', justifyContent: 'center', gap: '30px', flexWrap: 'wrap', marginBottom: '12px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', width: '15vw' }}>
              <label style={{ marginBottom: '6px' }}>Period Start Date:</label>
              <input
                type="date"
                className="input"
                value={periodStartDate}
                onChange={(event) => setPeriodStartDate(event.target.value)}
                title="Start date (duration reports)"
              />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', width: '15vw' }}>
              <label style={{ marginBottom: '6px' }}>Period End Date:</label>
              <input
                type="date"
                className="input"
                value={periodEndDate}
                onChange={(event) => setPeriodEndDate(event.target.value)}
                title="End date (duration reports)"
              />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', width: '15vw' }}>
              <label style={{ marginBottom: '6px' }}>As of Date:</label>
              <input
                type="date"
                className="input"
                value={asOfDate}
                onChange={(event) => setAsOfDate(event.target.value)}
                title="As of date (point-in-time reports)"
              />
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'center', maxWidth: reportContentMaxWidth, margin: '0 auto' }}>
          <HelpTooltip text="Generate a Trial Balance report from current data.">
            <button
              type="button"
              className="button-primary"
              onClick={() => generateReport(REPORT_TYPES.TRIAL_BALANCE)}
              disabled={generating}
            >
              Trial Balance
            </button>
          </HelpTooltip>
          <HelpTooltip text="Generate an Income Statement report from current data.">
            <button
              type="button"
              className="button-primary"
              onClick={() => generateReport(REPORT_TYPES.INCOME_STATEMENT)}
              disabled={generating}
            >
              Income Statement
            </button>
          </HelpTooltip>
          <HelpTooltip text="Generate a Balance Sheet report from current data.">
            <button
              type="button"
              className="button-primary"
              onClick={() => generateReport(REPORT_TYPES.BALANCE_SHEET)}
              disabled={generating}
            >
              Balance Sheet
            </button>
          </HelpTooltip>
          <HelpTooltip text="Generate a Retained Earnings Statement report from current data.">
            <button
              type="button"
              className="button-primary"
              onClick={() => generateReport(REPORT_TYPES.RETAINED_EARNINGS)}
              disabled={generating}
            >
              Retained Earnings
            </button>
          </HelpTooltip>
        </div>
        <div className="report-output"
          style={{
            margin: '18px auto 0',
            border: '2px dashed var(--bff-primary)',
            borderRadius: '8px',
            padding: '0 14px 14px',
            background: 'var(--bff-light-text)',
            width: '100%',
            maxWidth: reportContentMaxWidth,
          }}
        >
          {generating ? (
            <p style={{ margin: '8px 0 0', color: 'var(--bff-dark-text)' }}>
              Generating report content...
            </p>
          ) : !hasReport ? (
            <p style={{ margin: '8px 0 0', color: 'var(--bff-dark-text)' }}>
              Generated report content will display here.
            </p>
          ) : null}
          {hasReport && !generating ? (
            <div
              className="report-html-output"
              style={{ marginTop: '12px' }}
              onClick={handleReportPreviewClick}
              onKeyDown={handleReportPreviewKeyDown}
              role="presentation"
              dangerouslySetInnerHTML={{ __html: reportHtml }}
            />
          ) : null}
        </div>
      </div>
      
      <div
        style={{
          margin: '14px auto 0',
          display: 'flex',
          gap: '10px',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'center',
          maxWidth: reportContentMaxWidth,
        }}
        role="group"
      >
        <span style={{ alignSelf: 'center', color: 'var(--bff-dark-text)' }}>Send to:</span>
        <select
          id="report-email-recipient"
          className="input"
          aria-label="Send report to user"
          value={selectedUserId}
          onChange={(event) => setSelectedUserId(event.target.value)}
          style={{ minWidth: 'min(420px, 92vw)', maxWidth: '560px' }}
          disabled={generating || sendingEmail || usersLoading || Boolean(usersError)}
        >
          <option value="">
            {usersLoading ? 'Loading users…' : usersError ? 'Users unavailable' : 'Select a user…'}
          </option>
          {emailUsers.map((u) => (
            <option key={u.userID} value={String(u.userID)}>
              {formatUserDropdownLabel(u)}
            </option>
          ))}
        </select>
        <HelpTooltip text="Sends the same PDF as Save as PDF to the selected user’s email.">
          <button
            type="button"
            className="button-secondary"
            onClick={handleSendEmail}
            disabled={!hasReport || generating || sendingEmail || usersLoading || Boolean(usersError)}
          >
            {sendingEmail ? 'Sending Email...' : 'Email Report'}
          </button>
        </HelpTooltip>
      </div>
      {usersError ? (
        <p style={{ margin: '8px auto 0', color: 'var(--bff-red)', maxWidth: reportContentMaxWidth, textAlign: 'center', fontSize: '0.95rem' }}>
          {usersError}
        </p>
      ) : null}
      {emailStatus ? (
        <p style={{ margin: '8px auto 0', color: 'var(--bff-dark-text)', maxWidth: reportContentMaxWidth, textAlign: 'center' }}>{emailStatus}</p>
      ) : null}

      <div style={{ maxWidth: reportContentMaxWidth, margin: '1vh auto 10vh', display: 'flex', justifyContent: 'center' }}>
        <HelpTooltip text="Downloads the report as a PDF file to your computer.">
          <button
            type="button"
            className="button-secondary"
            onClick={handleDownload}
            disabled={!hasReport || generating || downloadingPdf}
          >
            {downloadingPdf ? 'Saving PDF…' : 'Save as PDF'}
          </button>
        </HelpTooltip>
      </div>
      
    </div>
  );
}

export default Report;