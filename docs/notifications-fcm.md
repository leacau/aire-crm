# Firebase Cloud Messaging

Esta implementacion registra tokens de notificacion por usuario y dispositivo
desde la API. El front web y la app mobile no escriben en Firestore: envian el
token al endpoint protegido y el backend lo guarda con Firebase Admin.

## Variables

Web necesita esta variable publica:

```env
NEXT_PUBLIC_FIREBASE_MESSAGING_VAPID_KEY=
```

Se obtiene en Firebase Console, en el proyecto de CRM:

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

- `POST /api/notifications/tokens`: registra o actualiza el token del
  dispositivo del usuario autenticado.
- `DELETE /api/notifications/tokens`: desactiva el token del dispositivo del
  usuario autenticado.
- `POST /api/notifications/send`: envia una notificacion a usuarios por
  `userIds`. Solo perfiles de gestion/admin.

Payload de envio:

```json
{
	"userIds": ["uid-del-usuario"],
	"title": "CRM Multimedio",
	"body": "Tenes una nueva tarea pendiente.",
	"link": "/tasks",
	"data": {
		"type": "task"
	}
}
```

## Web

El service worker se sirve desde `/firebase-messaging-sw.js` con la
configuracion Firebase tomada de variables de entorno. El usuario activa
notificaciones desde el menu del avatar. Si el permiso ya estaba otorgado, el
token se registra automaticamente al ingresar.

## Mobile

La app usa `expo-notifications` para obtener el token nativo del dispositivo con
`getDevicePushTokenAsync`, que en Android corresponde a FCM. El registro corre
despues de validar la sesion mobile. Si el usuario niega permisos, la app sigue
operando sin push en ese dispositivo.

Para Android, `app.json` declara `POST_NOTIFICATIONS` y configura el canal
`default`; por eso hay que reconstruir el APK despues de este cambio.

El APK Android tambien necesita incluir el `google-services.json` de la app
Firebase Android `com.airedesantafe.crm`. Ese archivo no se versiona en Git.
Para build local:

```powershell
cd C:\Users\leand\Documents\api\mobile
$env:GOOGLE_SERVICES_JSON_PATH="C:\Users\leand\Downloads\google-services.json"
npm run build:android:apk:local
```

El script copia ese archivo temporalmente a `mobile/google-services.json` antes
de `expo prebuild`. El archivo esta ignorado por Git.

Una vez instalado el APK, en la pantalla Inicio toca **Activar notificaciones**.
Si Android no muestra popup puede ser normal en versiones anteriores a Android
13; lo importante es que el boton muestre "Notificaciones activadas" y luego
aparezca un documento `platform: android` en `notificationTokens`.

