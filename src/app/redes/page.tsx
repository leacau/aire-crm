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
import { ColumnDef } from '@tanstack/react-table';

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

    // 🟢 Definición de columnas corregida al formato de TanStack Table
    const columns: ColumnDef<SocialMediaRequest>[] = [
        { 
            accessorKey: 'createdAt', 
            header: 'Cargado', 
            cell: ({ row }) => format(new Date(row.original.createdAt), 'dd/MM/yyyy') 
        },
        { 
            accessorKey: 'clientName', 
            header: 'Cliente', 
            cell: ({ row }) => <span className="font-bold">{row.original.clientName}</span> 
        },
        { 
            accessorKey: 'contentType', 
            header: 'Formato', 
            cell: ({ row }) => <span className="bg-gray-100 px-2 py-1 rounded border text-xs font-semibold">{row.original.contentType}</span> 
        },
        { 
            accessorKey: 'recordingDate', 
            header: 'F. Grabación', 
            cell: ({ row }) => row.original.recordingDate ? format(parseISO(row.original.recordingDate), 'dd/MM/yyyy') : '-' 
        },
        { 
            accessorKey: 'advisorName', 
            header: 'Ejecutivo' 
        },
        { 
            id: 'actions', 
            header: 'Acción', 
            cell: ({ row }) => (
                <Button size="sm" variant="outline" onClick={() => router.push(`/redes/${row.original.id}`)}>
                    <Eye className="h-4 w-4 mr-2"/> Ver
                </Button>
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
