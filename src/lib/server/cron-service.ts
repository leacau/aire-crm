import { dbAdmin } from '@/lib/firebase-admin';
import { Timestamp } from 'firebase-admin/firestore';
import { isSaturday, isSunday, parseISO, format, addDays, isSameDay, isBefore, startOfDay } from 'date-fns';
import { es } from 'date-fns/locale';
import type { Prospect, ClientActivity, SystemHolidays, User } from '@/lib/types';
import { sendServerEmail } from '@/lib/server/email'; // Nuevo servicio de email

// --- Helpers ---
export const calculateBusinessDays = (startDateStr: string, returnDateStr: string, holidays: string[]): number => {
    const start = parseISO(startDateStr);
    const end = parseISO(returnDateStr);
    const holidaySet = new Set(holidays);
    
    let count = 0;
    let current = start;

    while (current < end) {
        const dateStr = format(current, 'yyyy-MM-dd');
        if (!isSaturday(current) && !isSunday(current)) {
            if (!holidaySet.has(dateStr)) {
                count++;
            }
        }
        current = new Date(current);
        current.setDate(current.getDate() + 1);
    }
    return count;
};

// --- Data Fetching ---
export const getProspectsServer = async (): Promise<Prospect[]> => {
    const snapshot = await dbAdmin.collection('prospects').orderBy('createdAt', 'desc').get();
    return snapshot.docs.map(doc => {
      const data = doc.data();
      const convertTimestamp = (field: any) => {
          if (field && typeof field.toDate === 'function') return field.toDate().toISOString();
          return field;
      };
      return {
          id: doc.id,
          ...data,
          createdAt: convertTimestamp(data.createdAt),
          statusChangedAt: convertTimestamp(data.statusChangedAt),
      } as Prospect
    });
};

export const getAllClientActivitiesServer = async (): Promise<ClientActivity[]> => {
    const snapshot = await dbAdmin.collection('client-activities').orderBy('timestamp', 'desc').get();
    return snapshot.docs.map(doc => {
        const data = doc.data();
        const convertTimestamp = (field: any) => {
             if (field && typeof field.toDate === 'function') return field.toDate().toISOString();
             return field;
        };
        return {
            id: doc.id,
            ...data,
            timestamp: convertTimestamp(data.timestamp),
            dueDate: convertTimestamp(data.dueDate), 
            completedAt: convertTimestamp(data.completedAt),
        } as ClientActivity;
    });
};

export const getSystemHolidaysServer = async (): Promise<string[]> => {
    const docSnap = await dbAdmin.collection('system_config').doc('holidays').get();
    if (docSnap.exists) {
        return (docSnap.data() as SystemHolidays).dates || [];
    }
    return [];
};

const getUsersServer = async (): Promise<User[]> => {
    const snapshot = await dbAdmin.collection('users').get();
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as User));
};

// --- Actions ---

export const bulkReleaseProspectsServer = async (
    prospectsToRelease: { id: string; currentOwnerId: string; companyName: string }[],
    userId: string,
    userName: string
): Promise<void> => {
    if (!prospectsToRelease || prospectsToRelease.length === 0) return;

    const batch = dbAdmin.batch();

    // 1. Ejecutar actualización en BD
    prospectsToRelease.forEach(({ id, currentOwnerId }) => {
        const docRef = dbAdmin.collection('prospects').doc(id);
        batch.update(docRef, {
            ownerId: '',           
            ownerName: 'Sin Asignar', 
            updatedAt: Timestamp.now(),
            previousOwnerId: currentOwnerId,
            unassignedAt: Timestamp.now(),
            claimStatus: null, 
            claimantId: null,
            claimantName: null
        });
    });

    await batch.commit();

    // 2. Enviar correos a los asesores afectados
    const users = await getUsersServer();
    const usersMap = new Map(users.map(u => [u.id, u]));
    
    // Agrupar prospectos por dueño
    const lostByOwner: Record<string, string[]> = {};
    prospectsToRelease.forEach(p => {
        if (!lostByOwner[p.currentOwnerId]) lostByOwner[p.currentOwnerId] = [];
        lostByOwner[p.currentOwnerId].push(p.companyName);
    });

    // Enviar mails
    for (const [ownerId, companyNames] of Object.entries(lostByOwner)) {
        const user = usersMap.get(ownerId);
        if (user && user.email) {
            const listHtml = companyNames.map(name => `<li>${name}</li>`).join('');
            await sendServerEmail({
                to: user.email,
                subject: '📢 Aviso: Prospectos liberados por inactividad',
                html: `
                    <p>Hola <strong>${user.name}</strong>,</p>
                    <p>Los siguientes prospectos han sido liberados de tu cartera por superar los 7 días hábiles sin actividad ni tareas programadas:</p>
                    <ul>${listHtml}</ul>
                    <p>Recuerda que no podrás volver a reclamarlos por 3 días.</p>
                    <p><em>Sistema Aire CRM</em></p>
                `
            });
        }
    }

    // 3. Log
    await dbAdmin.collection('activities').add({
        userId,
        userName,
        type: 'update',
        entityType: 'prospect',
        entityId: 'multiple_release',
        entityName: `${prospectsToRelease.length} prospectos`,
        details: `liberó automáticamente <strong>${prospectsToRelease.length}</strong> prospectos por inactividad.`,
        ownerName: 'Sistema',
        timestamp: Timestamp.now()
    });
};


export const notifyDailyTasksServer = async (): Promise<number> => {
    const activities = await getAllClientActivitiesServer();
    const users = await getUsersServer();
    const usersMap = new Map(users.map(u => [u.id, u]));

    // Filtrar tareas pendientes
    const pendingTasks = activities.filter(a => a.isTask && !a.completed && a.dueDate);

    const today = startOfDay(new Date());
    const tomorrow = startOfDay(addDays(today, 1));
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://aire-crm.vercel.app'; // URL para links

    // Agrupar por usuario y categoría
    const tasksByUser: Record<string, { expired: ClientActivity[], today: ClientActivity[], tomorrow: ClientActivity[] }> = {};

    pendingTasks.forEach(task => {
        if (!task.userId) return;
        
        const dueDate = parseISO(task.dueDate!);
        const dueDateStart = startOfDay(dueDate);

        if (!tasksByUser[task.userId]) {
            tasksByUser[task.userId] = { expired: [], today: [], tomorrow: [] };
        }

        if (isBefore(dueDateStart, today)) {
            tasksByUser[task.userId].expired.push(task);
        } else if (isSameDay(dueDateStart, today)) {
            tasksByUser[task.userId].today.push(task);
        } else if (isSameDay(dueDateStart, tomorrow)) {
            tasksByUser[task.userId].tomorrow.push(task);
        }
    });

    let emailsSent = 0;

    for (const [userId, groups] of Object.entries(tasksByUser)) {
        const user = usersMap.get(userId);
        // Solo enviar si tiene tareas relevantes (vencidas, hoy o mañana)
        if (user && user.email && (groups.expired.length > 0 || groups.today.length > 0 || groups.tomorrow.length > 0)) {
            
            let html = `<p>Hola <strong>${user.name}</strong>, este es el resumen de tus tareas prioritarias:</p>`;
            
            const generateList = (tasks: ClientActivity[], color: string, title: string) => {
                if (tasks.length === 0) return '';
                const items = tasks.map(t => {
                    // Determinar link (Cliente o Prospecto)
                    let link = '#';
                    if (t.clientId) link = `${baseUrl}/clients/${t.clientId}`;
                    else if (t.prospectId) link = `${baseUrl}/prospects?prospectId=${t.prospectId}`;
                    
                    return `<li>
                        <a href="${link}" style="text-decoration:none; color: #333;">
                            <strong>${t.clientName || t.prospectName || 'Sin nombre'}</strong>: ${t.observation || 'Sin detalles'}
                        </a>
                    </li>`;
                }).join('');
                return `<h3 style="color: ${color};">${title} (${tasks.length})</h3><ul>${items}</ul>`;
            };

            html += generateList(groups.expired, '#d32f2f', '🚨 Vencidas');
            html += generateList(groups.today, '#f57c00', '📅 Vencen Hoy');
            html += generateList(groups.tomorrow, '#1976d2', '⏳ Vencen Mañana');
            
            html += `<p><a href="${baseUrl}/tasks" style="display:inline-block; padding:10px 20px; background:#000; color:#fff; text-decoration:none; border-radius:5px;">Ver todas mis tareas</a></p>`;

            await sendServerEmail({
                to: user.email,
                subject: `📝 Tus tareas del día: ${groups.today.length} para hoy`,
                html
            });
            emailsSent++;
        }
    }
    
    return emailsSent;
};
