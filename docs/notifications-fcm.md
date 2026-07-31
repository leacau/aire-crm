# Firebase Cloud Messaging

Esta implementacion registra tokens de notificacion por usuario y dispositivo desde la API. El front web y la app mobile no escriben en Firestore: envian el token al endpoint protegido y el backend lo guarda con Firebase Admin.

## Variables

Web necesita esta variable publica:

```env
NEXT_PUBLIC_FIREBASE_MESSAGING_VAPID_KEY=
```

Se obtiene en Firebase Console, en el proyecto de Aire CRM:

1. Project settings.
2. Cloud Messaging.
3. Web Push certificates.
4. Generate key pair o copiar la key pair existente.

El backend usa las credenciales Admin que ya existen:

```env
FIREBASE_PROJECT_ID=
FIREBASE_CLIENT_EMAIL=
FIREBASE_PRIVATE_KEY=
```

## Endpoints

- `POST /api/notifications/tokens`: registra o actualiza el token del dispositivo del usuario autenticado.
- `DELETE /api/notifications/tokens`: desactiva el token del dispositivo del usuario autenticado.
- `POST /api/notifications/send`: envia una notificacion a usuarios por `userIds`. Solo perfiles de gestion/admin.

Payload de envio:

```json
{
  "userIds": ["uid-del-usuario"],
  "title": "Aire CRM",
  "body": "Tenes una nueva tarea pendiente.",
  "link": "/tasks",
  "data": {
    "type": "task"
  }
}
```

## Web

El service worker se sirve desde `/firebase-messaging-sw.js` con la configuracion Firebase tomada de variables de entorno. El usuario activa notificaciones desde el menu del avatar. Si el permiso ya estaba otorgado, el token se registra automaticamente al ingresar.

## Mobile

La app usa `expo-notifications` para obtener el token nativo del dispositivo con `getDevicePushTokenAsync`, que en Android corresponde a FCM. El registro corre despues de validar la sesion mobile. Si el usuario niega permisos, la app sigue operando sin push en ese dispositivo.

Para Android, `app.json` declara `POST_NOTIFICATIONS` y configura el canal `default`; por eso hay que reconstruir el APK despues de este cambio.
