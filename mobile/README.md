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

## Primer alcance

- Login Google corporativo y login externo email/password.
- Validacion de sesion contra `/api/auth/session`.
- Bootstrap inicial contra `/api/mobile/bootstrap`.
- Cliente API mobile con refresh de token ante `401`.
- Pantallas piloto: Inicio, Tareas y Clientes.
