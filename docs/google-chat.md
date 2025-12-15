# Google Chat CRM Bot

## Colecciones de Firestore

- **chatSpaces**: documentos `{ key: string, spaceName: string }` ej. `{ key: "approvals", spaceName: "spaces/AAAA..." }`.
- **approvalRequests/{requestId}**: `{ status: 'PENDING'|'APPROVED'|'REJECTED', createdAt, requestedByEmail, title, description?, amount?, lastMessage: { spaceName, messageName, threadName? }, decidedBy?, decidedAt? }`.
- **userByEmail/{email}** (o `users/{email}`): `{ googleChat: { dmSpace: string, updatedAt } }`.

## Variables de entorno

- `INTERNAL_API_KEY` (protege `/api/google-chat/approvals/request`).
- `GOOGLE_CHAT_PROJECT_ID`
- `GOOGLE_CHAT_CLIENT_EMAIL`
- `GOOGLE_CHAT_PRIVATE_KEY` (usar `replace(/\\n/g, '\n')`).
- `FIREBASE_PROJECT_ID` (opcional, usa `GOOGLE_CHAT_PROJECT_ID` como fallback).
- `FIREBASE_CLIENT_EMAIL` (opcional, usa `GOOGLE_CHAT_CLIENT_EMAIL`).
- `FIREBASE_PRIVATE_KEY` (opcional, usa `GOOGLE_CHAT_PRIVATE_KEY`).
- Para la página interna `/chat` (cliente) sigue aplicando el endpoint existente `/api/chat` que usa la API de Chat
  clásica o webhooks: configura `GOOGLE_CHAT_SPACE_ID` o `GOOGLE_CHAT_WEBHOOK_URL` si quieres seguir usando esa
  pantalla. Si ves el mensaje de error "El endpoint /api/chat no está disponible", redeploya el proyecto asegurándote
  de que la ruta `src/app/api/chat/route.ts` está incluida; no requiere variables nuevas más allá de las anteriores.

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
