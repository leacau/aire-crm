'use client';

import {
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  updateProfile,
  type User,
} from 'firebase/auth';
import { auth } from '@/lib/firebase';

export type AuthClientUser = User;

export function getCurrentAuthUser(): AuthClientUser | null {
  return auth.currentUser;
}

export function onAuthUserChanged(
  callback: (user: AuthClientUser | null) => void,
  onError?: () => void,
) {
  return onAuthStateChanged(auth, callback, onError);
}

export async function signInWithGoogle(): Promise<void> {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  await signInWithPopup(auth, provider);
}

export async function signInExternalUser(email: string, password: string): Promise<void> {
  await signInWithEmailAndPassword(auth, email.trim().toLowerCase(), password);
}

export async function signOutCurrentUser(): Promise<void> {
  await signOut(auth);
}

export async function updateAuthProfile(
  user: AuthClientUser,
  profile: { displayName?: string | null; photoURL?: string | null },
): Promise<void> {
  await updateProfile(user, profile);
}

export async function requestGoogleServicesAccessToken(): Promise<{
  token: string | null;
  expiresInSeconds: number;
}> {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ include_granted_scopes: 'true' });
  provider.addScope('https://www.googleapis.com/auth/calendar.events');
  provider.addScope('https://www.googleapis.com/auth/gmail.send');

  const result = await signInWithPopup(auth, provider);
  const credential = GoogleAuthProvider.credentialFromResult(result);
  const tokenResponse = result as typeof result & {
    _tokenResponse?: { oauthExpiresIn?: string | number };
  };
  const expiresIn = Number(tokenResponse._tokenResponse?.oauthExpiresIn || 3600);

  return {
    token: credential?.accessToken || null,
    expiresInSeconds: Number.isFinite(expiresIn) ? expiresIn : 3600,
  };
}
