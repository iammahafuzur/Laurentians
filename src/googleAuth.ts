import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getAuth,
  signInWithPopup,
  GoogleAuthProvider,
  onAuthStateChanged,
  signOut,
  type User
} from 'firebase/auth';
import firebaseConfig from '../firebase-applet-config.json';

// Initialize Firebase App instance safely (prevent duplicate initializations)
const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
export const auth = getAuth(app);

// Workspace Google Sheets Scopes
export const SCOPES = [
  'https://www.googleapis.com/auth/spreadsheets'
];

const provider = new GoogleAuthProvider();
SCOPES.forEach(scope => provider.addScope(scope));

// Configure provider parameters for consent prompt if needed
provider.setCustomParameters({
  prompt: 'select_account'
});

// Cache the access token in memory and local storage for background sync
const TOKEN_STORAGE_KEY = 'laurentian_sheets_token';
let cachedAccessToken: string | null = localStorage.getItem(TOKEN_STORAGE_KEY);
let isSigningIn = false;

/**
 * Initialize auth listener
 */
export const initAuth = (
  onAuthSuccess?: (user: User, token: string) => void,
  onAuthFailure?: () => void
) => {
  return onAuthStateChanged(auth, async (user: User | null) => {
    const savedToken = cachedAccessToken || localStorage.getItem(TOKEN_STORAGE_KEY);
    if (user && savedToken) {
      cachedAccessToken = savedToken;
      if (onAuthSuccess) onAuthSuccess(user, savedToken);
    } else {
      if (!isSigningIn) {
        if (!user) {
          cachedAccessToken = null;
          localStorage.removeItem(TOKEN_STORAGE_KEY);
        }
        if (onAuthFailure) onAuthFailure();
      }
    }
  });
};

/**
 * Perform Google Sign-In with Sheets scope
 */
export const googleSignIn = async (): Promise<{ user: User; accessToken: string } | null> => {
  try {
    isSigningIn = true;
    const result = await signInWithPopup(auth, provider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    if (!credential?.accessToken) {
      throw new Error('Failed to obtain Google Sheets access token from authentication.');
    }
    cachedAccessToken = credential.accessToken;
    localStorage.setItem(TOKEN_STORAGE_KEY, credential.accessToken);
    return { user: result.user, accessToken: cachedAccessToken };
  } catch (error) {
    console.error('Google Sign-In failed:', error);
    throw error;
  } finally {
    isSigningIn = false;
  }
};

/**
 * Get the currently cached in-memory access token
 */
export const getAccessToken = (): string | null => {
  return cachedAccessToken || localStorage.getItem(TOKEN_STORAGE_KEY);
};

/**
 * Set or refresh in-memory access token
 */
export const setAccessToken = (token: string | null) => {
  cachedAccessToken = token;
  if (token) {
    localStorage.setItem(TOKEN_STORAGE_KEY, token);
  } else {
    localStorage.removeItem(TOKEN_STORAGE_KEY);
  }
};

/**
 * Sign out and clear in-memory tokens
 */
export const logoutUser = async () => {
  await signOut(auth);
  cachedAccessToken = null;
  localStorage.removeItem(TOKEN_STORAGE_KEY);
};
