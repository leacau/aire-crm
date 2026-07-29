# Aire CRM Mobile

App mobile privada para usuarios autorizados de Aire CRM.

## Stack

- Expo + React Native + TypeScript.
- Firebase Auth como proveedor de identidad.
- API privada existente de Aire CRM con `Authorization: Bearer <Firebase ID token>`.
- Endpoints mobile `/api/mobile/*` como fachada estable para la app.

## Configuracion

Crear `mobile/.env.local` con los valores de `mobile/.env.example`.

Variables clave:

- `EXPO_PUBLIC_API_BASE_URL`: URL base del deploy web/API, por ejemplo `https://...vercel.app`.
- `EXPO_PUBLIC_FIREBASE_*`: configuracion publica del proyecto Firebase.
- `EXPO_PUBLIC_GOOGLE_*_CLIENT_ID`: OAuth clients para Google Sign-In mobile.

## Comandos

```bash
cd mobile
npm install
npm run start
```

Para probar Google Sign-In nativo se recomienda usar development build:

```bash
npm run android
npm run ios
```

## APK Android

El perfil `preview` de EAS genera un APK instalable fuera de Play Store:

```bash
cd mobile
npx eas-cli login
npm run build:android:apk
```

Antes de construir, cargar las variables `EXPO_PUBLIC_*` en EAS o en el entorno de build. Sin esos valores la app no puede inicializar Firebase ni llamar a la API.

El build ejecuta automaticamente el mismo chequeo dentro de EAS para cortar temprano si falta alguna variable. Para revisar tu entorno local:

```bash
npm run doctor:env
```

Para compilar el APK localmente en Windows, usa `MOBILE_ENV_FILE` si el archivo de variables esta fuera de la carpeta `mobile`:

```powershell
$env:MOBILE_ENV_FILE="C:\Users\leand\Documents\api\.env.preview"
npm run build:android:apk:local
```

El APK queda en:

```text
mobile\android\app\build\outputs\apk\release\app-release.apk
```

Si Windows informa `EBUSY` al limpiar `mobile/android`, cierra Android Studio, emuladores y cualquier explorador abierto dentro de esa carpeta. El script intenta detener Gradle y reintentar automaticamente, pero otros procesos tambien pueden bloquear archivos `.dex`.

Cuando solo cambiaste codigo JS/TS y ya existe `mobile/android`, podes evitar la limpieza de la carpeta nativa:

```powershell
npm run build:android:apk:local:reuse
```

Usa el build completo si cambiaste `app.json`, plugins nativos o dependencias nativas.

Si se firma con un keystore distinto al de EAS, hay que registrar el SHA-1 de ese keystore en Firebase/Google Cloud para que Google Sign-In no falle con `DEVELOPER_ERROR`.

Para el APK local generado con `npm run build:android:apk:local`, el build queda firmado con `mobile/android/app/debug.keystore`. Se puede consultar el fingerprint con:

```powershell
npm run android:sha1:local
```

Ese SHA-1 debe cargarse en Firebase/Google Cloud para el cliente Android con package:

```text
com.airedesantafe.crm
```

Si descargaste un `google-services.json` desde Firebase, podes usarlo para validar que las variables del build coincidan con el package Android:

```powershell
$env:MOBILE_ENV_FILE="C:\Users\leand\Documents\api\.env.preview"
$env:GOOGLE_SERVICES_JSON_PATH="C:\Users\leand\Downloads\google-services.json"
npm run doctor:env
```

`EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` debe ser el OAuth client de tipo **Web application**. No uses en esa variable el OAuth client de tipo Android.

Variables requeridas para el entorno `preview` de EAS:

- `EXPO_PUBLIC_API_BASE_URL`
- `EXPO_PUBLIC_FIREBASE_API_KEY`
- `EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN`
- `EXPO_PUBLIC_FIREBASE_PROJECT_ID`
- `EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET`
- `EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID`
- `EXPO_PUBLIC_FIREBASE_APP_ID`
- `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID`

Para Google Sign-In en Android, el `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` debe ser el OAuth Client ID de tipo **Web application** y debe terminar en `.apps.googleusercontent.com`. Si se carga un numero de proyecto o un ID incompleto, Android responde con `DEVELOPER_ERROR`.

Tambien se recomienda cargar `EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID` con el OAuth Client ID de tipo **Android** correspondiente al package:

```text
com.airedesantafe.crm
```

Ese cliente Android debe tener registrado el SHA-1 del keystore usado por EAS para firmar el APK preview. Si el SHA-1 no coincide, Google Sign-In tambien devuelve `DEVELOPER_ERROR`.

## Primer alcance

- Login Google corporativo y login externo email/password.
- Validacion de sesion contra `/api/auth/session`.
- Bootstrap inicial contra `/api/mobile/bootstrap`.
- Cliente API mobile con refresh de token ante `401`.
- Pantallas piloto: Inicio, Tareas y Clientes.
