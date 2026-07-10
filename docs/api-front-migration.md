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

## Proximos cortes recomendados

1. Imports del front
   - Ir reemplazando importaciones desde `@/lib/firebase-service` por modulos `@/lib/api/*` en paginas y componentes.
   - Mantener el puente solo como compatibilidad temporal mientras se estabiliza la nueva version.

2. Permisos y validaciones
   - Endurecer validaciones por rol/area dentro de rutas API criticas.
   - Agregar pruebas de permisos para operaciones financieras, comerciales y de aprobacion.

3. Operaciones programadas
   - Evaluar si limpieza de actividades y tareas de mantenimiento deben quedar como rutas protegidas o jobs programados.
   - Documentar variables de entorno necesarias para Netlify/Vercel sin valores reales.

4. Limpieza final
   - Reducir o eliminar `firebase-service.ts` cuando el front consuma directamente las APIs.
   - Revisar reglas de Firestore al final de la migracion, cuando la nueva version este lista para reemplazar a la actual.
   - Convertir paginas que ya no necesitan estado local complejo en server components cuando tenga sentido.
