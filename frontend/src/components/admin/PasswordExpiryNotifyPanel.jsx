import React, { useEffect, useState } from 'react';
import { HelpTooltip } from '../HelpTooltip';
import { sendPasswordExpiryNotifications } from '../../services/passwordExpiryNotificationService';
import { useAuth } from '../../AuthContext';

export default function PasswordExpiryNotifyPanel() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const { user } = useAuth();

  const handleSend = async () => {
    setLoading(true);
    setResult(null);
    setError(null);
    try {
      const summary = await sendPasswordExpiryNotifications(3);
      setResult(summary);
    } catch (e) {
      setError(e?.message ?? String(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user?.role === 'administrator') {
      const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD (UTC)
      const lastRun = localStorage.getItem('passwordExpiryNotifyLastRunDate');
      if (lastRun !== today) {
        let cancelled = false;
        localStorage.setItem('passwordExpiryNotifyLastRunDate', today);

        (async () => {
          try {
            await handleSend();
          } catch (e) {
            if (cancelled) return;
            setError(e?.message ?? String(e));
          }
        })();

        return () => {
          cancelled = true;
        };
      }
    }
    return undefined;
  }, [user?.role]);

  return (
    <div className="password-expiry-notify-panel">
      <h2>Expired Password Emails</h2>
      <HelpTooltip text="Send reminder emails for users who need to change their password in 3 days or less.">
        <button type="button" className="button-primary" disabled={loading} onClick={handleSend}>
          {loading ? 'Sending…' : 'Send Reminder Emails'}
        </button>
      </HelpTooltip>
      {error && (
        <p className="error-messages" role="alert">
          {error}
        </p>
      )}
      {result && (
        <div style={{ marginTop: '0.75rem', fontSize: '0.9rem' }}>
          <p>
            Sent: <strong>{result.sent}</strong>, failed: <strong>{result.failed}</strong>
          </p>
          {result.errors?.length > 0 && (
            <ul style={{ marginTop: '0.5rem', paddingLeft: '1.25rem' }}>
              {result.errors.map((e) => (
                <li key={`${e.userID}-${e.error}`}>
                  User {e.userID}: {e.error}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
