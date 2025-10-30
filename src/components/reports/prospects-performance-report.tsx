'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Lightbulb } from 'lucide-react';
import { Spinner } from '@/components/ui/spinner';
import { getProspects, getAllUsers } from '@/lib/firebase-service';
import type { User, Prospect } from '@/lib/types';
import { useToast } from '@/hooks/use-toast';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { differenceInDays } from 'date-fns';

interface ProspectsPerformanceReportProps {
  selectedAdvisor: string;
}

interface AdvisorStats {
  advisorName: string;
  totalProspects: number;
  convertedCount: number;
  notProsperedCount: number;
  conversionRate: number;
  avgDaysToConvert: number | null;
  avgDaysToArchive: number | null;
}

export function ProspectsPerformanceReport({ selectedAdvisor }: ProspectsPerformanceReportProps) {
  const { toast } = useToast();
  const [prospects, setProspects] = useState<Prospect[]>([]);
  const [advisors, setAdvisors] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const [allProspects, allAdvisors] = await Promise.all([
            getProspects(),
            getAllUsers('Asesor'),
        ]);
        setProspects(allProspects);
        setAdvisors(allAdvisors);
      } catch (error) {
        console.error("Error fetching prospects performance data:", error);
        toast({ title: 'Error al cargar datos de prospectos', variant: 'destructive' });
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [toast]);

  const performanceData = useMemo<AdvisorStats[]>(() => {
    const relevantAdvisors = selectedAdvisor === 'all'
      ? advisors
      : advisors.filter(a => a.id === selectedAdvisor);

    return relevantAdvisors.map(advisor => {
      const advisorProspects = prospects.filter(p => p.ownerId === advisor.id);
      
      const converted = advisorProspects.filter(p => p.status === 'Convertido');
      const notProspered = advisorProspects.filter(p => p.status === 'No Próspero');
      
      const totalDecided = converted.length + notProspered.length;
      const conversionRate = totalDecided > 0 ? (converted.length / totalDecided) * 100 : 0;
      
      const conversionDurations = converted
        .map(p => p.statusChangedAt && p.createdAt ? differenceInDays(new Date(p.statusChangedAt), new Date(p.createdAt)) : null)
        .filter((d): d is number => d !== null);
      
      const avgDaysToConvert = conversionDurations.length > 0 
        ? conversionDurations.reduce((a, b) => a + b, 0) / conversionDurations.length 
        : null;

      const archiveDurations = notProspered
        .map(p => p.statusChangedAt && p.createdAt ? differenceInDays(new Date(p.statusChangedAt), new Date(p.createdAt)) : null)
        .filter((d): d is number => d !== null);
        
      const avgDaysToArchive = archiveDurations.length > 0
        ? archiveDurations.reduce((a, b) => a + b, 0) / archiveDurations.length
        : null;

      return {
        advisorName: advisor.name,
        totalProspects: advisorProspects.length,
        convertedCount: converted.length,
        notProsperedCount: notProspered.length,
        conversionRate,
        avgDaysToConvert,
        avgDaysToArchive,
      };
    }).sort((a,b) => b.totalProspects - a.totalProspects);

  }, [prospects, advisors, selectedAdvisor]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
            <Lightbulb className="h-5 w-5 text-primary" />
            Rendimiento de Prospección
        </CardTitle>
        <CardDescription>
          Análisis del ciclo de vida de los prospectos por asesor.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex items-center justify-center h-48"><Spinner /></div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Asesor</TableHead>
                <TableHead className="text-right">Prospectos Totales</TableHead>
                <TableHead className="text-right">Convertidos a Cliente</TableHead>
                <TableHead className="text-right">No Prósperos</TableHead>
                <TableHead className="text-right">Tasa de Conversión</TableHead>
                <TableHead className="text-right">Días Prom. a Cliente</TableHead>
                <TableHead className="text-right">Días Prom. a No Próspero</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {performanceData.map(stats => (
                <TableRow key={stats.advisorName}>
                  <TableCell className="font-medium">{stats.advisorName}</TableCell>
                  <TableCell className="text-right">{stats.totalProspects}</TableCell>
                  <TableCell className="text-right">{stats.convertedCount}</TableCell>
                  <TableCell className="text-right">{stats.notProsperedCount}</TableCell>
                  <TableCell className="text-right font-semibold">{stats.conversionRate.toFixed(1)}%</TableCell>
                  <TableCell className="text-right">{stats.avgDaysToConvert !== null ? `${stats.avgDaysToConvert.toFixed(1)} días` : '-'}</TableCell>
                  <TableCell className="text-right">{stats.avgDaysToArchive !== null ? `${stats.avgDaysToArchive.toFixed(1)} días` : '-'}</TableCell>
                </TableRow>
              ))}
               {performanceData.length === 0 && (
                <TableRow>
                    <TableCell colSpan={7} className="h-24 text-center">No hay datos de prospección para mostrar.</TableCell>
                </TableRow>
               )}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
