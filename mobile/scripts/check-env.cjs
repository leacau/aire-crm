const requiredEnvNames = [
  'EXPO_PUBLIC_API_BASE_URL',
  'EXPO_PUBLIC_FIREBASE_API_KEY',
  'EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN',
  'EXPO_PUBLIC_FIREBASE_PROJECT_ID',
  'EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET',
  'EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID',
  'EXPO_PUBLIC_FIREBASE_APP_ID',
  'EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID',
];

const missing = requiredEnvNames.filter((name) => !String(process.env[name] || '').trim());
const oauthClientIdPattern = /^\d+-[a-zA-Z0-9_-]+\.apps\.googleusercontent\.com$/;
const invalidGoogleClientIds = [
  'EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID',
  'EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID',
  'EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID',
].filter((name) => {
  const value = String(process.env[name] || '').trim();
  return value && !oauthClientIdPattern.test(value);
});

if (missing.length) {
  console.error('Missing required mobile build environment variables:');
  for (const name of missing) {
    console.error(`- ${name}`);
  }
  console.error('');
  console.error('Load them in the EAS preview environment before building the APK.');
  process.exit(1);
}

if (invalidGoogleClientIds.length) {
  console.error('Invalid Google OAuth client IDs:');
  for (const name of invalidGoogleClientIds) {
    console.error(`- ${name} must end with .apps.googleusercontent.com`);
  }
  console.error('Use OAuth 2.0 Client IDs from Google Cloud/Firebase, not project numbers.');
  process.exit(1);
}

console.log('Mobile build environment is configured.');
