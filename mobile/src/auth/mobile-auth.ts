import {
  GoogleAuthProvider,
  signInWithCredential,
  signInWithEmailAndPassword,
  signOut,
} from 'firebase/auth';
import { GoogleSignin } from '@react-native-google-signin/google-signin';
import { env } from '../config/env';
import { auth } from '../lib/firebase';

GoogleSignin.configure({
  webClientId: env.google.webClientId || undefined,
  iosClientId: env.google.iosClientId || undefined,
  offlineAccess: false,
});

export async function signInWithGoogle() {
  await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
  const result = await GoogleSignin.signIn();
  const idToken = result.data?.idToken;

  if (!idToken) {
    throw new Error('Google no devolvio un idToken valido.');
  }

  const credential = GoogleAuthProvider.credential(idToken);
  await signInWithCredential(auth, credential);
}

export async function signInExternalUser(email: string, password: string) {
  await signInWithEmailAndPassword(auth, email.trim().toLowerCase(), password);
}

export async function signOutMobileUser() {
  await Promise.allSettled([
    GoogleSignin.signOut(),
    signOut(auth),
  ]);
}
