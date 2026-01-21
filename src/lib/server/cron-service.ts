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

// --- Data Fetching (Versión Admin SDK) ---

export const getProspectsServer = async (): Promise<Prospect[]> => {
    // Admin SDK usa .get() en lugar de getDocs()
    const snapshot = await dbAdmin.collection('prospects').orderBy('createdAt', 'desc').get();
    
    return snapshot.docs.map(doc => {
      const data = doc.data();
      // Helper para convertir timestamps de Admin SDK a string
      const convertTimestamp = (field: any) => {
          if (field && typeof field.toDate === 'function') {
              return field.toDate().toISOString();
          }
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
        return {
            id: doc.id,
            ...data,
            timestamp: data.timestamp && typeof data.timestamp.toDate === 'function' 
                ? data.timestamp.toDate().toISOString() 
                : data.timestamp,
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

// --- Actions (Versión Admin SDK) ---

export const bulkReleaseProspectsServer = async (
    prospectIds: string[],
    userId: string,
    userName: string
): Promise<void> => {
    if (!prospectIds || prospectIds.length === 0) return;

    const batch = dbAdmin.batch();

    prospectIds.forEach((id) => {
        const docRef = dbAdmin.collection('prospects').doc(id);
        batch.update(docRef, {
            ownerId: '',           
            ownerName: 'Sin Asignar', 
            updatedAt: Timestamp.now(), // Timestamp de Admin SDK
        });
    });

    await batch.commit();

    // Registrar actividad (sin pasar por reglas de seguridad)
    await dbAdmin.collection('activities').add({
        userId,
        userName,
        type: 'update',
        entityType: 'prospect',
        entityId: 'multiple_release',
        entityName: `${prospectIds.length} prospectos`,
        details: `liberó automáticamente <strong>${prospectIds.length}</strong> prospectos por inactividad superior a 7 días hábiles.`,
        ownerName: 'Sistema',
        timestamp: Timestamp.now()
    });
};
