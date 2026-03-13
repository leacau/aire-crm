'use client';

import { Header } from '@/components/layout/header';
import { useParams, useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';
import { CarpetaTable } from '@/components/carpeta/carpeta-table';
import { useEffect, useState } from 'react';
import { getClient } from '@/lib/firebase-service';
import type { Client, AdvertisingOrder } from '@/lib/types';
import { Spinner } from '@/components/ui/spinner';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { format, parseISO } from 'date-fns';

export default function ClientCarpetaPage() {
    const params = useParams();
    const router = useRouter();
    const clientId = params.clientId as string;
    const [client, setClient] = useState<Client | null>(null);
    const [loading, setLoading] = useState(true);
    const [orders, setOrders] = useState<AdvertisingOrder[]>([]);

    useEffect(() => {
        if (!clientId) return;
        
        const fetchClientData = async () => {
            try {
                const clientData = await getClient(clientId);
                setClient(clientData);

                // Fetch Publicidad Orders (Pestaña B)
                const q = query(collection(db, 'advertising_orders'), where('clientId', '==', clientId));
                const querySnapshot = await getDocs(q);
                const fetchedOrders = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as AdvertisingOrder));
                // Ordenar de la más reciente a la más antigua
                fetchedOrders.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
                setOrders(fetchedOrders);

            } catch (error) {
                console.error("Error fetching client data:", error);
            } finally {
                setLoading(false);
            }
        };

        fetchClientData();
    }, [clientId]);

    return (
        <div className="flex flex-col h-full">
            <Header title={`Carpeta de Empresa`}>
                <Button variant="outline" onClick={() => router.back()}>
                    <ArrowLeft className="h-4 w-4 mr-2" /> Volver
                </Button>
            </Header>
            <main className="flex-1 p-6 overflow-auto">
                {loading ? (
                    <div className="flex h-40 items-center justify-center"><Spinner /></div>
                ) : client ? (
                    <div className="space-y-6">
                        <div>
                            <h2 className="text-2xl font-bold">{client.denominacion}</h2>
                            <p className="text-muted-foreground">{client.ownerName}</p>
                        </div>

                        <Tabs defaultValue="facturacion" className="w-full">
                            <TabsList className="mb-4">
                                <TabsTrigger value="facturacion">Resumen de Facturación</TabsTrigger>
                                <TabsTrigger value="pautas">Órdenes de Publicidad</TabsTrigger>
                            </TabsList>
                            
                            <TabsContent value="facturacion" className="mt-0">
                                <CarpetaTable clientId={clientId} clientName={client.denominacion} />
                            </TabsContent>
                            
                            <TabsContent value="pautas" className="mt-0">
                                <div className="border bg-card rounded-lg shadow-sm p-6">
                                    <h3 className="text-lg font-semibold mb-4">Historial de Órdenes</h3>
                                    {orders.length === 0 ? (
                                        <p className="text-muted-foreground text-sm">No hay órdenes de publicidad registradas para este cliente.</p>
                                    ) : (
                                        <div className="space-y-4">
                                            {orders.map(order => (
                                                <div key={order.id} className="p-4 border rounded-md hover:bg-slate-50 transition-colors">
                                                    <div className="flex justify-between items-start">
                                                        <div>
                                                            <p className="font-semibold">{order.product || 'Sin Producto'}</p>
                                                            <p className="text-xs text-muted-foreground">Oportunidad: {order.opportunityTitle || 'N/A'}</p>
                                                        </div>
                                                        <div className="text-right text-sm">
                                                            <p className="font-medium">Vigencia: {order.startDate ? format(parseISO(order.startDate), 'dd/MM/yyyy') : '-'} al {order.endDate ? format(parseISO(order.endDate), 'dd/MM/yyyy') : '-'}</p>
                                                            <p className="text-xs text-muted-foreground">Creada: {format(new Date(order.createdAt), 'dd/MM/yyyy')}</p>
                                                        </div>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </TabsContent>
                        </Tabs>

                    </div>
                ) : (
                    <p>Cliente no encontrado.</p>
                )}
            </main>
        </div>
    );
}
