import { NextResponse } from 'next/server';
import { notifyDailyTasksServer } from '@/lib/server/cron-service';
import { cronErrorResponse, isAuthorizedCronRequest } from '@/app/api/cron/utils';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
    try {
        if (!isAuthorizedCronRequest(request)) {
             return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
        }

        const count = await notifyDailyTasksServer();

        return NextResponse.json({ 
            success: true, 
            emailsSent: count
        });

    } catch (error) {
        return cronErrorResponse(error, 'NOTIFY TASKS');
    }
}
