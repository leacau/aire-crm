# Google Chat CRM Bot

## Colecciones de Firestore

- **chatSpaces**: documentos `{ key: string, spaceName: string }` ej. `{ key: "approvals", spaceName: "spaces/AAAA..." }`.
- **approvalRequests/{requestId}**: `{ status: 'PENDING'|'APPROVED'|'REJECTED', createdAt, requestedByEmail, title, description?, amount?, lastMessage: { spaceName, messageName, threadName? }, decidedBy?, decidedAt? }`.
- **userByEmail/{email}** (o `users/{email}`): `{ googleChat: { dmSpace: string, updatedAt } }`.

## Variables de entorno

- `INTERNAL_API_KEY` (protege `/api/google-chat/approvals/request`).
- `GOOGLE_CHAT_PROJECT_ID`: ID del proyecto de Google Cloud donde habilitas Google Chat API y creas el Service Account.
- `GOOGLE_CHAT_CLIENT_EMAIL`: `client_email` del JSON de credenciales del Service Account con el scope `chat.bot`.
- `GOOGLE_CHAT_PRIVATE_KEY`: `private_key` del JSON del Service Account (recuerda aplicar `replace(/\\n/g, '\n')`).
- `FIREBASE_PROJECT_ID` (opcional): si usas el mismo proyecto puedes omitirlo; se tomará `GOOGLE_CHAT_PROJECT_ID`.
- `FIREBASE_CLIENT_EMAIL` (opcional): `client_email` del Service Account con permisos de Admin SDK; si no se define,
  se reutiliza `GOOGLE_CHAT_CLIENT_EMAIL`.
- `FIREBASE_PRIVATE_KEY` (opcional): `private_key` del Service Account de Admin SDK; si no se define, se reutiliza
  `GOOGLE_CHAT_PRIVATE_KEY`.
- `GOOGLE_CHAT_SPACE_ID` (opcional, solo para la página interna `/chat`): lo obtienes de la URL del space de Chat o
  del payload de un mensaje enviado por el bot.
- `GOOGLE_CHAT_WEBHOOK_URL` (opcional, solo para la página interna `/chat`): URL del webhook de Chat (solo si sigues
  usando el flujo legacy basado en webhooks).

Cómo obtenerlas:

1. **Service Account** (Google Cloud Console → IAM & Admin → Service Accounts → Create key): descarga el JSON y copia
   `project_id`, `client_email` y `private_key` para `GOOGLE_CHAT_PROJECT_ID`, `GOOGLE_CHAT_CLIENT_EMAIL` y
   `GOOGLE_CHAT_PRIVATE_KEY`.
2. **Firestore Admin SDK** (opcional): puedes usar el mismo Service Account del paso anterior; si generas uno
   específico, usa su `project_id`, `client_email` y `private_key` para las variables `FIREBASE_*`.
3. **INTERNAL_API_KEY**: genera un string secreto (por ejemplo con `openssl rand -hex 32`) y configúralo tanto en
   Vercel como en el servicio que llame `/api/google-chat/approvals/request`.
4. **GOOGLE_CHAT_SPACE_ID / GOOGLE_CHAT_WEBHOOK_URL** (solo para la página `/chat`): copia el `space` desde la URL
   de Chat (formato `spaces/AAAA...`) o usa el webhook generado al crear el webhook entrante en ese space. No son
   necesarias para los nuevos endpoints `/api/google-chat/*`.

Nota: Si ves el mensaje de error "El endpoint /api/chat no está disponible", redeploya el proyecto asegurándote de que
la ruta `src/app/api/chat/route.ts` está incluida; no requiere variables nuevas más allá de las anteriores.

## Despliegue en Vercel

1. Configura todas las variables de entorno anteriores en Vercel (secreto, no públicar en el cliente).
2. Ejecuta `npm run build` como de costumbre; los endpoints funcionan solo en runtime.
3. Verifica que el dominio público (p. ej. `https://tu-app.vercel.app`) esté accesible para Google Chat.

## Configuración de la Chat App

1. Crea un bot de Google Chat asociado al Service Account configurado arriba.
2. En la consola de Google Chat API, define el endpoint de interacción como `https://tu-app.vercel.app/api/google-chat/webhook`.
3. Otorga el scope `https://www.googleapis.com/auth/chat.bot` al Service Account y habilita la API de Chat.
4. Instala la app en el dominio (org-wide) o en los espacios necesarios desde la consola de administración o añadiendo el bot al espacio.
5. En el space de aprobaciones, añade el bot y registra `chatSpaces/approvals` con el `spaceName` correspondiente.

## Llamadas desde el CRM

Para crear solicitudes de aprobación envía un POST a `/api/google-chat/approvals/request` con header `X-Internal-Api-Key: <INTERNAL_API_KEY>` y body:

```json
{
  "requestId": "abc123",
  "title": "Aprobar factura",
  "description": "Factura 555",
  "amount": 1000,
  "requestedByEmail": "usuario@empresa.com",
  "approveUrl": "https://crm/approvals/abc123"
}
```
