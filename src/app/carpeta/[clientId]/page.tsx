'use client';

import { Header } from '@/components/layout/header';
import { useParams, useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';
import { CarpetaTable } from '@/components/carpeta/carpeta-table';
import { useEffect, useState } from 'react';
import { getClient } from '@/lib/firebase-service';
import type { Client } from '@/lib/types';
import { Spinner } from '@/components/ui/spinner';

export default function ClientCarpetaPage() {
    const params = useParams();
    const router = useRouter();
    const clientId = params.clientId as string;
    const [client, setClient] = useState<Client | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!clientId) return;
        getClient(clientId).then(data => {
            setClient(data);
            setLoading(false);
        });
    }, [clientId]);

    return (
        <div className="flex flex-col h-full">
            <Header title={`Carpeta de Facturación`}>
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
                            <p className="text-muted-foreground">Mes en curso</p>
                        </div>
                        <CarpetaTable clientId={clientId} clientName={client.denominacion} />
                    </div>
                ) : (
                    <p>Cliente no encontrado.</p>
                )}
            </main>
        </div>
    );
}
