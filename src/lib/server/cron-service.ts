{
type: file
fileName: leacau/aire-crm/aire-crm-codex-update-next.js-to-patched-version/src/lib/server/cron-service.ts
fullContent:
import { db } from '@/lib/firebase';
import { collection, getDocs, doc, writeBatch, serverTimestamp, query, orderBy, Timestamp, addDoc, getDoc, where } from 'firebase/firestore';
import { differenceInCalendarDays, isSaturday, isSunday, parseISO, format } from 'date-fns';
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
    const snapshot = await getDocs(query(collection(db, 'prospects'), orderBy("createdAt", "desc")));
    return snapshot.docs.map(doc => {
      const data = doc.data();
      const convertTimestamp = (field: any) => field instanceof Timestamp ? field.toDate().toISOString() : field;
      return {
          id: doc.id,
          ...data,
          createdAt: convertTimestamp(data.createdAt),
          statusChangedAt: convertTimestamp(data.statusChangedAt),
      } as Prospect
    });
};

export const getAllClientActivitiesServer = async (): Promise<ClientActivity[]> => {
    const q = query(collection(db, 'client-activities'), orderBy('timestamp', 'desc'));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => {
        const data = doc.data();
        return {
            id: doc.id,
            ...data,
            timestamp: (data.timestamp as Timestamp).toDate().toISOString(),
        } as ClientActivity;
    });
};

export const getSystemHolidaysServer = async (): Promise<string[]> => {
    const docRef = doc(db, 'system_config', 'holidays');
    const snap = await getDoc(docRef);
    if (snap.exists()) {
        return (snap.data() as SystemHolidays).dates || [];
    }
    return [];
};

// --- Actions ---

export const bulkReleaseProspectsServer = async (
    prospectIds: string[],
    userId: string,
    userName: string
): Promise<void> => {
    if (!prospectIds || prospectIds.length === 0) return;

    const batch = writeBatch(db);

    prospectIds.forEach((id) => {
        const docRef = doc(db, 'prospects', id);
        batch.update(docRef, {
            ownerId: '',           
            ownerName: 'Sin Asignar', 
            updatedAt: serverTimestamp(),
        });
    });

    await batch.commit();

    // Log activity directamente aquí para evitar dependencias de cliente
    await addDoc(collection(db, 'activities'), {
        userId,
        userName,
        type: 'update',
        entityType: 'prospect',
        entityId: 'multiple_release',
        entityName: `${prospectIds.length} prospectos`,
        details: `liberó automáticamente <strong>${prospectIds.length}</strong> prospectos por inactividad superior a 7 días hábiles.`,
        ownerName: 'Sistema',
        timestamp: serverTimestamp()
    });
};
}
