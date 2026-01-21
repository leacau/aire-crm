import { dbAdmin } from '@/lib/firebase-admin';
import { Timestamp } from 'firebase-admin/firestore';
import { isSaturday, isSunday, parseISO, format } from 'date-fns';
import type { Prospect, ClientActivity, SystemHolidays } from '@/lib/types';

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
            dueDate: convertTimestamp(data.dueDate), // Importante recuperar el dueDate
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

// --- Actions ---

export const bulkReleaseProspectsServer = async (
    prospectsToRelease: { id: string; currentOwnerId: string }[],
    userId: string,
    userName: string
): Promise<void> => {
    if (!prospectsToRelease || prospectsToRelease.length === 0) return;

    const batch = dbAdmin.batch();

    prospectsToRelease.forEach(({ id, currentOwnerId }) => {
        const docRef = dbAdmin.collection('prospects').doc(id);
        batch.update(docRef, {
            ownerId: '',           
            ownerName: 'Sin Asignar', 
            updatedAt: Timestamp.now(),
            
            // NUEVO: Guardar historial para bloqueo de 3 días
            previousOwnerId: currentOwnerId,
            unassignedAt: Timestamp.now(),
            
            // Limpiar reclamos por seguridad
            claimStatus: null, // null borra el campo en update de Admin SDK si usas FieldValue.delete(), pero null a veces lo deja null. Mejor ignorarlo o usar lógica de borrado explícito si molesta.
                               // Para Admin SDK estricto: 
            claimantId: null,
            claimantName: null
        });
    });

    await batch.commit();

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
