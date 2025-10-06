# Aire CRM Mobile

Aplicación móvil creada con Expo y React Native para gestionar clientes, oportunidades y tareas del CRM.

## Requisitos previos

- Node.js 18 o superior.
- Cuenta de Firebase con los mismos datos que utiliza la app web.
- (Opcional) Expo Go en tu dispositivo móvil o un emulador configurado.

## Configuración

1. Copia las credenciales de Firebase a variables de entorno antes de iniciar Expo:

   ```bash
   export FIREBASE_API_KEY="..."
   export FIREBASE_AUTH_DOMAIN="..."
   export FIREBASE_PROJECT_ID="..."
   export FIREBASE_STORAGE_BUCKET="..."
   export FIREBASE_MESSAGING_SENDER_ID="..."
   export FIREBASE_APP_ID="..."
   export FIREBASE_MEASUREMENT_ID="..." # opcional
   ```

2. Instala las dependencias:

   ```bash
   npm install
   ```

3. Ejecuta la app en modo desarrollo:

   ```bash
   npm run start
   ```

   Abre el proyecto con Expo Go escaneando el código QR o con un emulador.

## Construir un APK

Para generar un APK sin necesidad de macOS puedes usar EAS Build:

```bash
npm install --global eas-cli
npx eas login
cd mobile
npx eas build --platform android --profile preview
```

Si tienes Android Studio configurado, también puedes crear un build local con:

```bash
npm run android
```

### Iconos y pantalla de inicio

Para evitar almacenar binarios en el repositorio, la configuración usa los iconos y la pantalla de carga predeterminados de Expo. Si quieres personalizarlos, crea una carpeta `assets/` dentro de `mobile/`, agrega tus imágenes (`icon.png`, `adaptive-icon.png`, `splash.png`) y actualiza `app.config.ts` para apuntar a esas rutas antes de construir el APK.

## Estructura

- `App.tsx`: punto de entrada con la navegación principal.
- `src/contexts`: contiene el contexto de autenticación.
- `src/screens`: pantallas de Dashboard, Clientes, Oportunidades y Perfil.
- `src/services`: funciones para obtener datos desde Firebase.
- `src/config`: inicialización de Firebase con soporte para React Native.

## Funcionalidades

- Inicio de sesión con email y contraseña usando Firebase Auth.
- Dashboard con resumen de clientes, oportunidades y tareas por vencer.
- Listado de clientes y oportunidades filtrables.
- Vista de perfil con opción para cerrar sesión.

> Nota: la app reutiliza la misma base de datos que la aplicación web. Asegúrate de tener usuarios y datos configurados en Firebase antes de iniciar la app.
