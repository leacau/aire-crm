'use client';

import { useState, useEffect } from 'react';
import { Header } from '@/components/layout/header';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/hooks/use-toast';
import { getSocialMediaRequests } from '@/lib/firebase-service';
import { db } from '@/lib/firebase';
import { doc, deleteDoc } from 'firebase/firestore';
import type { SocialMediaRequest } from '@/lib/types';
import { Spinner } from '@/components/ui/spinner';
import { Button } from '@/components/ui/button';
import { Plus, Eye, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { format, parseISO } from 'date-fns';
import { ResizableDataTable } from '@/components/ui/resizable-data-table';
import { ColumnDef } from '@tanstack/react-table';

export default function RedesPage() {
    const { userInfo, isBoss } = useAuth();
    const { toast } = useToast();
    const router = useRouter();
    const [requests, setRequests] = useState<SocialMediaRequest[]>([]);
    const [loading, setLoading] = useState(true);

    const loadData = async () => {
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

    useEffect(() => {
        if (userInfo) loadData();
    }, [userInfo, isBoss]);

    // 🟢 ACCIÓN BORRADO CON REFRESH DE DATATABLE
    const handleDeleteRequest = async (id: string) => {
        if (!window.confirm("¿Estás seguro de eliminar permanentemente este Pedido de Redes comercial?")) return;
        try {
            await deleteDoc(doc(db, 'social_media_requests', id));
            setRequests(prev => prev.filter(r => r.id !== id));
            toast({ title: "Pedido de redes eliminado con éxito." });
        } catch (error) {
            console.error("Error deleting request:", error);
            toast({ title: "Error al borrar solicitud.", variant: "destructive" });
        }
    };

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
                <div className="flex items-center gap-1.5">
                    <Button size="sm" variant="outline" onClick={() => router.push(`/redes/${row.original.id}`)}>
                        <Eye className="h-4 w-4 mr-2"/> Ver
                    </Button>
                    {/* 🟢 CONDICIÓN INYECTADA EN CELDA DE TANSTACK TABLE */}
                    {(userInfo?.role === 'Jefe' || userInfo?.role === 'Gerencia') && (
                        <Button 
                            size="sm" 
                            variant="ghost" 
                            className="text-red-500 hover:text-red-700 hover:bg-red-50"
                            onClick={() => handleDeleteRequest(row.original.id!)}
                        >
                            <Trash2 className="h-4 w-4" />
                        </Button>
                    )}
                </div>
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
