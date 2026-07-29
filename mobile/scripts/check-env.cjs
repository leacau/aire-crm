const fs = require('fs');
const path = require('path');

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

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    return null;
  }
}

function findGoogleServicesConfig() {
  const candidates = [
    process.env.GOOGLE_SERVICES_JSON_PATH,
    path.join(process.cwd(), 'google-services.json'),
    path.join(process.cwd(), 'android', 'app', 'google-services.json'),
  ].filter(Boolean);

  for (const candidate of candidates) {
    const resolvedPath = path.resolve(candidate);
    if (fs.existsSync(resolvedPath)) {
      const config = readJson(resolvedPath);
      if (config) return { config, path: resolvedPath };
    }
  }

  return null;
}

function getConfiguredAndroidPackage() {
  const appJson = readJson(path.join(process.cwd(), 'app.json'));
  return appJson?.expo?.android?.package || null;
}

function validateGoogleServicesConfig() {
  const googleServices = findGoogleServicesConfig();
  if (!googleServices) return [];

  const errors = [];
  const webClientId = String(process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID || '').trim();
  const firebaseAppId = String(process.env.EXPO_PUBLIC_FIREBASE_APP_ID || '').trim();
  const androidPackage = getConfiguredAndroidPackage();
  const clients = Array.isArray(googleServices.config.client) ? googleServices.config.client : [];
  const packageClient = clients.find((client) => client?.client_info?.android_client_info?.package_name === androidPackage);
  const oauthClients = clients.flatMap((client) => Array.isArray(client.oauth_client) ? client.oauth_client : []);
  const webClientIds = oauthClients
    .filter((client) => client?.client_type === 3)
    .map((client) => client.client_id)
    .filter(Boolean);
  const androidClient = oauthClients.find((client) => client?.client_type === 1 && client.client_id === webClientId);

  if (androidClient) {
    const packageName = androidClient.android_info?.package_name || 'un paquete Android';
    errors.push(`EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID apunta a un OAuth client Android (${packageName}); debe ser el OAuth client de tipo Web application.`);
  }

  if (webClientIds.length && webClientId && !webClientIds.includes(webClientId)) {
    errors.push('EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID no coincide con ningun OAuth client de tipo Web application del google-services.json.');
  }

  if (androidPackage && !packageClient) {
    errors.push(`google-services.json no contiene una app Android para el package ${androidPackage}.`);
  }

  const expectedFirebaseAppId = packageClient?.client_info?.mobilesdk_app_id;
  if (expectedFirebaseAppId && firebaseAppId && firebaseAppId !== expectedFirebaseAppId) {
    errors.push(`EXPO_PUBLIC_FIREBASE_APP_ID no corresponde al package ${androidPackage}. Descarga el google-services.json actualizado y usa el mobilesdk_app_id de esa app.`);
  }

  return errors;
}

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

const googleServicesErrors = validateGoogleServicesConfig();
if (googleServicesErrors.length) {
  console.error('Invalid Firebase/Google Sign-In configuration:');
  for (const error of googleServicesErrors) {
    console.error(`- ${error}`);
  }
  console.error('');
  console.error('If the file is outside the mobile folder, run with GOOGLE_SERVICES_JSON_PATH pointing to that file.');
  process.exit(1);
}

console.log('Mobile build environment is configured.');
