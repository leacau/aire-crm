'use client';

import { useState, useEffect, useMemo } from 'react';
import { Header } from '@/components/layout/header';
import { useAuth } from '@/hooks/use-auth';
import { getClients, getAllOpportunities } from '@/lib/firebase-service';
import type { Client, Opportunity } from '@/lib/types';
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
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState("");

    useEffect(() => {
        Promise.all([getClients(), getAllOpportunities()]).then(([allClients, allOpps]) => {
            if (!isBoss && userInfo?.id) {
                setClients(allClients.filter(c => c.ownerId === userInfo.id));
            } else {
                setClients(allClients);
            }
            setOpportunities(allOpps);
            setLoading(false);
        });
    }, [userInfo, isBoss]);

    const activeClients = useMemo(() => {
        const today = new Date();
        const startOfCurrentMonth = startOfMonth(today);
        
        const activeClientIds = new Set<string>();

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

        return clients
            .filter(client => activeClientIds.has(client.id) && client.denominacion.toLowerCase().includes(search.toLowerCase()))
            .sort((a, b) => a.denominacion.localeCompare(b.denominacion));
    }, [clients, opportunities, search]);

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
                            <p className="col-span-full text-muted-foreground text-center">No hay clientes con propuestas activas este mes.</p>
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
