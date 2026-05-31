import React, { useEffect, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import { getEmailRecipientsByRoles } from '../services/adminService';
import { sendAdminEmail } from '../services/emailService';
import { HelpTooltip } from './HelpTooltip';
import './StaffEmailModal.css';

function StaffEmailModal({ isOpen, onClose, defaultSubject = '' }) {
  const dialogRef = useRef(null);
  const [recipients, setRecipients] = useState([]);
  const [loadError, setLoadError] = useState(null);
  const [selectedId, setSelectedId] = useState('');
  const [subject, setSubject] = useState(defaultSubject);
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    (async () => {
      try {
        setLoadError(null);
        const list = await getEmailRecipientsByRoles(['administrator', 'manager']);
        if (!cancelled) setRecipients(list || []);
      } catch (e) {
        if (!cancelled) setLoadError(e?.message ?? String(e));
      }
    })();
    return () => { cancelled = true; };
  }, [isOpen]);

  useEffect(() => {
    if (isOpen) {
      setSelectedId('');
      setSubject(defaultSubject);
      setMessage('');
      setSending(false);
    }
  }, [isOpen, defaultSubject]);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e) => {
      if (e.key === 'Escape' && !sending) onClose();
    };
    globalThis.addEventListener('keydown', onKey);
    return () => globalThis.removeEventListener('keydown', onKey);
  }, [isOpen, sending, onClose]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return undefined;
    if (isOpen) {
      dialog.showModal();
    } else {
      dialog.close();
    }
    return undefined;
  }, [isOpen]);

  const handleBackdropClick = (e) => {
    if (e.target === dialogRef.current && !sending) {
      onClose();
    }
  };

  const handleSend = async (e) => {
    e.preventDefault();
    if (!selectedId) { alert('Select a recipient.'); return; }
    const trimSubject = subject.trim();
    const trimMessage = message.trim();
    if (!trimSubject || !trimMessage) { alert('Subject and message are required.'); return; }
    const recipient = recipients.find((u) => String(u.userID) === String(selectedId));
    if (!recipient?.email) { alert('Selected user has no email on file.'); return; }
    const displayName =
      [recipient.fName, recipient.lName].filter(Boolean).join(' ') || recipient.username || 'User';
    setSending(true);
    try {
      await sendAdminEmail(recipient.email.trim(), displayName, trimSubject, trimMessage);
      alert(`Email sent to ${displayName} (${recipient.role}).`);
      onClose();
    } catch (err) {
      console.error(err);
      alert(err?.message ?? 'Failed to send email.');
    } finally {
      setSending(false);
    }
  };

  if (!isOpen) return null;

  return (
    <dialog
      ref={dialogRef}
      className="sem-backdrop"
      onClick={handleBackdropClick}
      onClose={() => !sending && onClose()}
    >
      <div
        className="sem-modal"
        onClick={(e) => e.stopPropagation()}
        aria-labelledby="sem-title"
      >
        <div className="sem-header">
          <h2 id="sem-title" className="sem-title">Email Administrator / Manager</h2>
          <button
            type="button"
            className="button-primary sem-close"
            aria-label="Close"
            disabled={sending}
            onClick={onClose}
          >
            X
          </button>
        </div>

        {loadError && (
          <p style={{ color: 'var(--bff-red)', fontSize: '0.9rem', marginBottom: 10 }} role="alert">
            Could not load recipients: {loadError}
          </p>
        )}
        {!loadError && recipients.length === 0 && (
          <p style={{ fontSize: '0.9rem', marginBottom: 10 }}>
            No active administrators or managers with an email address were found.
          </p>
        )}

        <form onSubmit={handleSend} className="sem-form">
          <div className="sem-row">
            <label htmlFor="sem-recipient" className="sem-label">Recipient</label>
            <select
              id="sem-recipient"
              className="input sem-row-select"
              value={selectedId}
              onChange={(e) => setSelectedId(e.target.value)}
              disabled={recipients.length === 0}
            >
              <option value="">— Select administrator / manager —</option>
              {recipients.map((u) => (
                <option key={u.userID} value={u.userID}>
                  {[u.fName, u.lName].filter(Boolean).join(' ') || u.username} ({u.role}) — {u.email}
                </option>
              ))}
            </select>
          </div>

          <fieldset className="sem-row">
            <legend className="sem-label">Subject</legend>
            <div className="clear-input-container">
              <input
                id="sem-subject"
                type="text"
                className="input"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="e.g. Question about this entry"
                autoComplete="off"
              />
              <button type="button" className="button-clear" onClick={() => setSubject('')} aria-label="Clear subject">X</button>
            </div>
          </fieldset>

          <div className="sem-row sem-row-grow">
            <label htmlFor="sem-message" className="sem-label">Message</label>
            <textarea
              id="sem-message"
              className="input sem-textarea"
              rows={4}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Your message…"
            />
          </div>

          <div className="sem-actions">
            <HelpTooltip text="Send this message to the selected administrator or manager.">
              <button
                type="submit"
                className="button-secondary"
                disabled={sending || recipients.length === 0}
              >
                {sending ? 'Sending…' : 'Send Email'}
              </button>
            </HelpTooltip>
          </div>
        </form>
      </div>
    </dialog>
  );
}

StaffEmailModal.propTypes = {
  isOpen: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  defaultSubject: PropTypes.string,
};

export default StaffEmailModal;
