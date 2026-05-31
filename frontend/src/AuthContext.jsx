import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import PropTypes from 'prop-types';
import { supabase } from './supabaseClient';

const AuthContext = createContext();

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const storedUser = sessionStorage.getItem('currentUser');
    if (storedUser) {
      try {
        const parsedUser = JSON.parse(storedUser);
        setUser(parsedUser);
        setLoading(false);
      } catch (err) {
        console.error('Error parsing stored user:', err);
        sessionStorage.removeItem('currentUser');
      }
    }

    const checkUser = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!storedUser && user) {
          setUser(user);
        }
      } catch (err) {
        if (!storedUser) {
          console.error('Error checking user:', err);
        }
      } finally {
        if (!storedUser) {
          setLoading(false);
        }
      }
    };

    checkUser();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (!sessionStorage.getItem('currentUser')) {
        setUser(session?.user || null);
      }
    });

    return () => {
      subscription?.unsubscribe();
    };
  }, []);

  const login = async (email, password) => {
    try {
      setError(null);
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (error) throw error;
      return data;
    } catch (err) {
      setError(err.message);
      throw err;
    }
  };

  const signup = async (email, password) => {
    try {
      setError(null);
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
      });
      if (error) throw error;
      return data;
    } catch (err) {
      setError(err.message);
      throw err;
    }
  };

  const loginWithUserData = async (userData) => {
    try {
      setError(null);
      const userInfo = {
        userID: userData.userID,
        username: userData.username,
        email: userData.email,
        role: userData.role,
        fName: userData.fName,
        lName: userData.lName,
        picture_path: userData.picture_path,
        status: userData.status,
        createdAt: userData.createdAt,
        passwordExpires: userData.passwordExpires,
        address: userData.address,
        dob: userData.dob,
        loginAttempts: userData.loginAttempts,
        suspendFrom: userData.suspendFrom,
        suspendedTill: userData.suspendedTill,
      };
      sessionStorage.setItem('currentUser', JSON.stringify(userInfo));
      setUser(userInfo);
      setLoading(false);
      return userInfo;
    } catch (err) {
      setError(err.message);
      throw err;
    }
  };

  const updateCurrentUser = (patch) => {
    setUser((prev) => {
      if (!prev) return prev;
      const next = patch ? { ...prev, ...patch } : prev;
      sessionStorage.setItem('currentUser', JSON.stringify(next));
      return next;
    });
  };

  const logout = async () => {
    try {
      setError(null);
      console.log('Current user before logout:', user);
      
      sessionStorage.removeItem('currentUser');
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
      setUser(null);
      
      console.log('Current user after logout:', null);
    } catch (err) {
      setError(err.message);
      throw err;
    }
  };

  const value = useMemo(
    () => ({
      user,
      loading,
      error,
      login,
      loginWithUserData,
      signup,
      logout,
      updateCurrentUser,
      supabase,
    }),
    [user, loading, error]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

AuthProvider.propTypes = {
  children: PropTypes.node.isRequired,
};

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
