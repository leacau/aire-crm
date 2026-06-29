# Variables de entorno de despliegue

## Firebase Admin

Las rutas API del CRM usan Firebase Admin para validar el token del usuario y leer Firestore desde el servidor. En Netlify, configurar preferentemente una sola variable:

```text
FIREBASE_SERVICE_ACCOUNT_KEY
```

Valor esperado: el JSON completo de la cuenta de servicio de Firebase, o el mismo JSON codificado en base64.

También se aceptan estos alias para compatibilidad:

- `FIREBASE_SERVICE_ACCOUNT`
- `FIREBASE_ADMIN_SERVICE_ACCOUNT`
- `FIREBASE_ADMIN_CREDENTIALS`
- `GOOGLE_APPLICATION_CREDENTIALS_JSON`
- `GOOGLE_CREDENTIALS`

Como alternativa, se pueden configurar variables separadas:

- `FIREBASE_ADMIN_PROJECT_ID` o `FIREBASE_PROJECT_ID`
- `FIREBASE_ADMIN_CLIENT_EMAIL` o `FIREBASE_CLIENT_EMAIL`
- `FIREBASE_ADMIN_PRIVATE_KEY` o `FIREBASE_PRIVATE_KEY`

La clave privada puede guardarse con saltos reales, con `\n` escapados o en base64.
