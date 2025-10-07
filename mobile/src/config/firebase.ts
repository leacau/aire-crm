import { getApp, getApps, initializeApp, FirebaseApp } from 'firebase/app';
import {
  Auth,
  getAuth,
  getReactNativePersistence,
  initializeAuth
} from 'firebase/auth';
import {
  Firestore,
  getFirestore,
  initializeFirestore
} from 'firebase/firestore';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';

const extra = Constants.expoConfig?.extra ?? Constants.manifest?.extra;
const firebaseConfig = extra?.firebase ?? {};

if (!firebaseConfig || !firebaseConfig.apiKey) {
  console.warn('Firebase configuration is missing. Please provide credentials in app.config.ts');
}

const apps = getApps();
const app: FirebaseApp = apps.length ? getApp() : initializeApp(firebaseConfig);

let auth: Auth;
try {
  auth = getAuth(app);
} catch (error) {
  auth = initializeAuth(app, {
    persistence: getReactNativePersistence(AsyncStorage)
  });
}

let db: Firestore;
try {
  db = initializeFirestore(app, {
    experimentalForceLongPolling: true
  });
} catch (error) {
  db = getFirestore(app);
}

export { app, auth, db };
