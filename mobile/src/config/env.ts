function cleanEnv(value: string | undefined): string {
  return value?.trim() || '';
}

export const env = {
  apiBaseUrl: cleanEnv(process.env.EXPO_PUBLIC_API_BASE_URL),
  firebase: {
    apiKey: cleanEnv(process.env.EXPO_PUBLIC_FIREBASE_API_KEY),
    authDomain: cleanEnv(process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN),
    projectId: cleanEnv(process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID),
    storageBucket: cleanEnv(process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET),
    messagingSenderId: cleanEnv(process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID),
    appId: cleanEnv(process.env.EXPO_PUBLIC_FIREBASE_APP_ID),
  },
  google: {
    webClientId: cleanEnv(process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID),
    iosClientId: cleanEnv(process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID),
    androidClientId: cleanEnv(process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID),
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

const requiredMobileEnvValues: Record<(typeof requiredMobileEnvNames)[number], string> = {
  EXPO_PUBLIC_API_BASE_URL: env.apiBaseUrl,
  EXPO_PUBLIC_FIREBASE_API_KEY: env.firebase.apiKey,
  EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN: env.firebase.authDomain,
  EXPO_PUBLIC_FIREBASE_PROJECT_ID: env.firebase.projectId,
  EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET: env.firebase.storageBucket,
  EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID: env.firebase.messagingSenderId,
  EXPO_PUBLIC_FIREBASE_APP_ID: env.firebase.appId,
  EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID: env.google.webClientId,
};

export const missingMobileEnvNames = requiredMobileEnvNames.filter(name => !requiredMobileEnvValues[name]);

export const hasMobileRuntimeConfig = missingMobileEnvNames.length === 0;

export function requireEnv(value: string, name: string): string {
  if (!value) throw new Error(`Falta configurar ${name}.`);
  return value;
}
