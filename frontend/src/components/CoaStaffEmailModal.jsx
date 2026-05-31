import React from 'react';
import { HelpTooltip } from './HelpTooltip';

export function CoaStaffEmailModal({
  open,
  sending,
  loadError,
  recipients,
  selectedStaffId,
  onSelectedStaffIdChange,
  subject,
  onSubjectChange,
  message,
  onMessageChange,
  onClose,
  onSubmit,
}) {
  if (!open) return null;

  return (
    <div
      className="coa-email-modal-backdrop"
      onClick={() => !sending && onClose()}
      role="presentation"
    >
      <div
        className="coa-email-modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="coa-email-modal-title"
      >
        <div className="coa-email-modal-header">
          <h2 id="coa-email-modal-title" className="coa-email-modal-title">
            Email Manager / Accountant
          </h2>
          <button
            type="button"
            className="button-primary coa-email-modal-close"
            aria-label="Close"
            disabled={sending}
            onClick={onClose}
          >
            X
          </button>
        </div>
        {loadError && (
          <p style={{ color: 'var(--bff-red)', fontSize: '0.9rem' }} role="alert">
            Could not load recipients: {loadError}
          </p>
        )}
        {!loadError && recipients.length === 0 && (
          <p style={{ color: 'var(--bff-dark-text)', fontSize: '0.9rem' }}>
            No active managers or accountants with an email address were found.
          </p>
        )}
        <form onSubmit={onSubmit} className="coa-email-staff-form">
          <div className="coa-email-staff-row">
            <label htmlFor="coa-staff-recipient" className="coa-email-staff-label">
              Recipient
            </label>
            <select
              id="coa-staff-recipient"
              className="input coa-email-staff-select"
              value={selectedStaffId}
              onChange={(e) => onSelectedStaffIdChange(e.target.value)}
              disabled={recipients.length === 0}
            >
              <option value="">— Select manager / accountant —</option>
              {recipients.map((u) => (
                <option key={u.userID} value={u.userID}>
                  {[u.fName, u.lName].filter(Boolean).join(' ') || u.username} ({u.role}) — {u.email}
                </option>
              ))}
            </select>
          </div>
          <div className="coa-email-staff-row">
            <label htmlFor="coa-staff-subject" className="coa-email-staff-label">
              Subject
            </label>
            <div className="clear-input-container" role="group">
              <input
                id="coa-staff-subject"
                type="text"
                className="input"
                value={subject}
                onChange={(e) => onSubjectChange(e.target.value)}
                placeholder="e.g., Question about account 10000001"
                autoComplete="off"
              />
              <button type="button" className="button-clear" onClick={() => onSubjectChange('')} aria-label="Clear subject input">X</button>
            </div>
          </div>
          <div className="coa-email-staff-row coa-email-staff-row-grow">
            <label htmlFor="coa-staff-message" className="coa-email-staff-label">
              Message
            </label>
            <textarea
              id="coa-staff-message"
              className="input coa-email-staff-textarea"
              rows={4}
              value={message}
              onChange={(e) => onMessageChange(e.target.value)}
              placeholder="Your message…"
            />
          </div>
          <div className="coa-email-staff-actions">
            <HelpTooltip text="Send this message to the selected user’s email using the configured EmailJS admin template.">
              <button type="submit" className="button-secondary" disabled={sending || recipients.length === 0}>
                {sending ? 'Sending…' : 'Send Email'}
              </button>
            </HelpTooltip>
          </div>
        </form>
      </div>
    </div>
  );
}
