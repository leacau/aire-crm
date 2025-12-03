# Plan de paridad para app móvil nativa

## Objetivos
- Lograr una app nativa (iOS/Android) con paridad funcional frente a la app web actual.
- Mantener autenticación, permisos, integraciones con Google Workspace y flujos de negocio.

## Autenticación y perfiles
- Reproducir Firebase Auth con los mismos proveedores y scopes (Google: Calendar, Gmail, Drive).
- Sustituir `signInWithPopup` por el flujo nativo de Google Sign-In; usar `signInWithCredential` para Firebase.
- Sincronizar perfiles y roles (`Asesor`, `Jefe`, `Gerencia`) desde Firestore.
- Guardar tokens de acceso/refresh en Keystore/Keychain y revocar sesión si falla la validación de servicios.

## Datos y servicios
- Portar las operaciones de `src/lib/firebase-service.ts` a SDKs nativos de Firestore/Storage.
- Conservar caché en memoria/local para listas de clientes, oportunidades, actividades, tareas y facturas.
- Replicar las validaciones de permisos por área y visibilidad de objetivos.
- Alinear reglas de negocio: auditoría de actividades, estados de tareas (`overdue`, `dueToday`, `dueTomorrow`) y filtros por rango de fechas.

## Integraciones de Google Workspace
- Implementar OAuth nativo con scopes avanzados y almacenamiento seguro de tokens.
- Calendar: crear/actualizar eventos para tareas y recordatorios; manejar redirecciones a la vista del evento.
- Gmail: enviar correos y loguear actividad; respetar el consentimiento y manejo de errores de la API.
- Drive: subir/descargar adjuntos asociados a clientes u oportunidades.

## UX y navegación
- Mapear vistas del dashboard en pestañas: métricas, tareas, clientes, oportunidades, facturación y reportes.
- Mantener filtros rápidos (mes actual, asesor responsable, estado) y acciones en línea (completar tarea, abrir cliente, ir a oportunidad).
- Usar listas performantes (FlatList/RecyclerView) con paginación y estados vacíos/loading.
- Incluir toasts/notificaciones locales para eventos clave (tarea vencida, nueva actividad, error de sincronización).

## Configuración y entornos
- Replicar variables `NEXT_PUBLIC_FIREBASE_*` en `google-services.json` (Android) y `GoogleService-Info.plist` (iOS).
- Asegurar que las reglas de Firestore existentes soporten los roles y operaciones móviles.
- Preparar entornos de prueba/staging con proyectos de Firebase separados y colección de datos semilla.

## Próximos pasos sugeridos
1. Extraer un inventario de operaciones desde `firebase-service.ts` y definir contratos de datos compartidos (TypeScript/JSON Schema).
2. Levantar un prototipo nativo con autenticación y lectura básica de clientes para validar conectividad y reglas.
3. Implementar gradualmente módulos: tareas/actividades → oportunidades/clientes → facturación → reportes.
4. Integrar Google Workspace y pruebas de flujo completo (login, acciones, sincronización y cierre de sesión).
