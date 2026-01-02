'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { Bar, BarChart, ResponsiveContainer, XAxis, YAxis, Tooltip, CartesianGrid, Legend } from 'recharts';
import { Spinner } from '@/components/ui/spinner';
import { getAllOpportunities, getAllUsers, getClients } from '@/lib/firebase-service';
import type { Opportunity, User, Client } from '@/lib/types';
import { useToast } from '@/hooks/use-toast';
import type { DateRange } from 'react-day-picker';
import { isWithinInterval } from 'date-fns';

interface OpportunitiesByStageChartProps {
    dateRange?: DateRange;
    selectedAdvisor: string;
}

const STAGE_COLORS = {
  Nuevo: 'hsl(var(--chart-1))',
  Propuesta: 'hsl(var(--chart-2))',
  Negociación: 'hsl(var(--chart-3))',
  'Negociación a Aprobar': 'hsl(var(--chart-4))',
};

export function OpportunitiesByStageChart({ dateRange, selectedAdvisor }: OpportunitiesByStageChartProps) {
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
      if (!dateRange?.from || !dateRange?.to) return true;
      const closeDate = new Date(opp.closeDate);
      return isWithinInterval(closeDate, { start: dateRange.from, end: dateRange.to });
    });
    
    const relevantAdvisors = selectedAdvisor === 'all'
      ? advisors
      : advisors.filter(adv => adv.id === selectedAdvisor);

    const oppsByAdvisor: { [key: string]: { [stage: string]: number } } = {};

    relevantAdvisors.forEach(adv => {
        oppsByAdvisor[adv.id] = { 'Nuevo': 0, 'Propuesta': 0, 'Negociación': 0, 'Negociación a Aprobar': 0 };
    });

    for(const opp of filteredOpps) {
        const client = clients.find(c => c.id === opp.clientId);
        if (client && client.ownerId && oppsByAdvisor[client.ownerId]) {
            const stage = opp.stage;
            if (stage in oppsByAdvisor[client.ownerId]) {
                 oppsByAdvisor[client.ownerId][stage]++;
            } else if (stage === 'Negociación a Aprobar') { // Combine with Negotiation for simplicity
                 oppsByAdvisor[client.ownerId]['Negociación']++;
            }
        }
    }
    
    return relevantAdvisors.map(advisor => ({
      name: advisor.name,
      ...oppsByAdvisor[advisor.id],
    }));

  }, [opportunities, advisors, clients, dateRange, selectedAdvisor]);

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
                {`${p.name}: ${p.value}`}
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
             allowDecimals={false}
        />
        <Tooltip
          cursor={{ fill: 'hsl(var(--muted))' }}
          content={<CustomTooltip />}
        />
        <Legend wrapperStyle={{ fontSize: '12px' }} />
        <Bar dataKey="Nuevo" stackId="a" fill={STAGE_COLORS.Nuevo} radius={[4, 4, 0, 0]}/>
        <Bar dataKey="Propuesta" stackId="a" fill={STAGE_COLORS.Propuesta} />
        <Bar dataKey="Negociación" stackId="a" fill={STAGE_COLORS.Negociación} />
        <Bar dataKey="Negociación a Aprobar" name="Negociación a Aprobar" stackId="a" fill={STAGE_COLORS['Negociación a Aprobar']} />
      </BarChart>
    </ResponsiveContainer>
  );
}
