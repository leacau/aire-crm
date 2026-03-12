'use client';

import { useState, useEffect, useMemo } from 'react';
import { Header } from '@/components/layout/header';
import { useAuth } from '@/hooks/use-auth';
import { getClients, getAllOpportunities, getBillingRequestsByClient } from '@/lib/firebase-service';
import type { Client, Opportunity, BillingRequest } from '@/lib/types';
import { Spinner } from '@/components/ui/spinner';
import { startOfMonth, endOfMonth, parseISO, isWithinInterval, isSameMonth, addMonths } from 'date-fns';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { FolderOpen } from 'lucide-react';
import { Input } from '@/components/ui/input';

const getPeriodDurationInMonths = (period: string | string[] | undefined): number => {
    const p = Array.isArray(period) ? period[0] : (period || 'Ocasional');
    switch (p) {
        case 'Mensual': return 1;
        case 'Trimestral': return 3;
        case 'Semestral': return 6;
        case 'Anual': return 12;
        default: return 1;
    }
};

export default function CarpetaPage() {
    const { userInfo, isBoss } = useAuth();
    const [clients, setClients] = useState<Client[]>([]);
    const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
    const [allBillingRequests, setAllBillingRequests] = useState<BillingRequest[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState("");

    useEffect(() => {
        Promise.all([
            getClients(), 
            getAllOpportunities()
        ]).then(async ([allClients, allOpps]) => {
            let visibleClients = allClients;
            if (!isBoss && userInfo?.id) {
                visibleClients = allClients.filter(c => c.ownerId === userInfo.id);
            }
            setClients(visibleClients);
            setOpportunities(allOpps);

            // Traemos todos los billing requests de los clientes visibles para no perder campañas largas
            const brPromises = visibleClients.map(c => getBillingRequestsByClient(c.id));
            const brResults = await Promise.all(brPromises);
            setAllBillingRequests(brResults.flat());
            
            setLoading(false);
        });
    }, [userInfo, isBoss]);

    const activeClients = useMemo(() => {
        const today = new Date();
        const startOfCurrentMonth = startOfMonth(today);
        
        const activeClientIds = new Set<string>();

        // 1. Clientes por oportunidad recurrente activa
        opportunities.forEach(opp => {
            if (opp.stage !== 'Cerrado - Ganado' || !opp.closeDate) return;

            const referenceDate = opp.manualUpdateDate ? parseISO(opp.manualUpdateDate) : parseISO(opp.closeDate);

            let isActive = false;
            if (opp.finalizationDate) {
                const startDate = startOfMonth(referenceDate);
                const endDate = endOfMonth(parseISO(opp.finalizationDate));
                isActive = isWithinInterval(startOfCurrentMonth, { start: startDate, end: endDate });
            } else {
                const durationMonths = getPeriodDurationInMonths(opp.periodicidad);
                if (durationMonths > 1) {
                    const startDate = startOfMonth(referenceDate);
                    const endDate = addMonths(startDate, durationMonths - 1);
                    isActive = isWithinInterval(startOfCurrentMonth, { start: startDate, end: endDate });
                } else {
                    isActive = isSameMonth(startOfCurrentMonth, referenceDate);
                }
            }

            if (isActive) {
                activeClientIds.add(opp.clientId);
            }
        });

        // 2. Clientes por tener un pedido de facturación (Billing Request) programado para este mes
        allBillingRequests.forEach(br => {
            if (br.date && isSameMonth(startOfCurrentMonth, parseISO(br.date))) {
                activeClientIds.add(br.clientId);
            }
        });

        return clients
            .filter(client => activeClientIds.has(client.id) && client.denominacion.toLowerCase().includes(search.toLowerCase()))
            .sort((a, b) => a.denominacion.localeCompare(b.denominacion));
    }, [clients, opportunities, allBillingRequests, search]);

    return (
        <div className="flex flex-col h-full">
            <Header title="Carpeta Comercial">
                <Input 
                    placeholder="Buscar cliente..." 
                    value={search} 
                    onChange={e => setSearch(e.target.value)} 
                    className="max-w-xs"
                />
            </Header>
            <main className="flex-1 p-6 overflow-auto">
                {loading ? (
                    <div className="flex justify-center items-center h-40"><Spinner /></div>
                ) : (
                    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                        {activeClients.length === 0 && (
                            <p className="col-span-full text-muted-foreground text-center">No hay clientes con pauta o facturación pendiente para este mes.</p>
                        )}
                        {activeClients.map(client => (
                            <Link key={client.id} href={`/carpeta/${client.id}`}>
                                <div className="border bg-card p-4 rounded-lg shadow-sm hover:shadow-md transition-shadow cursor-pointer flex items-center justify-between group">
                                    <div>
                                        <h3 className="font-semibold text-lg">{client.denominacion}</h3>
                                        <p className="text-sm text-muted-foreground">{client.ownerName}</p>
                                    </div>
                                    <Button variant="ghost" size="icon" className="group-hover:bg-primary/10">
                                        <FolderOpen className="h-5 w-5 text-primary" />
                                    </Button>
                                </div>
                            </Link>
                        ))}
                    </div>
                )}
            </main>
        </div>
    );
}
