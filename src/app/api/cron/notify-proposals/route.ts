import { NextResponse } from 'next/server';
import { notifyExpiringProposalsServer } from '@/lib/server/cron-service';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
    try {
        const authHeader = request.headers.get('authorization');
        if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
             return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
        }

        const count = await notifyExpiringProposalsServer();

        return NextResponse.json({ 
            success: true, 
            notificationsSent: count
        });

    } catch (error) {
        console.error("Error en CRON de vencimiento de propuestas:", error);
        return NextResponse.json({ success: false, error: (error as Error).message }, { status: 500 });
    }
}
