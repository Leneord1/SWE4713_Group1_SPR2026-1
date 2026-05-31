import React, { useState } from 'react'
import '../global.css';
import './LoginPage.css';
import logo from '../../assets/Images/resourceDirectory/logo.png'
import { useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import { hashPassword } from '../utils/passwordHash';
import { useAuth } from '../AuthContext';
import PageHelpCorner from '../components/PageHelpCorner';
import { HelpTooltip } from '../components/HelpTooltip';
import {
  applyLoginSecurityUpdate as applyLoginSecurityUpdateHelper,
  handleFailedPassword,
  minuteLabel,
  navigateForRole,
  resolveActiveSuspension,
} from '../utils/loginHelpers';

function LoginPage() {
    const navigate = useNavigate();
    const { loginWithUserData } = useAuth();

    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');

    const handleClear = () => {
        setUsername('');
        setPassword('');
    };

    const navToWelcome = () => {
        navigate('/');
    }

    const navToForgotPassword = () => {
        navigate('/forgot-password');
    }
    const navToSignUp = () => {
        navigate('/signup');
    }

    const applyLoginSecurityUpdate = (userId, updates) =>
      applyLoginSecurityUpdateHelper(supabase, userId, updates);

    const handleLogin = async () => {
        try {
          const { data: userData, error: userError } = await supabase
          .from('user')
          .select('*')
          .eq('username', username)
          .single();

          if (userError || !userData) {
            alert('User not found');
            return;
          }

          const today = new Date();
          const suspension = await resolveActiveSuspension(userData, today, applyLoginSecurityUpdate);
          if (suspension.blocked) {
            alert(`Your account is currently suspended. Please try again in ${minuteLabel(suspension.minutesRemaining)}.`);
            return;
          }

          if (!password || password.trim() === '') {
            alert('Please enter a password.');
            return;
          }

          const enteredHash = await hashPassword(password);
          if (enteredHash == null) {
            alert('Please enter a password.');
            return;
          }

          if (enteredHash !== userData.password_hash) {
            const failure = await handleFailedPassword(userData, applyLoginSecurityUpdate);
            alert(failure.message);
            return;
          }

          await applyLoginSecurityUpdate(userData.userID, { loginAttempts: 3 });

          const { data: updatedUserData } = await supabase
            .from('user')
            .select('*')
            .eq('userID', userData.userID)
            .single();

          const finalUserData = updatedUserData || userData;

          try {
            await supabase.rpc('set_changed_by', { p_userid: finalUserData.userID });
          } catch (e) {
            console.error('Failed to set changed_by:', e);
          }

          await loginWithUserData(finalUserData);
          navigateForRole(navigate, finalUserData.role);
        } catch (error) {
          console.error('Login error:', error);
        }
    }

    const handleFormSubmit = async (e) => {
      e.preventDefault();
      await handleLogin();
    };
  return (
    <div className="login-page">
      <PageHelpCorner topic="login" />
      <header className="login-header">
      </header>

      <main className="login-main">
        <form className="login-form" onSubmit={handleFormSubmit}>
        <div className="logo" aria-hidden="true">
            <img src={logo} alt="App Logo" />
        </div>
          <h1>Login</h1>
          <p>Welcome back! Please enter your credentials to log in or <span className="link" onClick={navToSignUp}>Create A New Account</span> if you are a new user.</p>

          <h5>Username</h5>
          <HelpTooltip
            text="Your account name provided by your administrator (or assigned when your account was created)."
            className="help-tooltip-block"
          >
            <div className="clear-input-wrapper" role="group">
            <input className="input" type="text" name="username" placeholder="Username" aria-label="username" value={username} onChange={(e) => setUsername(e.target.value)} />
            <button type="button" className="button-clear" onClick={() => setUsername('')} aria-label="Clear username input">X</button>
            </div>
          </HelpTooltip>

          <h5>Password</h5>
          <HelpTooltip
            text="Enter the password for your account. Too many failed attempts can temporarily lock sign-in."
            className="help-tooltip-block"
          >
            <div className="clear-input-container" role="group">
            <input className="input"type="password" name="password" placeholder="Password" aria-label="password" value={password} onChange={(e) => setPassword(e.target.value)} />
            <button type="button" id="clearButton" className="button-clear" onClick={() => setPassword('')} aria-label="Clear password input">X</button>
            </div>
          </HelpTooltip>

          <div className="button-row" role="group">
            <HelpTooltip text="Sign in with the username and password entered above.">
              <button type="submit" className="button-primary">Login</button>
            </HelpTooltip>
            <HelpTooltip text="Return to the welcome screen without signing in.">
              <button type="button" className="button-primary" onClick={navToWelcome}>Cancel</button>
            </HelpTooltip>
          </div>

          <div className="subpage-links" role="group">
            <HelpTooltip text="Submit a new account request for an administrator to review.">
              <span className="link" onClick={navToSignUp}>Create a User Account</span>
            </HelpTooltip>
          </div>

          <div className="subpage-links" role="group">
            <HelpTooltip text="Open steps to reset your password using email, user ID, and security questions.">
              <span className="link" onClick={navToForgotPassword}>Forgot Password?</span>
            </HelpTooltip>
          </div>
        </form>
      </main>
    </div>

  )
}

export default LoginPage
