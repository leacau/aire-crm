import { createAsyncStorage } from '@react-native-async-storage/async-storage';
import * as FirebaseAuth from '@firebase/auth';
import { getApp, getApps, initializeApp } from 'firebase/app';
import {
  getAuth,
  initializeAuth,
  type Auth,
  type Persistence,
} from '@firebase/auth';
import { env, requireEnv } from '../config/env';

const firebaseConfig = {
  apiKey: requireEnv(env.firebase.apiKey, 'EXPO_PUBLIC_FIREBASE_API_KEY'),
  authDomain: requireEnv(env.firebase.authDomain, 'EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN'),
  projectId: requireEnv(env.firebase.projectId, 'EXPO_PUBLIC_FIREBASE_PROJECT_ID'),
  storageBucket: requireEnv(env.firebase.storageBucket, 'EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET'),
  messagingSenderId: requireEnv(env.firebase.messagingSenderId, 'EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID'),
  appId: requireEnv(env.firebase.appId, 'EXPO_PUBLIC_FIREBASE_APP_ID'),
};

export const firebaseApp = getApps().length ? getApp() : initializeApp(firebaseConfig);

const { getReactNativePersistence } = FirebaseAuth as typeof FirebaseAuth & {
  getReactNativePersistence: (storage: ReturnType<typeof createAsyncStorage>) => Persistence;
};

function createAuth(): Auth {
  try {
    return initializeAuth(firebaseApp, {
      persistence: getReactNativePersistence(createAsyncStorage('aire-crm-mobile')),
    });
  } catch {
    return getAuth(firebaseApp);
  }
}

export const auth = createAuth();
