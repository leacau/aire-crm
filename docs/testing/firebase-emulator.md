# Pruebas manuales con Firebase Emulator

1. Instala e inicia los emuladores de Firebase en tu máquina local:
   ```bash
   npm install -g firebase-tools
   firebase login
   firebase init emulators
   firebase emulators:start --only firestore
   ```
2. Exporta la variable `FIREBASE_SERVICE_ACCOUNT_KEY` con las credenciales de servicio que usarás en el entorno local. Puedes reutilizar el archivo generado por `firebase login:ci` o el JSON de la cuenta de servicio.
3. Ejecuta la aplicación en modo desarrollo dentro de este repositorio:
   ```bash
   FIREBASE_SERVICE_ACCOUNT_KEY="$(cat service-account.json)" npm run dev
   ```
4. Invoca los endpoints creados (por ejemplo, `POST /api/clients`) usando herramientas como `curl` o `Hoppscotch`, enviando payloads válidos según los esquemas definidos en `route.ts`. Verifica que los cambios se reflejen en el emulador de Firestore y que las respuestas HTTP coincidan con los códigos esperados.
5. Repite las pruebas para `opportunities` y `activities`, validando los flujos de creación, actualización, lectura y eliminación cuando corresponda.
