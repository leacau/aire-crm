import 'dotenv/config';
import type { ExpoConfig } from '@expo/config';

type Env = {
  [key: string]: string | undefined;
};

const getEnv = (env: Env, key: string) => env[key] ?? process.env[key];

export default (): ExpoConfig => ({
  name: 'Aire CRM Mobile',
  slug: 'aire-crm-mobile',
  scheme: 'airecrm',
  version: '1.0.0',
  orientation: 'portrait',
  userInterfaceStyle: 'light',
  ios: {
    supportsTablet: true,
    bundleIdentifier: 'com.airecrm.mobile'
  },
  android: {
    package: 'com.airecrm.mobile'
  },
  web: {
    bundler: 'metro'
  },
  extra: {
    firebase: {
      apiKey: getEnv(process.env, 'FIREBASE_API_KEY'),
      authDomain: getEnv(process.env, 'FIREBASE_AUTH_DOMAIN'),
      projectId: getEnv(process.env, 'FIREBASE_PROJECT_ID'),
      storageBucket: getEnv(process.env, 'FIREBASE_STORAGE_BUCKET'),
      messagingSenderId: getEnv(process.env, 'FIREBASE_MESSAGING_SENDER_ID'),
      appId: getEnv(process.env, 'FIREBASE_APP_ID'),
      measurementId: getEnv(process.env, 'FIREBASE_MEASUREMENT_ID')
    }
  }
});
