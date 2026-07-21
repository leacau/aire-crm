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

## Decimoctavo corte aplicado

- Se completo el flujo de Notas Comerciales por API:
  - `/api/commercial-notes`
  - `/api/commercial-notes/[noteId]`
  - `/api/commercial-notes/[noteId]/order-link`
- Crear, listar, leer, editar, vincular y desvincular notas comerciales ahora pasa por servidor con Firebase Admin.
- El registro de actividad de creacion, edicion y vinculacion queda centralizado en API.
- La lectura puntual de una nota se mantiene disponible para la vista publica existente por ID.
- `firestore.rules` sigue intacto.

## Decimonoveno corte aplicado

- Se completo el flujo de Pedidos de Redes por API:
  - `/api/social-media-requests`
  - `/api/social-media-requests/[requestId]`
  - `/api/social-media-requests/[requestId]/order-link`
- Crear, listar, leer, editar, vincular y desvincular pedidos de redes ahora pasa por servidor con Firebase Admin.
- La limpieza de campos segun tipo de contenido (Reel, Story o Carrusel) queda centralizada en API.
- Las pantallas `/redes` y `/publicidad/[id]` conservan sus llamadas actuales mediante el puente temporal.
- `firestore.rules` sigue intacto.

## Vigesimo corte aplicado

- Se completo el flujo de Notas Web / Gacetillas por API:
  - `/api/web-notes`
  - `/api/web-notes/[noteId]`
  - `/api/web-notes/[noteId]/order-link`
- Crear, listar, leer, editar, eliminar, vincular y desvincular notas web ahora pasa por servidor con Firebase Admin.
- El visor de ordenes de publicidad deja de consultar y borrar `web_notes` directo desde el front.
- Las pantallas de notas web y publicidad conservan sus llamadas actuales mediante el puente temporal.
- `firestore.rules` sigue intacto.

## Vigesimo primer corte aplicado

- Se extendio `/api/clients/[clientId]/tango-mapping` para marcar y deshacer sincronizaciones Tango desde servidor.
- La pantalla `/tango-mapping` deja de actualizar campos de `clients` directo desde Firestore para marcar sincronizado o quitar IDs Tango.
- Los campos permitidos para sincronizacion se validan en API con lista blanca.
- `firestore.rules` sigue intacto.

## Vigesimo segundo corte aplicado

- Se agrego `/api/client-activities` para listar actividades globales y crear nuevas actividades desde servidor.
- `getAllClientActivities` y `createClientActivity` pasan por API mediante el puente temporal.
- La autoria de nuevas actividades se toma del usuario autenticado en servidor, no de campos enviados por el navegador.
- La actualizacion automatica de coaching se conserva en el puente actual y queda pendiente para un corte especifico.
- `firestore.rules` sigue intacto.

## Vigesimo tercer corte aplicado

- Se agrego `/api/invoices` y `/api/invoices/[invoiceId]` para el CRUD basico de facturas.
- `getInvoices`, `getInvoicesForOpportunity`, `createInvoice`, `updateInvoice` y `deleteInvoice` pasan por API mediante el puente temporal.
- La creacion de facturas actualiza la estadistica mensual desde servidor cuando corresponde.
- Quedan pendientes para otro corte: dashboard/paginacion optimizada, borrado masivo y operaciones de cobranzas.
- `firestore.rules` sigue intacto.

## Vigesimo cuarto corte aplicado

- Se agrego `/api/payments` y `/api/payments/[paymentId]` para cobranzas/mora.
- `getPaymentEntries`, `getPendingPaymentEntries`, `replacePaymentEntriesForAdvisor`, `updatePaymentEntry`, `requestPaymentExplanation` y `deletePaymentEntries` pasan por API.
- La importacion por asesor, actualizacion de estado/notas, solicitud de aclaracion y borrado de pagos quedan centralizados en servidor.
- La pantalla `/billing` conserva sus llamadas actuales mediante el puente temporal.
- `firestore.rules` sigue intacto.

## Vigesimo quinto corte aplicado

- Se extendio `/api/opportunities` con creacion de oportunidades.
- `createOpportunity` pasa por API mediante el puente temporal.
- La validacion de vigencia para oportunidades ganadas, la verificacion del cliente y el registro de actividad quedan centralizados en servidor.
- La actualizacion automatica de coaching posterior a la creacion se conserva en el puente temporal y queda pendiente para un corte especifico.
- `firestore.rules` sigue intacto.

## Vigesimo sexto corte aplicado

- Se agrego `DELETE /api/opportunities/[opportunityId]` para eliminar oportunidades desde servidor.
- `deleteOpportunity` pasa por API mediante el puente temporal.
- El borrado elimina tambien las facturas asociadas a la oportunidad y registra actividad en servidor.
- La edicion completa de oportunidades queda pendiente para un corte propio por su logica de renovaciones, pautas, facturas pendientes y coaching.
- `firestore.rules` sigue intacto.

## Vigesimo septimo corte aplicado

- Se agrego `PATCH /api/opportunities/[opportunityId]` para editar oportunidades desde servidor.
- `updateOpportunity` pasa por API mediante el puente temporal.
- La API valida vigencias, renovaciones y cambios de etapa, elimina campos obsoletos y registra actividad en servidor.
- Cuando una oportunidad pasa a `Cerrado - Ganado`, la generacion de pautas comerciales asociadas tambien se ejecuta en servidor.
- La creacion de facturas pendientes vinculadas a la edicion de oportunidades queda centralizada en API.
- La actualizacion automatica de coaching queda temporalmente en el puente hasta migrar coaching completo.
- `firestore.rules` sigue intacto.

## Vigesimo octavo corte aplicado

- `createQuickOpportunity` deja de crear documentos directo desde el navegador.
- La creacion rapida reutiliza `/api/opportunities`, validando cliente y registrando actividad desde servidor.
- El puente temporal conserva la invalidacion de caches para no cambiar las pantallas actuales.
- Con este corte, las altas, ediciones y bajas de oportunidades quedan centralizadas en API.
- `firestore.rules` sigue intacto.

## Vigesimo noveno corte aplicado

- Se agrego `/api/pipeline-interactions` para listar, crear e importar interacciones de pipeline desde servidor.
- Se agrego `/api/pipeline-interactions/[interactionId]` para editar y eliminar interacciones desde servidor.
- `getPipelineInteractions`, `createPipelineInteraction`, `updatePipelineInteraction`, `deletePipelineInteraction` y `bulkCreatePipelineInteractions` pasan por API mediante el puente temporal.
- La API refuerza el acceso de gerencia/jefatura en servidor y registra la importacion masiva en actividades.
- `firestore.rules` sigue intacto.

## Trigesimo corte aplicado

- Se agregaron `/api/system/srl-ad-types` y `/api/system/sas-products` para configuracion comercial dinamica.
- `getSrlAdTypes`, `saveSrlAdTypes`, `getSasProducts` y `saveSasProducts` pasan por API mediante el puente temporal.
- La lectura queda disponible para usuarios autenticados y el guardado se restringe en servidor a perfiles de gestion.
- Los cambios de formatos SRL y productos SAS registran actividad desde API.
- `firestore.rules` sigue intacto.

## Trigesimo primer corte aplicado

- Se agrego `/api/system/holidays` para leer y guardar feriados del sistema desde servidor.
- Se agrego `/api/users/[userId]/monthly-closure` para registrar cierres mensuales desde servidor.
- `getSystemHolidays`, `saveSystemHolidays` y `saveMonthlyClosure` pasan por API mediante el puente temporal.
- El guardado de feriados y cierres mensuales queda restringido en servidor a perfiles de gestion.
- Los cambios registran actividad desde API.
- `firestore.rules` sigue intacto.

## Trigesimo segundo corte aplicado

- Se agrego `/api/prospects` para listar y crear prospectos desde servidor.
- Se agrego `/api/prospects/[prospectId]` para editar y eliminar prospectos desde servidor.
- `getProspects`, `createProspect`, `updateProspect` y `deleteProspect` pasan por API mediante el puente temporal.
- La autoria, auditoria de creacion/edicion/borrado y timestamps quedan centralizados en API.
- La actualizacion automatica de coaching queda temporalmente en el puente hasta migrar coaching completo.
- Reclamos, aprobaciones y liberacion masiva de prospectos quedan pendientes para un corte especifico.
- `firestore.rules` sigue intacto.

## Trigesimo tercer corte aplicado

- Se agregaron endpoints de acciones de prospectos:
  - `/api/prospects/notifications`
  - `/api/prospects/bulk-release`
  - `/api/prospects/[prospectId]/claim`
  - `/api/prospects/[prospectId]/claim/approve`
  - `/api/prospects/[prospectId]/claim/reject`
- `recordProspectNotifications`, `bulkReleaseProspects`, `claimProspect`, `approveProspectClaim` y `rejectProspectClaim` pasan por API.
- Las reglas de reclamo, aprobacion, rechazo y liberacion quedan centralizadas en servidor con auditoria en actividades.
- `firestore.rules` sigue intacto.

## Trigesimo cuarto corte aplicado

- Se agregaron `/api/system/opportunity-alerts` y `/api/system/objective-visibility`.
- `getOpportunityAlertsConfig`, `updateOpportunityAlertsConfig`, `getObjectiveVisibilityConfig` y `updateObjectiveVisibilityConfig` pasan por API.
- La lectura queda disponible para usuarios autenticados y el guardado queda restringido a perfiles de gestion.
- Los cambios se auditan desde servidor.
- `firestore.rules` sigue intacto.

## Trigesimo quinto corte aplicado

- Se agrego `/api/activities` para listar actividad general, actividad de pagos e historial relacionado a clientes desde servidor.
- `getActivities`, `getPaymentActivities` y `getActivitiesForEntity` pasan por API mediante el puente temporal.
- El historial de cliente se arma en servidor incluyendo actividad directa, oportunidades y personas relacionadas.
- `firestore.rules` sigue intacto.

## Trigesimo quinto bis aplicado

- Se extendio `POST /api/activities` para registrar actividades desde servidor.
- `logActivity` deja de escribir directo en Firestore y pasa por API.
- Los logs remanentes de modulos todavia no migrados quedan protegidos por autenticacion server-side.
- `firestore.rules` sigue intacto.

## Trigesimo sexto corte aplicado

- Se agrego `/api/supervisor-comments` para listar y crear comentarios de supervision.
- Se agregaron endpoints para borrar hilos, responder y marcar vistos.
- `getSupervisorCommentsForEntity`, `getSupervisorCommentThreadsForUser`, `createSupervisorComment`, `replyToSupervisorComment`, `markSupervisorCommentThreadSeen` y `deleteSupervisorCommentThread` pasan por API.
- La autoria de comentarios y respuestas se toma del usuario autenticado en servidor.
- `firestore.rules` sigue intacto.

## Trigesimo septimo corte aplicado

- Se extendio `/api/users` para crear perfiles de usuario desde servidor.
- Se extendio `/api/users/[userId]` con borrado y desasignacion de clientes/prospectos desde servidor.
- `createUserProfile`, `syncRegisteredUsersFromAuth`, `createExternalCanjeUser` y `deleteUserAndReassignEntities` pasan por API.
- El puente temporal elimina fetches manuales y escrituras directas de usuarios.
- `firestore.rules` sigue intacto.

## Trigesimo octavo corte aplicado

- Se agrego `/api/vacation-requests` para listar y crear solicitudes de licencia desde servidor.
- Se agregaron endpoints para editar, eliminar, aprobar, rechazar y anular licencias:
  - `/api/vacation-requests/[requestId]`
  - `/api/vacation-requests/[requestId]/status`
  - `/api/vacation-requests/[requestId]/annul`
- Se agrego `/api/users/[userId]/vacation-days` para ajustar saldos de licencia desde servidor.
- `getVacationRequests`, `createVacationRequest`, `updateVacationRequest`, `approveVacationRequest`, `annulVacationRequest`, `deleteVacationRequest`, `adjustVacationDays` y `addVacationDays` pasan por API.
- El calculo de dias habiles, la retencion/reintegro de saldos y las validaciones de gestion quedan centralizadas en servidor.
- Al eliminar una licencia pendiente o aprobada, la API reintegra los dias retenidos para evitar saldos inconsistentes.
- `firestore.rules` sigue intacto.

## Trigesimo noveno corte aplicado

- Se agrego `/api/coaching-sessions` para listar y crear sesiones de seguimiento desde servidor.
- Se agregaron endpoints para editar/cerrar/eliminar sesiones, administrar items y administrar bitacoras por item:
  - `/api/coaching-sessions/[sessionId]`
  - `/api/coaching-sessions/[sessionId]/items`
  - `/api/coaching-sessions/[sessionId]/items/[itemId]`
  - `/api/coaching-sessions/[sessionId]/items/[itemId]/entries`
  - `/api/coaching-sessions/[sessionId]/items/[itemId]/entries/[entryId]`
- `getCoachingSessions`, `createCoachingSession`, `updateCoachingSession`, `deleteCoachingSession`, `updateCoachingItem`, `deleteCoachingItem`, `addItemsToSession`, `appendCoachingFollowUpEntry`, `updateCoachingFollowUpEntry` y `deleteCoachingFollowUpEntry` pasan por API.
- La vista de Seguimiento conserva el puente temporal, pero las operaciones manuales principales quedan autenticadas y transaccionadas en servidor.
- La actualizacion automatica de coaching desde oportunidades, prospectos y actividades queda como proximo corte para no mezclar dos flujos grandes.
- `firestore.rules` sigue intacto.

## Cuadragesimo corte aplicado

- Se agrego `/api/coaching-sessions/auto-update` para centralizar la actualizacion automatica de seguimiento.
- `autoUpdateCoachingSession` pasa por API y deja de escribir desde el navegador en `coaching_sessions` y `coaching_active_index`.
- Los disparadores desde prospectos, oportunidades y actividades mantienen la misma interfaz, pero ahora actualizan/crean sesiones, items y entradas desde servidor.
- Se quitaron helpers directos de indice activo que ya no se usan en el puente temporal.
- `firestore.rules` sigue intacto.

## Cuadragesimo primer corte aplicado

- Se extendio `/api/advertising-orders` con creacion de ordenes de publicidad desde servidor.
- Se extendio `/api/advertising-orders/[orderId]` con edicion de ordenes desde servidor.
- `createAdvertisingOrder` y `updateAdvertisingOrder` pasan por API mediante el puente temporal.
- La creacion/renovacion de pedidos de facturacion SRL, SAS y AVION queda centralizada en servidor junto con la orden.
- La auditoria de modificaciones de ordenes aprobadas, historial de revision y recalculo comparativo queda centralizada en servidor.
- `firestore.rules` sigue intacto.

## Cuadragesimo segundo corte aplicado

- Se agrego `/api/billing-requests` para listar pedidos de facturacion con metadata de orden, asesor y cliente desde servidor.
- Se agrego `/api/billing-requests/[requestId]` para cambiar estado y numero de factura desde servidor.
- `getAllBillingRequestsWithMetadata` y el impacto de `updateBillingRequestStatus` pasan por API.
- El puente mantiene el envio de correos contables con Gmail, pero ya no lee ni actualiza `billing_requests` directo desde el navegador.
- `firestore.rules` sigue intacto.

## Cuadragesimo tercer corte aplicado

- Se agrego `/api/convenios` para listar y crear convenios de canje desde servidor.
- Se agrego `/api/convenios/[convenioId]` para editar y eliminar convenios desde servidor.
- Se agrego `/api/convenios/migrate-to-canjes` para migrar convenios legacy a canjes nuevos desde servidor.
- `saveConvenioCanje`, `getConveniosCanje`, `updateConvenioCanje`, `deleteConvenioCanje` y `migrateLegacyConveniosToCanjes` pasan por API.
- El borrado de convenios elimina desde servidor la oportunidad asociada, ordenes de publicidad e invoices colgantes.
- `firestore.rules` sigue intacto.

## Cuadragesimo cuarto corte aplicado

- Se agrego `/api/monthly-billing-stats` para actualizar estadisticas mensuales desde servidor.
- Se agrego `/api/client-activities/cleanup-old` para limpiar actividades completadas antiguas desde servidor.
- `updateMonthlyBillingStat` y `cleanupOldActivities` pasan por API mediante el puente temporal.
- `firebase-service.ts` queda sin escrituras directas detectables por `addDoc`, `updateDoc`, `deleteDoc`, `setDoc`, `writeBatch` o `runTransaction`.
- `firestore.rules` sigue intacto.

## Cuadragesimo quinto corte aplicado

- Se agregaron filtros API para datos de dashboard en `/api/invoices?dashboard=true` y `/api/client-activities?tasks=true`.
- Se agrego `GET /api/opportunities/[opportunityId]` para cargar una oportunidad individual desde servidor.
- `getDashboardInvoices`, `getDashboardTasks`, `getOpportunityById` y el helper legacy `getInvoicesPaginated` pasan por API mediante el puente temporal.
- Se quitaron colecciones locales, helpers de lectura directa e imports del SDK de Firestore desde `firebase-service.ts`.
- Las pantallas de Nota Comercial, Nota Web y Redes dejan de usar `arrayUnion` del SDK cliente; el historial de aprobacion se agrega desde las APIs de actualizacion.
- En `src`, la unica importacion restante de `firebase/firestore` es la inicializacion de Firestore en `src/lib/firebase.ts`.
- `firestore.rules` y `netlify.toml` siguen intactos.

## Cuadragesimo sexto corte aplicado

- Las pantallas y formularios de Nota Comercial, Nota Web y Redes empiezan a importar directo desde `src/lib/api/*` en lugar de `firebase-service.ts`.
- Se ajustaron llamadas de guardado, edicion y borrado para depender del usuario autenticado en servidor, sin pasar `userId`/`userName` desde el front.
- Se agrego `/api/public/programs` para que la vista publica de notas pueda resolver nombres de programas sin sesion y sin exponer datos de edicion.
- La vista publica de nota comercial usa `getPublicPrograms`; las vistas autenticadas siguen usando `/api/programs`.
- `firestore.rules` y `netlify.toml` siguen intactos.

## Cuadragesimo septimo corte aplicado

- Se migraron lecturas simples de usuarios, clientes, programas, configuraciones, reportes, calendario, settings y sidebar para importar directo desde `src/lib/api/*`.
- Se migraron Tareas y Feed de Actividad a `activities`, `client-activities` y `users`, quitando parametros de usuario que ahora resuelve el servidor.
- Se migraron Carpeta y componentes relacionados a APIs directas de clientes, oportunidades, facturas y billing requests.
- Se migraron Programacion/Grilla/PNTs a APIs directas de programas, commercial items y clientes.
- La bandeja de Billing Requests conserva `updateBillingRequestStatus` via puente temporal porque aun contiene el despacho de correos contables con Gmail.
- Los imports a `firebase-service.ts` bajan de 70 a 34 en `src`.
- `firestore.rules` y `netlify.toml` siguen intactos.

## Cuadragesimo octavo corte aplicado

- Se migraron Pipeline, Data Cleanup, Canjes, Tango Mapping, Approvals, Objectives, Publicidad listado/viewer, Clientes listado/formulario e Importacion a clientes API directos cuando no habia efectos secundarios pendientes.
- Se migraron Licencias a `api/vacation-requests` y `api/users`; el calculo de dias habiles queda local al formulario y los feriados salen de `api/system`.
- Se migraron lecturas/acciones seguras de Prospects a `api/prospects`, `api/client-activities`, `api/system` y `api/users`; create/update/delete siguen en puente por actualizacion automatica de coaching.
- Dashboard importa directo desde APIs para usuarios, clientes, agencias, tareas, facturas y pagos; conserva el puente para el agregador de reportes y update de oportunidad.
- Los imports a `firebase-service.ts` bajan de 34 a 16 en `src`.
- `firestore.rules` y `netlify.toml` siguen intactos.

## Cuadragesimo noveno corte aplicado

- Se endurecio `apiRequest` para esperar la hidratacion de Firebase Auth antes de llamar APIs protegidas.
- Ante una respuesta 401, el cliente fuerza un refresco del ID token y reintenta la solicitud una vez antes de mostrar error.
- Esto estabiliza pantallas ya migradas a API directa, como Contable/Facturas, Administracion/Mapeo Tango, clientes, agencias, tareas y usuarios.
- `firestore.rules` y `netlify.toml` siguen intactos.

## Quincuagesimo corte aplicado

- Contable deja de importar lecturas y acciones principales desde `firebase-service.ts` y consume `clients`, `invoices`, `opportunities`, `payments` y `users` desde `src/lib/api/*`.
- Se movio `deleteInvoicesInBatches` a `src/lib/api/invoices.ts`, reutilizando el borrado API individual y conservando progreso por lote.
- La carga manual de facturas crea oportunidades rapidas por API directa en lugar de pasar por el puente temporal.
- Los imports a `firebase-service.ts` bajan de 16 a 13 en `src`.
- `firestore.rules` y `netlify.toml` siguen intactos.

## Quincuagesimo primer corte aplicado

- La pagina de detalle de cliente consume `clients`, `opportunities` e `invoices` desde APIs directas.
- El kanban de oportunidades consume `clients`, `opportunities` y `users` desde APIs directas.
- Se elimino la dependencia del cache local del puente en el boton de recarga del kanban; ahora vuelve a leer desde la API.
- Los imports a `firebase-service.ts` bajan de 13 a 10 en `src`.
- `firestore.rules` y `netlify.toml` siguen intactos.

## Quincuagesimo segundo corte aplicado

- Prospectos deja de importar `createProspect`, `updateProspect`, `deleteProspect` y `autoUpdateCoachingSession` desde el puente temporal.
- Las altas, ediciones, archivado, conversion y asignacion manual de prospectos consumen APIs directas.
- El agregado automatico a seguimiento usa `src/lib/api/coaching`.
- Los imports a `firebase-service.ts` bajan de 10 a 9 en `src`.
- `firestore.rules` y `netlify.toml` siguen intactos.

## Quincuagesimo tercer corte aplicado

- App Canjes deja de importar desde `firebase-service.ts`.
- El flujo movil de canjes consume APIs directas para clientes, programas, prospectos, oportunidades, convenios, canjes y ordenes de publicidad.
- La edicion de ordenes conserva la firma con datos de usuario que aun exige `src/lib/api/advertising-orders`.
- Los imports a `firebase-service.ts` bajan de 9 a 8 en `src`.
- `firestore.rules` y `netlify.toml` siguen intactos.

## Quincuagesimo cuarto corte aplicado

- Se agrego `/api/reports/advisors` para generar los datos del reporte de asesores desde servidor.
- `Dashboard` deja de importar `updateOpportunity` y `getReportDataForAdvisors` desde `firebase-service.ts`.
- El reporte cruza asesores, clientes, oportunidades activas, mora pendiente y seguimiento abierto en la API.
- Los imports a `firebase-service.ts` bajan de 8 a 7 en `src`.
- `firestore.rules` y `netlify.toml` siguen intactos.

## Quincuagesimo quinto corte aplicado

- Seguimiento/Coaching deja de importar desde `firebase-service.ts`.
- La vista usa APIs directas para sesiones, items, bitacoras, clientes y prospectos.
- El boton de refresco vuelve a consultar la API y deja de depender de invalidacion de cache local.
- Los imports a `firebase-service.ts` bajan de 7 a 6 en `src`.
- `firestore.rules` y `netlify.toml` siguen intactos.

## Quincuagesimo sexto corte aplicado

- El detalle de cliente deja de importar desde `firebase-service.ts`.
- Personas, actividades, historial, oportunidades, facturas, notas comerciales, programas y usuarios se cargan desde APIs directas.
- Las actualizaciones y borrados desde la ficha del cliente ya no pasan userId/userName desde el front cuando la API lo resuelve en servidor.
- Los imports a `firebase-service.ts` bajan de 6 a 5 en `src`.
- `firestore.rules` y `netlify.toml` siguen intactos.

## Quincuagesimo septimo corte aplicado

- El dialogo de oportunidad deja de importar desde `firebase-service.ts`.
- Agencias, facturas, ordenes de publicidad, programas, comentarios de supervision y coaching usan APIs directas.
- La edicion de vigencias y la gestion de facturas dentro del dialogo ya delegan usuario/auditoria al servidor.
- Los imports a `firebase-service.ts` bajan de 5 a 4 en `src`.
- `firestore.rules` y `netlify.toml` siguen intactos.

## Quincuagesimo octavo corte aplicado

- Publicidad deja de importar desde `firebase-service.ts` en el formulario y en el detalle de orden.
- El formulario usa APIs directas para clientes, agencias, programas, oportunidades, ordenes, billing requests, usuarios y workflow.
- El detalle de orden usa APIs directas para ordenes, billing requests, programas, notas comerciales, redes y notas web.
- Los vinculos y desvinculos de acciones asociadas a la orden delegan usuario/auditoria al servidor.
- Los imports a `firebase-service.ts` bajan de 4 a 2 en `src`.
- `firestore.rules` y `netlify.toml` siguen intactos.

## Quincuagesimo noveno corte aplicado

- Billing Requests deja de importar `updateBillingRequestStatus` desde `firebase-service.ts`.
- El modulo `src/lib/api/billing-requests.ts` conserva el cambio de estado por API y absorbe el despacho de correos contables con token Google.
- El puente temporal mantiene compatibilidad sin duplicar correos si algun flujo legacy lo llama.
- Los imports a `firebase-service.ts` bajan de 2 a 1 en `src`.
- `firestore.rules` y `netlify.toml` siguen intactos.

## Sexagesimo corte aplicado

- Commander deja de depender de `firebase-service.ts`.
- Se agrega `src/lib/server/commander-crm.ts` para que el asistente cree clientes, prospectos y tareas desde servidor con Firebase Admin.
- Se conserva el registro de actividad y la actualizacion automatica de coaching para prospectos y tareas.
- Los imports a `firebase-service.ts` bajan de 1 a 0 en `src`.
- `firestore.rules` y `netlify.toml` siguen intactos.

## Sexagesimo primer corte aplicado

- `src/lib/permissions.ts` deja de cargar permisos desde el puente legacy y usa `src/lib/api/system.ts`.
- Se elimina `src/lib/firebase-service.ts` porque ya no tiene consumidores en `src`.
- La separacion API/front queda sin dependencias directas del servicio cliente legacy.
- `firestore.rules` y `netlify.toml` siguen intactos.

## Sexagesimo segundo corte aplicado

- El registro de actividad del modulo Contable deja de importar `src/lib/activity-logger.ts`.
- `logActivity` queda consolidado en `src/lib/api/activities.ts`.
- Se elimina el wrapper legacy `src/lib/activity-logger.ts`.
- `firestore.rules` y `netlify.toml` siguen intactos.

## Sexagesimo tercer corte aplicado

- Se elimina el listener global `FirebaseErrorListener`, que ya no tenia emisores activos tras retirar `firebase-service.ts`.
- Se eliminan `src/firebase/error-emitter.ts` y `src/firebase/errors.ts`.
- El layout queda sin componentes de diagnostico legacy asociados a reglas cliente de Firestore.
- `firestore.rules` y `netlify.toml` siguen intactos.

## Sexagesimo cuarto corte aplicado

- Se agrega `apiFetch` en `src/lib/api-client.ts` para llamadas autenticadas con respuesta cruda.
- Mapeo Tango, Collections y las vistas de facturas Tango dejan de construir headers `Bearer` manualmente.
- Los servicios cliente de Gmail/Calendar y facturacion de objetivos Tango reutilizan la misma autenticacion API con reintento ante 401.
- `firestore.rules` y `netlify.toml` siguen intactos.

## Sexagesimo quinto corte aplicado

- Commander completa el agendado de tareas para clientes, ademas de prospectos.
- `src/lib/server/commander-crm.ts` expone lectura servidor de clientes para resolver coincidencias por denominacion o razon social.
- Se elimina el TODO de busqueda de clientes en `scheduleTask`.
- `firestore.rules` y `netlify.toml` siguen intactos.

## Sexagesimo sexto corte aplicado

- Las operaciones masivas de clientes (`/api/clients/bulk`) pasan a requerir permisos de gestion/admin en servidor.
- La API queda alineada con la UI, que ya limita seleccion masiva, reasignacion y borrado a perfiles de gestion.
- `firestore.rules` y `netlify.toml` siguen intactos.

## Sexagesimo septimo corte aplicado

- La importacion y eliminacion masiva de mora (`POST` y `DELETE` en `/api/payments`) pasan a requerir permisos de gestion/admin.
- La actualizacion puntual de registros de mora conserva autenticacion de usuario para no bloquear el seguimiento operativo.
- `firestore.rules` y `netlify.toml` siguen intactos.

## Sexagesimo octavo corte aplicado

- Se elimina `/api/monthly-billing-stats` y su cliente `src/lib/api/monthly-billing-stats.ts` porque ya no tienen consumidores.
- Las estadisticas mensuales quedan actualizadas desde las rutas de facturas y oportunidades, junto con la creacion de comprobantes.
- Se reduce superficie financiera expuesta sin cambiar flujos de pantalla.
- `firestore.rules` y `netlify.toml` siguen intactos.

## Sexagesimo noveno corte aplicado

- La limpieza de actividades antiguas completadas (`/api/client-activities/cleanup-old`) pasa a requerir permisos de gestion/admin.
- Dashboard solo dispara esa limpieza automatica para perfiles de gestion, evitando errores 403 en areas livianas.
- `firestore.rules` y `netlify.toml` siguen intactos.

## Septuagesimo corte aplicado

- Billing Requests filtra en servidor: gestion/receptores ven toda la bandeja, asesores solo sus pedidos.
- Los cambios de estado de pedidos de facturacion validan el workflow en API: asesor solicita, receptor eleva y receptor/facturador asienta comprobante.
- La pantalla de Billing Requests alinea la vista completa con perfiles de gestion.
- Se centraliza la lectura normalizada de asignaciones de workflow en `src/lib/server/workflow-assignments.ts`.
- `firestore.rules` y `netlify.toml` siguen intactos.

## Septuagesimo primer corte aplicado

- Las rutas de detalle por cliente validan acceso en servidor con `src/lib/server/client-access.ts`.
- Actividades, oportunidades, facturas, personas, ordenes y pedidos asociados a un cliente ya no se exponen solo por conocer el `clientId`.
- Gestion/admin conserva acceso completo; asesores acceden a clientes propios.
- `firestore.rules` y `netlify.toml` siguen intactos.

## Septuagesimo segundo corte aplicado

- La creacion de clientes ya no acepta reasignacion de propietario desde usuarios sin permisos de gestion/admin.
- La edicion puntual de clientes valida en servidor que el usuario sea propietario o tenga permisos de gestion.
- La reasignacion de propietario y el borrado puntual de clientes quedan reservados a perfiles de gestion/admin.
- `firestore.rules` y `netlify.toml` siguen intactos.

## Septuagesimo tercer corte aplicado

- La ruta de mapeo Tango por cliente separa permisos: datos fiscales basicos quedan disponibles para el asesor propietario o gestion.
- La vinculacion de IDs Tango, el marcado de sincronizacion y la desvinculacion quedan reservados a gestion/admin.
- La pantalla de Mapeo Tango mantiene su contrato API sin exponer operaciones administrativas a cualquier sesion valida.
- `firestore.rules` y `netlify.toml` siguen intactos.

## Septuagesimo cuarto corte aplicado

- Se agrega `src/lib/server/screen-permissions.ts` para validar permisos de pantalla en API con la misma configuracion que usa el front.
- La creacion y eliminacion de programas requiere permiso de edicion sobre Grilla en servidor.
- La edicion de programas separa permisos: tarifas requiere Rates, y datos/schedules del programa requieren Grilla.
- `firestore.rules` y `netlify.toml` siguen intactos.

## Septuagesimo quinto corte aplicado

- Las escrituras de elementos comerciales de Grilla (`commercial-items`) validan permiso `Grilla/edit` en servidor.
- La creacion puntual, la edicion, el guardado de series y el borrado masivo dejan de depender solo del bloqueo visual del front.
- La lectura de elementos y series conserva autenticacion simple para no afectar la visualizacion de Programacion/Grilla.
- `firestore.rules` y `netlify.toml` siguen intactos.

## Septuagesimo sexto corte aplicado

- Las rutas de Coaching y actualizacion de ordenes de publicidad dejan de confiar en `userId`/`userName` enviados por el cliente para auditoria.
- Los logs y campos de actor usan la identidad verificada por `requireServerUser`, evitando suplantacion desde payloads del front.
- Se mantiene el contrato funcional de cada endpoint; solo cambia la fuente de verdad para la identidad del usuario.
- `firestore.rules` y `netlify.toml` siguen intactos.

## Septuagesimo septimo corte aplicado

- Las APIs de notas comerciales filtran resultados en servidor: gestion/revisores ven todo; asesores ven notas propias o de clientes propios.
- La creacion de notas ya no permite asignar otro asesor salvo perfiles de gestion/admin.
- La edicion y vinculacion con ordenes validan acceso a la nota antes de modificarla; el borrado queda reservado a gestion/admin.
- `firestore.rules` y `netlify.toml` siguen intactos.

## Septuagesimo octavo corte aplicado

- Se agrega `src/lib/server/advisor-scoped-access.ts` para reutilizar reglas de acceso en entidades con `advisorId` y `clientId`.
- Pedidos de Redes y Notas Web/Gacetillas filtran listados en servidor y validan acceso antes de leer, editar o vincular ordenes.
- La creacion de estos pedidos ya no permite reasignar asesor desde usuarios sin permisos de gestion/admin.
- Los borrados puntuales de Redes/Web quedan reservados a gestion/admin.
- `firestore.rules` y `netlify.toml` siguen intactos.

## Septuagesimo noveno corte aplicado

- La creacion de oportunidades valida en servidor que el cliente pertenezca al usuario o que tenga permisos de gestion/admin.
- La edicion de oportunidades requiere cliente propio o gestion/admin, bloqueando cambios de cliente y fecha de creacion para usuarios sin gestion.
- `manageContractPeriods` queda reservado a gestion/admin desde la API, no solo desde la UI.
- El borrado de oportunidades queda reservado a gestion/admin.
- `firestore.rules` y `netlify.toml` siguen intactos.

## Octogesimo corte aplicado

- Se agrega `src/lib/server/advertising-order-access.ts` para validar acceso a ordenes de publicidad por gestion/Pautado, creador o cliente propio.
- Los listados de ordenes se filtran en servidor segun acceso del usuario antes de responder al front.
- La creacion valida acceso al cliente y usa la identidad verificada para auditoria; usuarios sin gestion no pueden forzar `createdBy`.
- La lectura/edicion puntual valida acceso a la orden y el borrado queda reservado a gestion/admin.
- `firestore.rules` y `netlify.toml` siguen intactos.

## Octogesimo primer corte aplicado

- La creacion de agencias valida permiso `Opportunities/edit` en servidor.
- La lectura del catalogo de agencias conserva autenticacion simple para combos y pantallas operativas.
- El catalogo compartido deja de poder crecer desde cualquier sesion autenticada sin permiso comercial.
- `firestore.rules` y `netlify.toml` siguen intactos.

## Octogesimo segundo corte aplicado

- Se agrega `/api/tango/invoices/pdf` para descargar PDFs de facturas Tango desde servidor usando `TANGO_API_AUTHORIZATION`.
- La pestaña de facturas Tango suma un boton `PDF` por comprobante, tomando `Company` de la fila y `ID_GVA12` como `id`.
- La descarga queda reservada a perfiles de gestion/admin para no exponer comprobantes desde URLs directas a usuarios limitados por vendedor.
- `TANGO_INVOICE_PDF_PROCESS` permite sobrescribir el proceso de Tango; por defecto usa `14077`.
- `firestore.rules` y `netlify.toml` siguen intactos.

## Octogesimo tercer corte aplicado

- Se agrega `src/lib/server/invoice-access.ts` para validar mutaciones de facturas por oportunidad/cliente propio o gestion/admin.
- La creacion y edicion de facturas dejan de depender solo de una sesion valida.
- La reasignacion de oportunidad de una factura queda reservada a gestion/admin.
- El borrado valida acceso a la factura antes de eliminarla.
- `firestore.rules` y `netlify.toml` siguen intactos.

## Octogesimo cuarto corte aplicado

- La descarga de PDFs de facturas Tango usa exclusivamente `ID_GVA12` como parametro `id` para `/Api/GetPdf`.
- El numero de comprobante queda solo como dato visible de la tabla y ya no se usa como fallback para descargar.
- `firestore.rules` y `netlify.toml` siguen intactos.

## Octogesimo quinto corte aplicado

- El proxy `/api/tango/invoices/pdf` valida que Tango devuelva un PDF real antes de responder al front.
- Si Tango devuelve el PDF como base64, se decodifica en servidor y se entrega como `application/pdf`.
- Si Tango devuelve JSON, texto o HTML de error, la API responde un error legible en vez de descargar un archivo PDF corrupto.
- `firestore.rules` y `netlify.toml` siguen intactos.

## Octogesimo sexto corte aplicado

- Se revierte `/api/auth/session` al comportamiento previo para evitar sesiones parciales que luego generen 401 en el resto de las APIs.
- La descarga de PDF de Tango vuelve al flujo confirmado por curl: `GET /Api/GetPdf?process=14077&id=ID_GVA12`, headers `ApiAuthorization` y `Company`.
- El proxy lee la respuesta JSON de Tango, extrae `fileResult.fileContents`, convierte el base64 a binario y entrega `application/pdf`.
- Se retiran los reintentos con IDs derivados de `NRO_COMPROBANTE`, padding y procesos multiples.
- `firestore.rules` y `netlify.toml` siguen intactos.

## Octogesimo septimo corte aplicado

- `/api/auth/session` conserva token y perfil como validaciones obligatorias, pero usa `defaultPermissions` si falla la lectura/escritura de permisos globales.
- Los errores `auth/*` de Firebase Admin se responden como 401 para que el cliente fuerce refresh del ID token antes de cerrar sesion.
- El front ya no ejecuta `signOut` ante errores 500 de inicializacion de sesion; solo cierra sesion ante 401/403.
- `firestore.rules` y `netlify.toml` siguen intactos.

## Octogesimo octavo corte aplicado

- `requireServerUser` separa la verificacion del ID token de la lectura del perfil en Firestore.
- Si el token es valido pero falla la lectura del perfil, las APIs reciben un usuario minimo basado en Firebase Auth en vez de un falso `401 Invalid authentication token`.
- Las rutas que requieren gestion siguen protegidas porque el usuario minimo no obtiene rol administrativo.
- `firestore.rules` y `netlify.toml` siguen intactos.

## Octogesimo noveno corte aplicado

- `/api/auth/session` separa la verificacion del token del resto de lecturas Firestore.
- Si falla whitelist, permisos globales, lectura de perfil o creacion inicial del usuario, la sesion responde con fallbacks seguros en vez de devolver 500.
- El login solo debe fallar cuando Firebase Admin no puede verificar el ID token o cuando el correo no esta autorizado.
- `firestore.rules` y `netlify.toml` siguen intactos.

## Proximos cortes recomendados

1. Imports del front
   - Revisar flujos productivos en QA para confirmar que todas las pantallas consumen las APIs esperadas.
   - Mantener el seguimiento de regresiones sobre Contable, Publicidad, Programacion, Canjes y Commander.

2. Permisos y validaciones
   - Endurecer validaciones por rol/area dentro de rutas API criticas.
   - Agregar pruebas de permisos para operaciones financieras, comerciales y de aprobacion.

3. Operaciones programadas
   - Evaluar si limpieza de actividades y tareas de mantenimiento deben quedar como rutas protegidas o jobs programados.
   - Documentar variables de entorno necesarias para Netlify/Vercel sin valores reales.

4. Limpieza final
   - Revisar si quedan utilidades legacy sin uso luego de remover `firebase-service.ts`.
   - Revisar reglas de Firestore al final de la migracion, cuando la nueva version este lista para reemplazar a la actual.
   - Convertir paginas que ya no necesitan estado local complejo en server components cuando tenga sentido.
