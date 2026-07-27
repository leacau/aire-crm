function readEnv(name: string): string {
  return process.env[name]?.trim() || '';
}

export const env = {
  apiBaseUrl: readEnv('EXPO_PUBLIC_API_BASE_URL'),
  firebase: {
    apiKey: readEnv('EXPO_PUBLIC_FIREBASE_API_KEY'),
    authDomain: readEnv('EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN'),
    projectId: readEnv('EXPO_PUBLIC_FIREBASE_PROJECT_ID'),
    storageBucket: readEnv('EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET'),
    messagingSenderId: readEnv('EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID'),
    appId: readEnv('EXPO_PUBLIC_FIREBASE_APP_ID'),
  },
  google: {
    webClientId: readEnv('EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID'),
    iosClientId: readEnv('EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID'),
    androidClientId: readEnv('EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID'),
  },
};

export const requiredMobileEnvNames = [
  'EXPO_PUBLIC_API_BASE_URL',
  'EXPO_PUBLIC_FIREBASE_API_KEY',
  'EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN',
  'EXPO_PUBLIC_FIREBASE_PROJECT_ID',
  'EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET',
  'EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID',
  'EXPO_PUBLIC_FIREBASE_APP_ID',
  'EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID',
] as const;

export const missingMobileEnvNames = requiredMobileEnvNames.filter(name => !readEnv(name));

export const hasMobileRuntimeConfig = missingMobileEnvNames.length === 0;

export function requireEnv(value: string, name: string): string {
  if (!value) throw new Error(`Falta configurar ${name}.`);
  return value;
}
