# Firebase Studio

This is a NextJS starter in Firebase Studio.

To get started, take a look at src/app/page.tsx.

## Aplicación móvil

El repositorio incluye una aplicación móvil creada con [Expo](https://expo.dev/) dentro de la carpeta [`mobile`](mobile/). Está integrada con los mismos servicios de Firebase que la aplicación web para ofrecer una experiencia optimizada en teléfonos.

### Configuración

1. Copia las credenciales de Firebase utilizadas en la aplicación web y expórtalas como variables de entorno antes de ejecutar Expo. Los nombres esperados son:

   ```bash
   export FIREBASE_API_KEY="..."
   export FIREBASE_AUTH_DOMAIN="..."
   export FIREBASE_PROJECT_ID="..."
   export FIREBASE_STORAGE_BUCKET="..."
   export FIREBASE_MESSAGING_SENDER_ID="..."
   export FIREBASE_APP_ID="..."
   export FIREBASE_MEASUREMENT_ID="..." # opcional
   ```

2. Instala las dependencias de la app móvil:

   ```bash
   cd mobile
   npm install
   ```

3. Inicia el proyecto con Metro y la app Expo Go:

   ```bash
   npm run start
   ```

4. Para generar un APK listo para distribución utiliza EAS Build (requiere una cuenta de Expo):

   ```bash
   npm install --global eas-cli
   eas build --platform android --profile preview
   ```

   También puedes crear un APK local con `expo run:android` si tienes configurado Android Studio.

> Nota: el repositorio no incluye iconos ni pantallas de carga personalizadas para evitar archivos binarios. Expo utilizará los recursos por defecto; puedes añadir los tuyos editando `mobile/app.config.ts` antes de compilar.
