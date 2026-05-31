import React, { useCallback, useEffect, useState, useRef } from 'react';
import './navbar.css';
import logo from '../assets/Images/resourceDirectory/logo.png';
import calendarIcon from '../assets/Images/resourceDirectory/CalendarIcon.png';
import calculatorIcon from '../assets/Images/resourceDirectory/Calculator.png';
import { useNavigate } from 'react-router-dom';
import { useAuth } from './AuthContext';
import { HelpTooltip } from './components/HelpTooltip';
import Calendar from './components/Calendar';

function Navbar() {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [calculatorOpen, setCalculatorOpen] = useState(false);
  const [calculatorDisplay, setCalculatorDisplay] = useState('0');
  const calendarAnchorRef = useRef(null);
  const calculatorAnchorRef = useRef(null);
  const calculatorPopupRef = useRef(null);

  const toggleMenu = () => setIsMenuOpen(!isMenuOpen);

  const formatCalculatorNumber = useCallback((value) => {
    const rounded = Math.round((Number(value) + Number.EPSILON) * 100) / 100;
    return String(rounded);
  }, []);

  useEffect(() => {
    const onDocMouseDown = (event) => {
      if (
        calculatorOpen &&
        calculatorPopupRef.current &&
        !calculatorPopupRef.current.contains(event.target) &&
        calculatorAnchorRef.current &&
        !calculatorAnchorRef.current.contains(event.target)
      ) {
        setCalculatorOpen(false);
      }
    };
    document.addEventListener('mousedown', onDocMouseDown);
    return () => document.removeEventListener('mousedown', onDocMouseDown);
  }, [calculatorOpen]);

  const appendCalculatorToken = useCallback((token) => {
    setCalculatorDisplay((prev) => {
      const current = prev === '0' ? '' : prev;
      const isNumericToken = /^[\d.]$/.test(token);
      if (isNumericToken) {
        const lastNumberMatch = /(?:^|[+\-*/(])(\d*\.?\d*)$/.exec(current);
        const activeNumber = lastNumberMatch ? lastNumberMatch[1] : '';
        if (token === '.' && activeNumber.includes('.')) return prev;
        if (activeNumber.includes('.')) {
          const decimalPart = activeNumber.split('.')[1] || '';
          if (/^\d$/.test(token) && decimalPart.length >= 2) return prev;
        }
      }
      const next = `${current}${token}`;
      return next || '0';
    });
  }, []);

  const clearCalculator = useCallback(() => setCalculatorDisplay('0'), []);

  const evaluateCalculator = useCallback(() => {
    try {
      const sanitized = calculatorDisplay.replace(/[^\d+\-*/.() ]/g, '');
      if (!sanitized.trim()) {
        setCalculatorDisplay('0');
        return;
      }
      const result = new Function(`"use strict"; return (${sanitized});`)();
      if (Number.isFinite(result)) {
        setCalculatorDisplay(formatCalculatorNumber(result));
      } else {
        setCalculatorDisplay('Error');
      }
    } catch {
      setCalculatorDisplay('Error');
    }
  }, [calculatorDisplay, formatCalculatorNumber]);

  useEffect(() => {
    if (!calculatorOpen) return undefined;

    const onCalculatorKeyDown = (event) => {
      const activeTag = document.activeElement?.tagName;
      const isTypingInField =
        activeTag === 'INPUT' ||
        activeTag === 'TEXTAREA' ||
        document.activeElement?.isContentEditable;
      if (isTypingInField) return;

      const { key } = event;
      if (/^\d$/.test(key)) {
        event.preventDefault();
        appendCalculatorToken(key);
        return;
      }
      if (['+', '-', '*', '/', '(', ')', '.'].includes(key)) {
        event.preventDefault();
        appendCalculatorToken(key);
        return;
      }
      if (key === 'Enter' || key === '=') {
        event.preventDefault();
        evaluateCalculator();
        return;
      }
      if (key === 'Backspace') {
        event.preventDefault();
        setCalculatorDisplay((prev) => {
          if (prev === 'Error') return '0';
          const next = prev.slice(0, -1);
          return next || '0';
        });
        return;
      }
      if (key === 'Delete' || key.toLowerCase() === 'c') {
        event.preventDefault();
        clearCalculator();
        return;
      }
      if (key === 'Escape') {
        event.preventDefault();
        setCalculatorOpen(false);
      }
    };

    globalThis.addEventListener('keydown', onCalculatorKeyDown);
    return () => globalThis.removeEventListener('keydown', onCalculatorKeyDown);
  }, [appendCalculatorToken, calculatorOpen, clearCalculator, evaluateCalculator]);

  const handleNavigation = (path) => {
    navigate(path);
    setIsMenuOpen(false);
  };

  const canAccessChartOfAccounts = ['administrator', 'manager', 'accountant'].includes(user?.role);
  const canAccessJournalEntries = user?.role === 'manager' || user?.role === 'accountant';
  const canViewPostedJournalReport =
    user?.role === 'manager' || user?.role === 'accountant';
  const canViewRatios =
    user?.role === 'manager' || user?.role === 'accountant' || user?.role === 'administrator';
  const isAdmin = user?.role === 'administrator';
  const isManager = user?.role === 'manager';

  const handleDashboardNavigation = () => {
    if (user?.role === 'administrator') { handleNavigation('/admin-dashboard'); return; }
    if (user?.role === 'manager') { handleNavigation('/manager-dashboard'); return; }
    if (user?.role === 'accountant') { handleNavigation('/accountant-dashboard'); return; }
    handleNavigation('/dashboard');
  };

  const handleLogout = async () => {
    await logout();
    navigate('/login');
    setIsMenuOpen(false);
  };

  return (
    <nav className="navbar">
      <div className="navbar-container">
        {/* Left Section */}
        <div className="navbar-left">
          <div
            className="navbar-logo"
            role="button"
            tabIndex={0}
            onClick={(e) => { e.preventDefault(); handleDashboardNavigation(); }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                handleDashboardNavigation();
              }
            }}
          >
            <img src={logo} alt="App Logo" className="navbar-logo-img" />
            <span className="navbar-brand">Dashboard</span>
          </div>

          <div className="calendar-wrapper">
            <button
              ref={calendarAnchorRef}
              type="button"
              className="nav-link calendar-toggle"
              onClick={() => setCalendarOpen(prev => !prev)}
              aria-label="Open calendar"
            >
              <img src={calendarIcon} alt="Calendar" className="calendar-icon" />
            </button>
            {calendarOpen && (
              <Calendar
                anchorRef={calendarAnchorRef}
                onClose={() => setCalendarOpen(false)}
              />
            )}
          </div>

          <div className="calculator-wrapper">
            <button
              ref={calculatorAnchorRef}
              type="button"
              className="calculator-toggle"
              onClick={() => setCalculatorOpen((prev) => !prev)}
              aria-label="Open calculator"
              title="Calculator"
            >
              <img src={calculatorIcon} alt="Calculator" className="calendar-icon calculator-icon" aria-hidden="true" />
            </button>
            {calculatorOpen && (
              <div ref={calculatorPopupRef} className="calculator-popover">
                <div className="calculator-display">{calculatorDisplay}</div>
                <div className="calculator-grid">
                  <button type="button" onClick={clearCalculator}>C</button>
                  <button type="button" onClick={() => appendCalculatorToken('(')}>(</button>
                  <button type="button" onClick={() => appendCalculatorToken(')')}>)</button>
                  <button type="button" onClick={() => appendCalculatorToken('/')}>/</button>
                  <button type="button" onClick={() => appendCalculatorToken('7')}>7</button>
                  <button type="button" onClick={() => appendCalculatorToken('8')}>8</button>
                  <button type="button" onClick={() => appendCalculatorToken('9')}>9</button>
                  <button type="button" onClick={() => appendCalculatorToken('*')}>*</button>
                  <button type="button" onClick={() => appendCalculatorToken('4')}>4</button>
                  <button type="button" onClick={() => appendCalculatorToken('5')}>5</button>
                  <button type="button" onClick={() => appendCalculatorToken('6')}>6</button>
                  <button type="button" onClick={() => appendCalculatorToken('-')}>-</button>
                  <button type="button" onClick={() => appendCalculatorToken('1')}>1</button>
                  <button type="button" onClick={() => appendCalculatorToken('2')}>2</button>
                  <button type="button" onClick={() => appendCalculatorToken('3')}>3</button>
                  <button type="button" onClick={() => appendCalculatorToken('+')}>+</button>
                  <button type="button" onClick={() => appendCalculatorToken('0')}>0</button>
                  <button type="button" onClick={() => appendCalculatorToken('.')}>.</button>
                  <button type="button" className="calculator-equals" onClick={evaluateCalculator}>=</button>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className={`navbar-center ${isMenuOpen ? 'active' : ''}`}>
          {isAdmin && (
            <>
              <a
                href="#/admin/user-account-request"
                className="nav-link center-link"
                onClick={() => handleNavigation('/admin/user-account-request')}
              >
                User Account Requests
              </a>
              <a
                href="#/admin/create-user"
                className="nav-link center-link"
                onClick={() => handleNavigation('/admin/create-user')}
              >
                Create User
              </a>
            </>
          )}
          {canAccessChartOfAccounts && (
            <a
              href="#/admin/chart-of-accounts"
              className="nav-link center-link"
              onClick={() => handleNavigation('/admin/chart-of-accounts')}
            >
              Chart of Accounts
            </a>
          )}
          {canAccessJournalEntries && (
            <a
              href="#/journal-entries"
              className="nav-link center-link"
              onClick={() => handleNavigation('/journal-entries')}
            >
              Journal Entries
            </a>
          )}
          {canViewPostedJournalReport && (
            <a
              href="#/posted-journal-entries"
              className="nav-link center-link"
              onClick={() => handleNavigation('/posted-journal-entries')}
            >
              Posted Journals
            </a>
          )}
          {isManager && (
              <a
                href="#/report"
                className="nav-link center-link"
                onClick={() => handleNavigation('/report')}
              >
                Reports
              </a>
          )}
          {canViewRatios && (
            <a
              href="#/ratios"
              className="nav-link center-link"
              onClick={() => handleNavigation('/ratios')}
            >
              Financial Ratios
            </a>
          )}
        </div>

        <div className="navbar-right">
          <a
            href="#/help"
            className="nav-link"
            onClick={(e) => { e.preventDefault(); handleNavigation('/help'); }}
          >
            Help
          </a>
          {user && (
            <div className="nav-user-section">
              <button
                type="button"
                className="nav-user-display nav-user-button"
                onClick={() => handleNavigation('/profile')}
                aria-label="Open profile"
              >
                <div className="nav-user-avatar">
                  {user.picture_path || user.picturePath ? (
                    <img
                      src={user.picture_path || user.picturePath}
                      alt={`${user.username}'s profile`}
                      className="nav-user-img"
                      onError={(e) => {
                        e.target.style.display = 'none';
                        e.target.nextSibling.style.display = 'flex';
                      }}
                    />
                  ) : null}
                  <div
                    className="nav-user-placeholder"
                    style={{ display: (user.picture_path || user.picturePath) ? 'none' : 'flex' }}
                  >
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path d="M12 12C14.7614 12 17 9.76142 17 7C17 4.23858 14.7614 2 12 2C9.23858 2 7 4.23858 7 7C7 9.76142 9.23858 12 12 12Z" fill="#9CA3AF"/>
                      <path d="M12 14C7.58172 14 4 16.6863 4 20V22H20V20C20 16.6863 16.4183 14 12 14Z" fill="#9CA3AF"/>
                    </svg>
                  </div>
                </div>
                <div className="nav-user-info">
                  <span className="nav-username">{user.username}</span>
                  <span className="nav-user-role">{user.role}</span>
                </div>
              </button>
            </div>
          )}
          <HelpTooltip text="Sign out of the application and end your session.">
            <button type="button" className="button-secondary" onClick={handleLogout}>Logout</button>
          </HelpTooltip>
        </div>

        <div
          className="hamburger"
          role="button"
          tabIndex={0}
          aria-label="Toggle navigation menu"
          onClick={toggleMenu}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              toggleMenu();
            }
          }}
        >
          <span className={isMenuOpen ? 'open' : ''}></span>
          <span className={isMenuOpen ? 'open' : ''}></span>
          <span className={isMenuOpen ? 'open' : ''}></span>
        </div>
      </div>
    </nav>
  );
}

export default Navbar;
