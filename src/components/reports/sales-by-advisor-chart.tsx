
'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { Bar, BarChart, ResponsiveContainer, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';
import { Spinner } from '@/components/ui/spinner';
import { getAllOpportunities, getAllUsers, getClients } from '@/lib/firebase-service';
import type { Opportunity, User, Client } from '@/lib/types';
import { useToast } from '@/hooks/use-toast';
import type { DateRange } from 'react-day-picker';
import { isWithinInterval } from 'date-fns';

interface SalesByAdvisorChartProps {
    dateRange?: DateRange;
}

export function SalesByAdvisorChart({ dateRange }: SalesByAdvisorChartProps) {
  const { toast } = useToast();
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [advisors, setAdvisors] = useState<User[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const [allOpps, allAdvisors, allClients] = await Promise.all([
            getAllOpportunities(),
            getAllUsers('Asesor'),
            getClients(),
        ]);
        setOpportunities(allOpps);
        setAdvisors(allAdvisors);
        setClients(allClients);
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
      if (opp.stage !== 'Cerrado - Ganado') return false;
      if (!dateRange?.from || !dateRange?.to) return true;
      const closeDate = new Date(opp.closeDate);
      return isWithinInterval(closeDate, { start: dateRange.from, end: dateRange.to });
    });

    const salesByAdvisor: { [key: string]: number } = {};

    for(const opp of filteredOpps) {
        const client = clients.find(c => c.id === opp.clientId);
        if (client && client.ownerId) {
            if(!salesByAdvisor[client.ownerId]) {
                salesByAdvisor[client.ownerId] = 0;
            }
            salesByAdvisor[client.ownerId] += (opp.valorCerrado || opp.value);
        }
    }
    
    return advisors.map(advisor => ({
      name: advisor.name.split(' ')[0], // Show first name for brevity
      total: salesByAdvisor[advisor.id] || 0,
    })).sort((a,b) => b.total - a.total);

  }, [opportunities, advisors, clients, dateRange]);

  if (loading) {
    return (
      <div className="flex h-full w-full items-center justify-center">
        <Spinner size="large" />
      </div>
    );
  }

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
             tickFormatter={(value) => `$${(value as number).toLocaleString('es-AR')}`}
        />
        <Tooltip
          cursor={{ fill: 'hsl(var(--muted))' }}
          content={({ active, payload }) => {
            if (active && payload && payload.length) {
              return (
                <div className="rounded-lg border bg-background p-2 shadow-sm">
                  <div className="grid grid-cols-2 gap-2">
                    <div className="flex flex-col">
                      <span className="text-[0.70rem] uppercase text-muted-foreground">
                        Asesor
                      </span>
                      <span className="font-bold text-foreground">
                        {payload[0].payload.name}
                      </span>
                    </div>
                    <div className="flex flex-col">
                      <span className="text-[0.70rem] uppercase text-muted-foreground">
                        Ventas
                      </span>
                      <span className="font-bold">
                        ${(payload[0].value as number).toLocaleString('es-AR')}
                      </span>
                    </div>
                  </div>
                </div>
              );
            }
            return null;
          }}
        />
        <Bar dataKey="total" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
