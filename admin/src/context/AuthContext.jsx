// Sign-in state for the panel.
//
// The panel is admin-only: a student account holds valid Firebase credentials
// but must not get in here. Both this check and the server-side one in
// api/_lib/auth.js read the same custom claim; this one is only for the UI,
// the server's is the one that actually protects the data.

import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
} from 'firebase/auth';
import { auth } from '../lib/firebase.js';

const AuthContext = createContext(null);

const SIGN_IN_ERRORS = {
  'auth/invalid-credential': 'Wrong email or password.',
  'auth/invalid-email': 'That is not a valid email address.',
  'auth/user-disabled': 'This account has been disabled.',
  'auth/user-not-found': 'Wrong email or password.',
  'auth/wrong-password': 'Wrong email or password.',
  'auth/too-many-requests':
    'Too many failed attempts. Wait a few minutes and try again.',
  'auth/network-request-failed':
    'Could not reach Firebase. Check your internet connection.',
};

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    return onAuthStateChanged(auth, async (firebaseUser) => {
      if (!firebaseUser) {
        setUser(null);
        setLoading(false);
        return;
      }

      const { claims } = await firebaseUser.getIdTokenResult();

      if (claims.role !== 'admin') {
        // A student signing in here gets bounced rather than shown an empty
        // panel that fails on every request.
        await signOut(auth);
        setUser(null);
        setLoading(false);
        return;
      }

      setUser({
        uid: firebaseUser.uid,
        email: firebaseUser.email,
        name: firebaseUser.displayName || 'Administrator',
      });
      setLoading(false);
    });
  }, []);

  const value = useMemo(
    () => ({
      user,
      loading,

      async signIn(email, password) {
        try {
          const credential = await signInWithEmailAndPassword(
            auth,
            email.trim().toLowerCase(),
            password,
          );
          const { claims } = await credential.user.getIdTokenResult();
          if (claims.role !== 'admin') {
            await signOut(auth);
            throw new Error(
              'That account is not an administrator. Students use the mobile app.',
            );
          }
        } catch (error) {
          throw new Error(
            SIGN_IN_ERRORS[error?.code] || error.message || 'Sign-in failed.',
          );
        }
      },

      signOut: () => signOut(auth),
    }),
    [user, loading],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used inside <AuthProvider>.');
  }
  return context;
}
