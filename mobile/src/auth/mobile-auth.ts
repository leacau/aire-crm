import {
  GoogleAuthProvider,
  signInWithCredential,
  signInWithEmailAndPassword,
  signOut,
} from 'firebase/auth';
import { GoogleSignin } from '@react-native-google-signin/google-signin';
import { env, isGoogleOAuthClientId, missingMobileEnvNames } from '../config/env';
import { auth } from '../lib/firebase';

GoogleSignin.configure({
  webClientId: env.google.webClientId || undefined,
  iosClientId: env.google.iosClientId || undefined,
  offlineAccess: false,
});

function requireMobileAuth() {
  if (!auth) {
    throw new Error(`La app mobile no esta configurada. Faltan: ${missingMobileEnvNames.join(', ')}.`);
  }

  return auth;
}

export async function signInWithGoogle() {
  if (!isGoogleOAuthClientId(env.google.webClientId)) {
    throw new Error('EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID debe ser el Client ID OAuth tipo Web y terminar en .apps.googleusercontent.com.');
  }

  if (env.google.androidClientId && !isGoogleOAuthClientId(env.google.androidClientId)) {
    throw new Error('EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID debe ser el Client ID OAuth tipo Android y terminar en .apps.googleusercontent.com.');
  }

  let result;
  try {
    await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
    result = await GoogleSignin.signIn();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/DEVELOPER_ERROR|code:?\s*10|Developer console/i.test(message)) {
      throw new Error('Google Sign-In no esta configurado para este APK. Verifica que el OAuth Web Client ID sea correcto y que Firebase/Google Cloud tenga un cliente Android para com.airedesantafe.crm con el SHA-1 del keystore de EAS.');
    }

    throw error;
  }

  const idToken = result.data?.idToken;

  if (!idToken) {
    throw new Error('Google no devolvio un idToken valido.');
  }

  const credential = GoogleAuthProvider.credential(idToken);
  await signInWithCredential(requireMobileAuth(), credential);
}

export async function signInExternalUser(email: string, password: string) {
  await signInWithEmailAndPassword(requireMobileAuth(), email.trim().toLowerCase(), password);
}

export async function signOutMobileUser() {
  await Promise.allSettled([
    GoogleSignin.signOut(),
    auth ? signOut(auth) : Promise.resolve(),
  ]);
}
