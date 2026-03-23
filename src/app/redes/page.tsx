'use client';

import { useState, useEffect } from 'react';
import { Header } from '@/components/layout/header';
import { useAuth } from '@/hooks/use-auth';
import { getSocialMediaRequests } from '@/lib/firebase-service';
import type { SocialMediaRequest } from '@/lib/types';
import { Spinner } from '@/components/ui/spinner';
import { Button } from '@/components/ui/button';
import { Plus, Eye } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { format, parseISO } from 'date-fns';
import { ResizableDataTable } from '@/components/ui/resizable-data-table';

export default function RedesPage() {
    const { userInfo, isBoss } = useAuth();
    const router = useRouter();
    const [requests, setRequests] = useState<SocialMediaRequest[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const load = async () => {
            try {
                const data = await getSocialMediaRequests();
                const isManagement = isBoss || userInfo?.role === 'Administracion' || userInfo?.role === 'Admin';
                setRequests(isManagement ? data : data.filter(d => d.advisorId === userInfo?.id));
            } catch (e) {
                console.error(e);
            } finally {
                setLoading(false);
            }
        };
        if (userInfo) load();
    }, [userInfo, isBoss]);

    const columns = [
        { key: 'createdAt', label: 'Cargado', render: (val: any) => format(new Date(val), 'dd/MM/yyyy') },
        { key: 'clientName', label: 'Cliente', render: (val: any) => <span className="font-bold">{val}</span> },
        { key: 'contentType', label: 'Formato', render: (val: any) => <span className="bg-gray-100 px-2 py-1 rounded border text-xs font-semibold">{val}</span> },
        { key: 'recordingDate', label: 'F. Grabación', render: (val: any) => val ? format(parseISO(val), 'dd/MM/yyyy') : '-' },
        { key: 'advisorName', label: 'Ejecutivo' },
        { 
            key: 'actions', 
            label: 'Acción', 
            render: (_: any, row: SocialMediaRequest) => (
                <Button size="sm" variant="outline" onClick={() => router.push(`/redes/${row.id}`)}><Eye className="h-4 w-4 mr-2"/> Ver</Button>
            ) 
        }
    ];

    return (
        <div className="flex flex-col h-full bg-gray-50/50">
            <Header title="Pedidos para Redes">
                <Button onClick={() => router.push('/redes/new')}><Plus className="h-4 w-4 mr-2" /> Nuevo Pedido</Button>
            </Header>
            <main className="flex-1 p-6 overflow-auto">
                {loading ? <div className="flex justify-center p-8"><Spinner /></div> : (
                    <div className="bg-white rounded-md shadow-sm border p-4">
                        <ResizableDataTable columns={columns} data={requests} />
                    </div>
                )}
            </main>
        </div>
    );
}
