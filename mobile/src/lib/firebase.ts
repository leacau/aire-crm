import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FirebaseAuth from '@firebase/auth';
import { getApp, getApps, initializeApp } from 'firebase/app';
import {
  getAuth,
  initializeAuth,
  type Persistence,
} from '@firebase/auth';
import type { Auth } from 'firebase/auth';
import { env, hasMobileRuntimeConfig } from '../config/env';

const firebaseConfig = hasMobileRuntimeConfig
  ? {
      apiKey: env.firebase.apiKey,
      authDomain: env.firebase.authDomain,
      projectId: env.firebase.projectId,
      storageBucket: env.firebase.storageBucket,
      messagingSenderId: env.firebase.messagingSenderId,
      appId: env.firebase.appId,
    }
  : null;

export const firebaseApp = firebaseConfig
  ? (getApps().length ? getApp() : initializeApp(firebaseConfig))
  : null;

const { getReactNativePersistence } = FirebaseAuth as typeof FirebaseAuth & {
  getReactNativePersistence: (storage: typeof AsyncStorage) => Persistence;
};

function createAuth(): Auth | null {
  if (!firebaseApp) return null;

  try {
    return initializeAuth(firebaseApp, {
      persistence: getReactNativePersistence(AsyncStorage),
    }) as unknown as Auth;
  } catch {
    return getAuth(firebaseApp) as unknown as Auth;
  }
}

export const auth = createAuth();
