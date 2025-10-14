'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { Bar, BarChart, ResponsiveContainer, XAxis, YAxis, Tooltip, CartesianGrid, Legend } from 'recharts';
import { Spinner } from '@/components/ui/spinner';
import { getAllOpportunities, getAllUsers, getClients, getInvoices } from '@/lib/firebase-service';
import type { Opportunity, User, Client, Invoice } from '@/lib/types';
import { useToast } from '@/hooks/use-toast';
import type { DateRange } from 'react-day-picker';
import { isWithinInterval } from 'date-fns';

interface PipelineByAdvisorChartProps {
    dateRange?: DateRange;
    selectedAdvisor: string;
}

const COLORS = {
  nuevo: 'hsl(var(--chart-1))',
  negociacion: 'hsl(var(--chart-2))',
  ganadoPagado: 'hsl(var(--chart-3))',
  ganadoNoPagado: 'hsl(var(--chart-4))',
};

export function PipelineByAdvisorChart({ dateRange, selectedAdvisor }: PipelineByAdvisorChartProps) {
  const { toast } = useToast();
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [advisors, setAdvisors] = useState<User[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const [allOpps, allAdvisors, allClients, allInvoices] = await Promise.all([
            getAllOpportunities(),
            getAllUsers('Asesor'),
            getClients(),
            getInvoices(),
        ]);
        setOpportunities(allOpps);
        setAdvisors(allAdvisors);
        setClients(allClients);
        setInvoices(allInvoices);
      } catch (error) {
        console.error("Error fetching report data:", error);
        toast({ title: 'Error al cargar los datos del reporte', variant: 'destructive' });
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [toast]);

  const chartData = useMemo(() => {
    const filteredOpps = opportunities.filter(opp => {
      if (!dateRange?.from || !dateRange?.to) return true;
      const closeDate = new Date(opp.closeDate);
      return isWithinInterval(closeDate, { start: dateRange.from, end: dateRange.to });
    });
    
    const relevantAdvisors = selectedAdvisor === 'all'
      ? advisors
      : advisors.filter(adv => adv.id === selectedAdvisor);

    const salesByAdvisor: { [key: string]: { nuevo: number; negociacion: number; ganadoPagado: number; ganadoNoPagado: number } } = {};

    relevantAdvisors.forEach(adv => {
        salesByAdvisor[adv.id] = { nuevo: 0, negociacion: 0, ganadoPagado: 0, ganadoNoPagado: 0 };
    });

    for(const opp of filteredOpps) {
        const client = clients.find(c => c.id === opp.clientId);
        if (client && client.ownerId && salesByAdvisor[client.ownerId]) {
            const value = opp.value;
            if (opp.stage === 'Nuevo' || opp.stage === 'Propuesta' || opp.stage === 'Negociación' || opp.stage === 'Negociación a Aprobar') {
                salesByAdvisor[client.ownerId].negociacion += value;
            } else if (opp.stage === 'Cerrado - Ganado') {
                const oppInvoices = invoices.filter(inv => inv.opportunityId === opp.id);
                const paidAmount = oppInvoices.filter(i => i.status === 'Pagada').reduce((sum, i) => sum + i.amount, 0);
                const unpaidAmount = oppInvoices.filter(i => i.status !== 'Pagada').reduce((sum, i) => sum + i.amount, 0);

                salesByAdvisor[client.ownerId].ganadoPagado += paidAmount;
                salesByAdvisor[client.ownerId].ganadoNoPagado += unpaidAmount;
            }
        }
    }
    
    return relevantAdvisors.map(advisor => ({
      name: advisor.name,
      ...salesByAdvisor[advisor.id]
    }));

  }, [opportunities, advisors, clients, invoices, dateRange, selectedAdvisor]);

  if (loading) {
    return (
      <div className="flex h-full w-full items-center justify-center">
        <Spinner size="large" />
      </div>
    );
  }

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="rounded-lg border bg-background p-2 shadow-sm">
          <p className="font-bold text-foreground mb-2">{label}</p>
          {payload.map((p: any, index: number) => (
             <p key={index} style={{ color: p.color }} className="text-sm">
                {`${p.name}: $${p.value.toLocaleString('es-AR')}`}
             </p>
          ))}
        </div>
      );
    }
    return null;
  };

  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={chartData} margin={{ top: 5, right: 20, left: 20, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} />
        <XAxis 
            dataKey="name" 
            stroke="hsl(var(--muted-foreground))"
            fontSize={12}
            tickLine={false}
            axisLine={false}
        />
        <YAxis 
             stroke="hsl(var(--muted-foreground))"
             fontSize={12}
             tickLine={false}
             axisLine={false}
             tickFormatter={(value) => `$${(value as number / 1000).toLocaleString('es-AR')}k`}
        />
        <Tooltip
          cursor={{ fill: 'hsl(var(--muted))' }}
          content={<CustomTooltip />}
        />
        <Legend wrapperStyle={{ fontSize: '12px' }} />
        <Bar dataKey="negociacion" name="Pipeline (Propuesta/Negociación)" stackId="a" fill={COLORS.negociacion} />
        <Bar dataKey="ganadoNoPagado" name="Ganado (Facturado, no pagado)" stackId="a" fill={COLORS.ganadoNoPagado} />
        <Bar dataKey="ganadoPagado" name="Ganado (Pagado)" stackId="a" fill={COLORS.ganadoPagado} radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
