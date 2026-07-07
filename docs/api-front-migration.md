# Migracion API + Front

## Objetivo

Separar progresivamente la aplicacion en una capa de API segura y un front mas liviano. El front conserva Firebase Auth para iniciar sesion, pero deja de consultar Firestore directamente para reglas de negocio, permisos y datos sensibles.

## Estado inicial

- La app usa Next App Router.
- Existen rutas API para tareas puntuales: Gmail, Calendar, Tango, cron y administracion de usuarios.
- La mayor parte del acceso a Firestore esta concentrada en `src/lib/firebase-service.ts`, marcado como `use client`.
- Muchas paginas son componentes cliente porque importan directamente ese servicio.

## Primer corte aplicado

- Se agrego `/api/auth/session` para validar el token de Firebase en servidor.
- El servidor decide si el usuario esta autorizado por dominio, excepcion, usuario externo gestionado o lista blanca.
- El servidor devuelve el perfil y los permisos iniciales.
- `use-auth.tsx` ya no importa `firebase-service` para iniciar la sesion.
- `src/lib/api-client.ts` queda como base para llamadas autenticadas a la API.

## Segundo corte aplicado

- Se agregaron endpoints para usuarios: `/api/users` y `/api/users/[userId]`.
- Se agregaron endpoints de sistema: `/api/system/permissions` y `/api/system/email-whitelist`.
- `getAllUsers`, `getUserProfile`, `getUserById`, `updateUserProfile`, `getAreaPermissions`, `updateAreaPermissions`, `getEmailWhitelist` y `updateEmailWhitelist` pasan por API.
- `firebase-service.ts` mantiene compatibilidad temporal para no migrar todas las pantallas al mismo tiempo.
- No se tocaron `firestore.rules`, para no afectar la version productiva actual.

## Tercer corte aplicado

- Se agregaron endpoints base para clientes: `/api/clients`, `/api/clients/[clientId]` y `/api/clients/bulk`.
- `getClients`, `getClient`, `createClient`, `updateClient`, `deleteClient`, `bulkDeleteClients` y `bulkUpdateClients` pasan por API.
- Las cascadas de borrado de clientes, oportunidades, contactos, actividades e invoices asociadas se ejecutan en servidor.
- Quedan pendientes endpoints especificos para `updateClientTangoMapping`, merge de clientes y datos relacionados de carpeta/actividad.

## Cuarto corte aplicado

- Se agrego `/api/clients/[clientId]/tango-mapping` para actualizar datos Tango desde servidor.
- Se agrego `/api/clients/merge` para fusionar clientes duplicados y mover entidades relacionadas desde servidor.
- Se agrego `/api/clients/[clientId]/advertising-orders` para listar ordenes de publicidad por cliente sin leer Firestore desde la pantalla de carpeta.
- `updateClientTangoMapping`, `mergeClients` y `getAdvertisingOrdersByClientId` pasan por API.
- La pagina `/carpeta/[clientId]` ya no importa Firestore client para consultar ordenes.
- `firestore.rules` sigue intacto.

## Quinto corte aplicado

- Se agregaron endpoints relacionados a cliente:
  - `/api/clients/[clientId]/opportunities`
  - `/api/clients/[clientId]/invoices`
  - `/api/clients/[clientId]/billing-requests`
  - `/api/clients/[clientId]/people`
  - `/api/clients/[clientId]/activities`
- `getOpportunitiesByClientId`, `getInvoicesForClient`, `getBillingRequestsByClient`, `getPeopleByClientId` y `getClientActivities` pasan por API.
- Esto reduce lecturas directas desde `client-details`, `carpeta` y formularios que necesitan datos del cliente.
- `firestore.rules` sigue intacto.

## Sexto corte aplicado

- Se agregaron endpoints para contactos:
  - `/api/people`
  - `/api/people/[personId]`
- `createPerson`, `updatePerson` y `deletePerson` pasan por API.
- La escritura de contactos, actualizacion de `personIds` en cliente y logging de actividad se ejecutan en servidor.
- `firestore.rules` sigue intacto.

## Septimo corte aplicado

- Se agregaron endpoints para actualizaciones de actividades:
  - `/api/client-activities/[activityId]`
  - `/api/client-activities/[activityId]/complete`
  - `/api/client-activities/[activityId]/reschedule`
- `updateClientActivity`, `completeActivityTask` y `rescheduleActivityTask` pasan por API.
- `createClientActivity` queda temporalmente en el cliente porque dispara actualizaciones automaticas de coaching; se migrara junto con la logica de coaching para no perder comportamiento.
- `firestore.rules` sigue intacto.

## Octavo corte aplicado

- Se agrego `/api/opportunities` para lecturas de oportunidades.
- `getOpportunities`, `getAllOpportunities` y `getOpportunitiesForUser` pasan por API.
- Las mutaciones de oportunidades quedan pendientes para un corte propio, porque disparan actualizaciones de pauta, coaching, facturacion y actividad.
- `firestore.rules` sigue intacto.

## Noveno corte aplicado

- Se agrego `/api/agencies` para listar y crear agencias desde servidor.
- Se agrego `/api/system/workflow-assignments` para leer y guardar responsabilidades del sistema.
- `getAgencies`, `createAgency`, `getWorkflowAssignments` y `saveWorkflowAssignments` pasan por API.
- `firestore.rules` sigue intacto.

## Decimo corte aplicado

- Se agrego `/api/programs` y `/api/programs/[programId]`.
- `getPrograms`, `getProgram`, `saveProgram`, `updateProgram` y `deleteProgram` pasan por API.
- El servidor mantiene compatibilidad con programas legacy que usan `daysOfWeek`, `startTime` y `endTime` en lugar de `schedules`.
- Las mutaciones de grilla/commercial items quedan pendientes para un corte propio.
- `firestore.rules` sigue intacto.

## Undecimo corte aplicado

- Se agregaron endpoints para grilla/comerciales:
  - `/api/commercial-items`
  - `/api/commercial-items/[itemId]`
  - `/api/commercial-items/series`
  - `/api/commercial-items/series/[seriesId]`
  - `/api/commercial-items/bulk-delete`
- `getCommercialItems`, `getCommercialItemsBySeries`, `saveCommercialItemSeries`, `createCommercialItem`, `updateCommercialItem` y `deleteCommercialItem` pasan por API.
- Las pantallas `/grilla` y `/pnts` conservan sus llamadas actuales mediante el puente temporal de `firebase-service.ts`.
- La creacion/edicion/borrado de elementos comerciales y series queda centralizada en servidor con Firebase Admin y registro de actividad.
- `firestore.rules` sigue intacto.

## Duodecimo corte aplicado

- Se agrego `/api/canjes` y `/api/canjes/[canjeId]` para listar, crear, actualizar y eliminar necesidades/canjes desde servidor.
- Se agregaron lecturas relacionadas:
  - `/api/canjes/[canjeId]/advertising-orders`
  - `/api/canjes/[canjeId]/invoices`
- `getCanjes`, `createCanje`, `updateCanje`, `deleteCanje`, `getAdvertisingOrdersByCanjeId` y `getInvoicesByCanjeId` pasan por API.
- La pantalla `/canjes`, el modal de canje y la integracion legacy conservan sus llamadas actuales mediante el puente temporal de `firebase-service.ts`.
- `firestore.rules` sigue intacto.

## Decimotercer corte aplicado

- Se agrego `/api/pnts/scheduled` para exponer a Programacion los PNTs cargados en ordenes de publicidad vigentes.
- La pantalla `/pnts` ahora muestra, por dia y programa, los PNTs comprometidos en ordenes aunque todavia no exista el texto cargado en la grilla.
- Estos PNTs se muestran como pendientes de orden de publicidad y no se pueden marcar como leidos ni eliminar hasta que se cargue el texto real.
- `firestore.rules` sigue intacto.

## Decimocuarto corte aplicado

- Se agrego `/api/advertising-orders` y `/api/advertising-orders/[orderId]` para lecturas de ordenes de publicidad.
- `getAdvertisingOrdersByOpportunity`, `getAdvertisingOrdersWithEvent`, `getAdvertisingOrder`, `getRecentAdvertisingOrders` y `getAdvertisingOrdersForDateRange` pasan por API.
- Esto cubre lecturas usadas por oportunidad, publicidad, notas, redes, eventos de billing y acciones vigentes.
- Las mutaciones de ordenes de publicidad quedan pendientes para un corte propio porque actualizan billing, canjes, historial, auditoria y relaciones.
- `firestore.rules` sigue intacto.

## Decimoquinto corte aplicado

- Se agrego `/api/approvals` para centralizar la bandeja unificada de aprobaciones.
- La pantalla `/approvals` ya no consulta Firestore directo para listar notas comerciales, pedidos de redes, ordenes de publicidad y notas web.
- Aprobar o devolver documentos tambien pasa por `/api/approvals`, con actualizacion de estado, comentarios e historial en servidor.
- La generacion de PDFs y envio de emails sigue en el front porque depende del DOM renderizado y del token Google del usuario.
- `firestore.rules` sigue intacto.

## Decimosexto corte aplicado

- Se agrego `/api/billing-requests/order/[orderId]` para leer solicitudes de facturacion asociadas a una orden desde servidor.
- `getBillingRequestsByOrder` pasa por API.
- Esto reduce lecturas directas en aprobaciones, visor de publicidad y formulario de publicidad al hidratar datos de facturacion de una orden.
- `firestore.rules` sigue intacto.

## Decimoseptimo corte aplicado

- Se agregaron borrados por API para listados operativos:
  - `/api/commercial-notes/[noteId]`
  - `/api/social-media-requests/[requestId]`
  - `DELETE /api/advertising-orders/[orderId]`
- Las pantallas `/notas`, `/redes` y `/publicidad` ya no importan Firestore directo para eliminar registros.
- `deleteCommercialNote`, `deleteSocialMediaRequest` y `deleteAdvertisingOrder` pasan por API con registro de actividad en servidor.
- `firestore.rules` sigue intacto.

## Proximos cortes recomendados

1. Clientes avanzados
   - Mover `createClientActivity` junto con la logica de coaching automatico.
   - Actualizar `/clients` y componentes relacionados para importar desde `src/lib/api/*` directamente cuando el puente este estable.

2. Oportunidades
   - Migrar mutaciones: `createOpportunity`, `updateOpportunity`, `deleteOpportunity`.
   - Centralizar reglas de permisos por rol/area en servidor.

3. Facturacion y cobranzas
   - Mover operaciones masivas y cambios de estado a endpoints transaccionales.
   - Evitar que el front tenga acceso directo a colecciones financieras.

4. Limpieza final
   - Reducir `firebase-service.ts` hasta que quede solo compatibilidad temporal o eliminarlo.
   - Revisar reglas de Firestore al final de la migracion, cuando la nueva version este lista para reemplazar a la actual.
   - Convertir paginas que ya no necesitan estado local complejo en server components cuando tenga sentido.
