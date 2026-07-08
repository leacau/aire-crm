
import type { ActivityLog } from './types';
import { apiRequest } from '@/lib/api-client';

type LogActivityPayload = Omit<ActivityLog, 'id' | 'timestamp' | 'ownerName'> & {
    ownerName?: string;
    timestamp?: unknown;
};

export const logActivity = async (payload: LogActivityPayload): Promise<void> => {
    try {
        await apiRequest<{ ok: true }>('/api/activities', {
            method: 'POST',
            body: payload,
        });
    } catch (error) {
        console.error("Error logging activity:", error);
    }
};
