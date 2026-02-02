import { NextResponse } from 'next/server';
import { 
    getProspectsServer, 
    getAllClientActivitiesServer, 
    getSystemHolidaysServer, 
    bulkReleaseProspectsServer, 
    calculateBusinessDays 
} from '@/lib/server/cron-service';
import { parseISO, format } from 'date-fns';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
    try {
        const authHeader = request.headers.get('authorization');
        if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
             return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
        }

        const [prospects, activities, holidays] = await Promise.all([
            getProspectsServer(),
            getAllClientActivitiesServer(),
            getSystemHolidaysServer()
        ]);

        const activitiesByProspectId: Record<string, any[]> = {};
        activities.forEach(activity => {
            if (activity.prospectId) {
                if (!activitiesByProspectId[activity.prospectId]) {
                    activitiesByProspectId[activity.prospectId] = [];
                }
                activitiesByProspectId[activity.prospectId].push(activity);
            }
        });

        const today = new Date();
        const todayStr = format(today, 'yyyy-MM-dd');
        const INACTIVITY_LIMIT_DAYS = 7;
        
        // Cambiamos a array de objetos para guardar el dueño actual
        const prospectsToRelease: { id: string; currentOwnerId: string }[] = [];

        for (const p of prospects) {
            // Ignorar los que ya no tienen dueño, o están convertidos/no prósperos
            if (!p.ownerId || p.status === 'Convertido' || p.status === 'No Próspero') continue;

            const datesToCompare: Date[] = [];
            
            // 1. Fechas base del prospecto
            if (p.createdAt) datesToCompare.push(parseISO(p.createdAt));
            if (p.statusChangedAt) datesToCompare.push(parseISO(p.statusChangedAt));

            // 2. Analizar Actividades (Lógica de Tareas)
            const pActivities = activitiesByProspectId[p.id] || [];
            
            pActivities.forEach(act => {
                // Fecha de creación de la actividad siempre cuenta
                if (act.timestamp) {
                    datesToCompare.push(parseISO(act.timestamp));
                }
                
                // NUEVO: Si es tarea y tiene vencimiento, esa fecha cuenta
                // Esto permite "patear" la evaluación hacia el futuro.
                if (act.isTask && act.dueDate) {
                    datesToCompare.push(parseISO(act.dueDate));
                }
            });

            if (datesToCompare.length === 0) continue;

            // Obtener la fecha más futura de todas las interacciones/tareas
            const lastInteractionDate = new Date(Math.max(...datesToCompare.map(d => d.getTime())));
            const lastInteractionStr = format(lastInteractionDate, 'yyyy-MM-dd');

            // Si lastInteractionDate es HOY o FUTURO (ej: tarea para el mes que viene), 
            // calculateBusinessDays dará 0 o negativo, por lo que NO se libera. Correcto.
            const businessDaysPassed = calculateBusinessDays(lastInteractionStr, todayStr, holidays);

            if (businessDaysPassed > INACTIVITY_LIMIT_DAYS) {
                prospectsToRelease.push({ id: p.id, currentOwnerId: p.ownerId });
            }
        }

        if (businessDaysPassed > INACTIVITY_LIMIT_DAYS) {
                // CAMBIO: Agregamos companyName
                prospectsToRelease.push({ 
                    id: p.id, 
                    currentOwnerId: p.ownerId,
                    companyName: p.companyName
                });
            }

        if (prospectsToRelease.length > 0) {
            await bulkReleaseProspectsServer(prospectsToRelease, 'system-cron', 'Sistema Automático');
        }

        return NextResponse.json({ 
            success: true, 
            releasedCount: prospectsToRelease.length,
            releasedIds: prospectsToRelease.map(p => p.id)
        });

    } catch (error) {
        console.error("Error en CRON job de prospectos:", error);
        return NextResponse.json({ success: false, error: (error as Error).message }, { status: 500 });
    }
}
