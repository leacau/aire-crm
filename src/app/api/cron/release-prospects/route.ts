import { NextResponse } from 'next/server';
import { 
    getProspects, 
    getAllClientActivities, 
    getSystemHolidays, 
    bulkReleaseProspects, 
    calculateBusinessDays 
} from '@/lib/firebase-service';
import { parseISO, format } from 'date-fns';

// Evita que la ruta sea cacheada estáticamente, queremos datos frescos siempre
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
    try {
        // 1. Seguridad básica: Verificar autorización si definiste una clave secreta (opcional pero recomendado)
        // Si usas Vercel Cron, puedes verificar el header 'Authorization' con process.env.CRON_SECRET
        const authHeader = request.headers.get('authorization');
        if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
             return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
        }

        // 2. Obtener datos necesarios
        const [prospects, activities, holidays] = await Promise.all([
            getProspects(),
            getAllClientActivities(),
            getSystemHolidays()
        ]);

        // 3. Agrupar actividades por prospecto para acceso rápido (reemplaza useMemo del frontend)
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
        const prospectIdsToRelease: string[] = [];

        // 4. Analizar cada prospecto
        for (const p of prospects) {
            // Ignorar los que ya no tienen dueño, o están convertidos/no prósperos
            if (!p.ownerId || p.status === 'Convertido' || p.status === 'No Próspero') continue;

            // Recolectar fechas relevantes
            const datesToCompare: Date[] = [];
            
            if (p.createdAt) datesToCompare.push(parseISO(p.createdAt));
            if (p.statusChangedAt) datesToCompare.push(parseISO(p.statusChangedAt));

            // Buscar la actividad más reciente de este prospecto
            const pActivities = activitiesByProspectId[p.id] || [];
            // Ordenamos por si acaso no vienen ordenadas, tomamos la más nueva
            pActivities.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
            
            if (pActivities.length > 0 && pActivities[0].timestamp) {
                datesToCompare.push(parseISO(pActivities[0].timestamp));
            }

            if (datesToCompare.length === 0) continue;

            // Fecha de última interacción real
            const lastInteractionDate = new Date(Math.max(...datesToCompare.map(d => d.getTime())));
            const lastInteractionStr = format(lastInteractionDate, 'yyyy-MM-dd');

            // Calcular días hábiles
            const businessDaysPassed = calculateBusinessDays(lastInteractionStr, todayStr, holidays);

            if (businessDaysPassed > INACTIVITY_LIMIT_DAYS) {
                prospectIdsToRelease.push(p.id);
            }
        }

        // 5. Ejecutar la liberación masiva si corresponde
        if (prospectIdsToRelease.length > 0) {
            await bulkReleaseProspects(prospectIdsToRelease, 'system-cron', 'Sistema Automático');
        }

        return NextResponse.json({ 
            success: true, 
            releasedCount: prospectIdsToRelease.length,
            releasedIds: prospectIdsToRelease 
        });

    } catch (error) {
        console.error("Error en CRON job de prospectos:", error);
        return NextResponse.json({ success: false, error: (error as Error).message }, { status: 500 });
    }
}
