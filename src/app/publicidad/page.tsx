'use client';

import React, { useState, useEffect } from 'react';
import { Header } from '@/components/layout/header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/hooks/use-toast';
import { Spinner } from '@/components/ui/spinner';
import { deleteAdvertisingOrder, getRecentAdvertisingOrders } from '@/lib/api/advertising-orders';
import { getClients } from '@/lib/api/clients';
import type { AdvertisingOrder } from '@/lib/types';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { Plus, Search, Eye, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { hasManagementPrivileges } from '@/lib/role-utils';
import { Card, CardContent } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

export default function AdvertisingOrdersListPage() {
    const { userInfo, loading: authLoading } = useAuth();
    const { toast } = useToast();
    const [orders, setOrders] = useState<AdvertisingOrder[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');

    useEffect(() => {
        const fetchOrders = async () => {
            if (!userInfo) return;
            setLoading(true);
            try {
                const allOrders = await getRecentAdvertisingOrders(); 

                if (hasManagementPrivileges(userInfo) || userInfo.role === 'Administracion') {
                    setOrders(allOrders);
                } else {
                    const allClients = await getClients();
                    const myClientIds = new Set(
                        allClients.filter(c => c.ownerId === userInfo.id).map(c => c.id)
                    );
                    
                    const myOrders = allOrders.filter(order => 
                        order.createdBy === userInfo.id || myClientIds.has(order.clientId)
                    );
                    setOrders(myOrders);
                }
            } catch (error) {
                console.error("Error fetching ad orders:", error);
            } finally {
                setLoading(false);
            }
        };

        if (!authLoading) fetchOrders();
    }, [userInfo, authLoading]);

    // 🟢 FUNCIÓN DE BORRADO FÍSICO DIRECTO
    const handleDeleteOrder = async (id: string) => {
        if (!userInfo) return;
        if (!window.confirm("¿Estás completamente seguro de eliminar esta Orden de Publicidad de manera permanente? Esta acción no se puede deshacer.")) return;
        try {
            await deleteAdvertisingOrder(id);
            setOrders(prev => prev.filter(o => o.id !== id));
            toast({ title: "Orden de publicidad eliminada correctamente." });
        } catch (error) {
            console.error("Error deleting order:", error);
            toast({ title: "Error al intentar eliminar la orden.", variant: "destructive" });
        }
    };

    const filteredOrders = orders.filter(order => {
        const term = searchTerm.toLowerCase();
        return (
            (order.product && order.product.toLowerCase().includes(term)) ||
            (order.opportunityTitle && order.opportunityTitle.toLowerCase().includes(term)) ||
            (order.clientName && order.clientName.toLowerCase().includes(term))
        );
    });

    return (
        <div className="flex flex-col h-full overflow-hidden">
            <Header title="Órdenes de Publicidad (Últimos 2 meses)">
                <Button asChild>
                    <Link href="/publicidad/new">
                        <Plus className="mr-2 h-4 w-4" /> Nueva Orden
                    </Link>
                </Button>
            </Header>
            <main className="flex-1 overflow-auto p-4 md:p-6 space-y-6">
                {authLoading || loading ? (
                    <>
                        <div className="h-10 w-full max-w-md animate-pulse rounded bg-muted" />
                        <div className="h-72 w-full animate-pulse rounded border bg-muted/30" />
                    </>
                ) : (
                <>
                <div className="flex items-center space-x-2">
                    <div className="relative w-full md:w-1/3">
                        <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                        <Input 
                            placeholder="Buscar por producto o cliente..." 
                            className="pl-8" 
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>
                </div>

                <Card>
                    <CardContent className="p-0">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Fecha Carga</TableHead>
                                    <TableHead>Producto / Campaña</TableHead>
                                    <TableHead>Cliente</TableHead>
                                    <TableHead>Ejecutivo</TableHead>
                                    <TableHead className="text-right w-[120px]"></TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {filteredOrders.length > 0 ? (
                                    filteredOrders.map((order) => (
                                        <TableRow key={order.id}>
                                            <TableCell className="font-medium">
                                                {format(new Date(order.createdAt), 'dd/MM/yyyy', { locale: es })}
                                            </TableCell>
                                            <TableCell>{order.product || order.opportunityTitle || 'Sin Título'}</TableCell>
                                            <TableCell>{order.clientName}</TableCell>
                                            <TableCell>{order.accountExecutive}</TableCell>
                                            <TableCell className="text-right">
                                                <div className="flex justify-end gap-1">
                                                    <Button variant="ghost" size="sm" asChild>
                                                        <Link href={`/publicidad/${order.id}`}>
                                                            <Eye className="h-4 w-4" />
                                                        </Link>
                                                    </Button>
                                                    {/* 🟢 ACCESIBILIDAD LIMITADA SÓLO A JEFES Y GERENTES */}
                                                    {(userInfo?.role === 'Jefe' || userInfo?.role === 'Gerencia') && (
                                                        <Button 
                                                            variant="ghost" 
                                                            size="sm" 
                                                            className="text-red-500 hover:text-red-700 hover:bg-red-50"
                                                            onClick={() => handleDeleteOrder(order.id!)}
                                                        >
                                                            <Trash2 className="h-4 w-4" />
                                                        </Button>
                                                    )}
                                                </div>
                                            </TableCell>
                                        </TableRow>
                                    ))
                                ) : (
                                    <TableRow>
                                        <TableCell colSpan={5} className="h-24 text-center">
                                            No se encontraron órdenes de publicidad recientes.
                                        </TableCell>
                                    </TableRow>
                                )}
                            </TableBody>
                        </Table>
                    </CardContent>
                </Card>
                </>
                )}
            </main>
        </div>
    );
}
