# Aire CRM Mobile

Aplicación móvil escrita con [Expo](https://docs.expo.dev/) y [React Native](https://reactnative.dev/) para gestionar clientes de Aire CRM desde dispositivos Android.

## Requisitos

- Node.js 18 o superior
- npm 9 o superior
- [Expo CLI](https://docs.expo.dev/get-started/installation/) (se instala al ejecutar los scripts `npm`)
- Para generar un APK es necesario tener Android Studio y el SDK de Android configurados o utilizar [EAS Build](https://docs.expo.dev/build/setup/).

## Instalación

```bash
cd mobile-app
npm install
```

## Ejecución en desarrollo

```bash
npm start
```

El comando anterior abrirá Expo Dev Tools en tu terminal. Desde ahí puedes escanear el código QR con la aplicación Expo Go o lanzar el emulador de Android/iOS.

## Generar APK

Expo facilita la compilación nativa mediante EAS Build:

```bash
# Autenticarse en Expo
npx expo login

# Configurar el proyecto si es la primera vez
npx expo prebuild --platform android

# Construir un APK administrado por EAS
npx eas build --platform android --profile preview
```

También puedes usar `npx expo run:android` para crear un build local utilizando Android Studio.

## Estructura principal

- `app/`: rutas y pantallas administradas por **expo-router**.
- `src/context/AuthContext.tsx`: proveedor de autenticación simulado para manejar el inicio de sesión y cerrar sesión.
- `assets/`: carpeta reservada para tus iconos y pantallas de splash (consulta `assets/README.md`).

## Variables de entorno

El proyecto no requiere variables de entorno para la demostración. Integra tus propios servicios (por ejemplo, API de autenticación real) añadiendo lógica en `AuthContext` y pantallas específicas.
