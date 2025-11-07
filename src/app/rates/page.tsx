
'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Header } from '@/components/layout/header';
import { useAuth } from '@/hooks/use-auth';
import { Spinner } from '@/components/ui/spinner';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { getPrograms, updateProgram } from '@/lib/firebase-service';
import type { Program, ProgramRates } from '@/lib/types';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Save } from 'lucide-react';
import { hasManagementPrivileges } from '@/lib/role-utils';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const rateFields: { key: keyof ProgramRates; label: string }[] = [
    { key: 'spotRadio', label: 'Segundo Spot Radio' },
    { key: 'spotTv', label: 'Segundo Spot TV' },
    { key: 'pnt', label: 'PNT' },
    { key: 'pntMasBarrida', label: 'PNT + Barrida TV' },
    { key: 'auspicio', label: 'Auspicio' },
    { key: 'notaComercial', label: 'Nota Comercial' },
];

export default function RatesPage() {
  const { userInfo, isBoss } = useAuth();
  const { toast } = useToast();
  
  const [programs, setPrograms] = useState<Program[]>([]);
  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  
  const [editedRates, setEditedRates] = useState<Record<string, Partial<ProgramRates>>>({});
  const [selectedElement, setSelectedElement] = useState<keyof ProgramRates>('spotRadio');

  const canManage = hasManagementPrivileges(userInfo);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const fetchedPrograms = await getPrograms();
      setPrograms(fetchedPrograms);
    } catch (error) {
      console.error("Error fetching programs:", error);
      toast({ title: "Error al cargar programas", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    if (userInfo) {
      fetchData();
    }
  }, [userInfo, fetchData]);

  const handleRateChange = (programId: string, field: keyof ProgramRates, value: string) => {
    const numericValue = Number(value) || 0;
    setEditedRates(prev => ({
      ...prev,
      [programId]: {
        ...prev[programId],
        [field]: numericValue,
      }
    }));
  };

  const handleSaveAll = async () => {
    if (!userInfo || !canManage || Object.keys(editedRates).length === 0) return;
    
    setIsSaving(true);
    const promises = Object.entries(editedRates).map(([programId, ratesToUpdate]) => {
      const originalProgram = programs.find(p => p.id === programId);
      if (!originalProgram) return Promise.resolve();
      
      const newRates = { ...(originalProgram.rates || {}), ...ratesToUpdate };
      return updateProgram(programId, { rates: newRates }, userInfo.id);
    });

    try {
      await Promise.all(promises);
      toast({ title: 'Tarifas actualizadas correctamente' });
      setEditedRates({});
      fetchData(); // Refetch to show saved data
    } catch (error) {
      console.error("Error saving rates:", error);
      toast({ title: 'Error al guardar las tarifas', variant: 'destructive' });
    } finally {
      setIsSaving(false);
    }
  };

  if (loading) {
    return <div className="flex h-full w-full items-center justify-center"><Spinner size="large" /></div>;
  }

  return (
    <div className="flex flex-col h-full">
      <Header title="Gestión de Tarifas">
        {canManage && (
          <Button onClick={handleSaveAll} disabled={isSaving || Object.keys(editedRates).length === 0}>
            <Save className="mr-2 h-4 w-4" />
            {isSaving ? 'Guardando...' : 'Guardar Cambios'}
          </Button>
        )}
      </Header>
      <main className="flex-1 overflow-auto p-4 md:p-6 lg:p-8">
        <Tabs defaultValue="by-program">
          <TabsList>
            <TabsTrigger value="by-program">Por Programa</TabsTrigger>
            <TabsTrigger value="by-element">Por Elemento</TabsTrigger>
          </TabsList>
          
          <TabsContent value="by-program" className="mt-4">
             <div className="rounded-md border">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead className="w-[250px]">Programa</TableHead>
                            {rateFields.map(field => <TableHead key={field.key} className="text-right">{field.label}</TableHead>)}
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {programs.map(program => (
                            <TableRow key={program.id}>
                                <TableCell className="font-medium">{program.name}</TableCell>
                                {rateFields.map(field => (
                                    <TableCell key={field.key} className="text-right">
                                        <Input
                                            type="number"
                                            className="min-w-[100px] text-right"
                                            value={editedRates[program.id]?.[field.key] ?? program.rates?.[field.key] ?? ''}
                                            onChange={(e) => handleRateChange(program.id, field.key, e.target.value)}
                                            disabled={!canManage}
                                            placeholder="0"
                                        />
                                    </TableCell>
                                ))}
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
             </div>
          </TabsContent>
          
          <TabsContent value="by-element" className="mt-4">
            <div className="mb-4 w-full md:w-1/3">
                 <Select value={selectedElement} onValueChange={(v) => setSelectedElement(v as keyof ProgramRates)}>
                    <SelectTrigger>
                        <SelectValue placeholder="Seleccionar elemento..." />
                    </SelectTrigger>
                    <SelectContent>
                        {rateFields.map(field => (
                            <SelectItem key={field.key} value={field.key}>{field.label}</SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>
            <div className="rounded-md border">
                <Table>
                     <TableHeader>
                        <TableRow>
                            <TableHead className="w-1/2">Programa</TableHead>
                            <TableHead className="w-1/2 text-right">Valor</TableHead>
                        </TableRow>
                     </TableHeader>
                     <TableBody>
                        {programs.map(program => (
                             <TableRow key={program.id}>
                                <TableCell className="font-medium">{program.name}</TableCell>
                                <TableCell className="text-right">
                                    <Input
                                        type="number"
                                        className="min-w-[100px] text-right inline-block w-auto"
                                        value={editedRates[program.id]?.[selectedElement] ?? program.rates?.[selectedElement] ?? ''}
                                        onChange={(e) => handleRateChange(program.id, selectedElement, e.target.value)}
                                        disabled={!canManage}
                                        placeholder="0"
                                    />
                                </TableCell>
                             </TableRow>
                        ))}
                     </TableBody>
                </Table>
            </div>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
