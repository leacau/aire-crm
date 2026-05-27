'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Header } from '@/components/layout/header';
import { useAuth } from '@/hooks/use-auth';
import { Spinner } from '@/components/ui/spinner';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { getPrograms, updateProgram, getSrlAdTypes, saveSrlAdTypes, getSasProducts, saveSasProducts } from '@/lib/firebase-service';
import type { Program, SasProductConfig } from '@/lib/types';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Save, Plus, Trash2 } from 'lucide-react';

export default function RatesPage() {
  const { userInfo, isBoss } = useAuth();
  const { toast } = useToast();
  
  const [programs, setPrograms] = useState<Program[]>([]);
  const [srlTypes, setSrlTypes] = useState<string[]>([]);
  const [sasProducts, setSasProducts] = useState<SasProductConfig[]>([]);
  
  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  
  const [editedRates, setEditedRates] = useState<Record<string, Record<string, number>>>({});
  const canManage = isBoss || userInfo?.role === 'Gerencia';

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [fetchedPrograms, fetchedSrl, fetchedSas] = await Promise.all([
          getPrograms(), getSrlAdTypes(), getSasProducts()
      ]);
      setPrograms(fetchedPrograms);
      setSrlTypes(fetchedSrl);
      setSasProducts(fetchedSas);
    } catch (error) {
      console.error(error);
      toast({ title: "Error al cargar configuración", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    if (userInfo) fetchData();
  }, [userInfo, fetchData]);

  const handleSrlRateChange = (programId: string, field: string, value: string) => {
    const numericValue = Number(value) || 0;
    setEditedRates(prev => ({
      ...prev,
      [programId]: {
        ...(prev[programId] || {}),
        [field]: numericValue,
      }
    }));
  };

  const handleAddSrlType = () => {
      const newType = prompt("Nombre del nuevo Tipo de Aviso (Ej: Micro, Entrevista, Flash):");
      if (newType && newType.trim() !== '') {
          const clean = newType.trim();
          if (!srlTypes.includes(clean)) {
              setSrlTypes([...srlTypes, clean]);
          }
      }
  };

  const handleAddSasProduct = () => {
      setSasProducts([...sasProducts, {
          id: typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2),
          format: "Nuevo Formato",
          type: "",
          detail: "",
          cpm: 0,
          unitRate: 0
      }]);
  };

  const handleSasProductChange = (index: number, field: keyof SasProductConfig, value: string | number) => {
      const updated = [...sasProducts];
      updated[index] = { ...updated[index], [field]: value };
      setSasProducts(updated);
  };

  const handleRemoveSasProduct = (index: number) => {
      const updated = [...sasProducts];
      updated.splice(index, 1);
      setSasProducts(updated);
  };

  const handleSaveAll = async () => {
    if (!userInfo || !canManage) return;
    setIsSaving(true);
    
    try {
        const promises = Object.entries(editedRates).map(([programId, ratesToUpdate]) => {
          const originalProgram = programs.find(p => p.id === programId);
          if (!originalProgram) return Promise.resolve();
          const newRates = { ...(originalProgram.rates || {}), ...ratesToUpdate };
          return updateProgram(programId, { rates: newRates }, userInfo.id);
        });

        await Promise.all([
            ...promises,
            saveSrlAdTypes(srlTypes, userInfo.id, userInfo.name),
            saveSasProducts(sasProducts, userInfo.id, userInfo.name)
        ]);

        toast({ title: 'Configuración Comercial guardada correctamente.' });
        setEditedRates({});
        fetchData();
    } catch (error) {
      console.error(error);
      toast({ title: 'Error al guardar la configuración', variant: 'destructive' });
    } finally {
      setIsSaving(false);
    }
  };

  if (loading) return <div className="flex h-full w-full items-center justify-center"><Spinner size="large" /></div>;

  // 🟢 ARMADO DINÁMICO DE COLUMNAS PARA SRL
  const baseSrlColumns = [
      { key: 'spotRadio', label: 'Spot Radio' },
      { key: 'spotTv', label: 'Spot TV' },
      { key: 'pnt', label: 'PNT' },
      { key: 'pntMasBarrida', label: 'PNT + Barrida' }
  ];
  
  const dynamicSrlColumns = srlTypes.filter(t => t !== "Spot" && t !== "PNT").map(t => ({
      key: t === 'Auspicio' ? 'auspicio' : (t === 'Nota Comercial' ? 'notaComercial' : t),
      label: t
  }));

  const allSrlColumns = [...baseSrlColumns, ...dynamicSrlColumns];

  return (
    <div className="flex flex-col h-full bg-slate-50">
      <Header title="Configuración de Productos y Tarifas">
        {canManage && (
          <Button onClick={handleSaveAll} disabled={isSaving} className="bg-blue-600 hover:bg-blue-700">
            <Save className="mr-2 h-4 w-4" /> {isSaving ? 'Guardando...' : 'Guardar Todo'}
          </Button>
        )}
      </Header>
      
      <main className="flex-1 overflow-auto p-4 md:p-6 lg:p-8">
        <Tabs defaultValue="srl" className="w-full">
          <TabsList className="mb-4">
            <TabsTrigger value="srl" className="text-sm font-bold">AIRE SRL (Radio y TV)</TabsTrigger>
            <TabsTrigger value="sas" className="text-sm font-bold">AIRE SAS (Digitales)</TabsTrigger>
          </TabsList>
          
          <TabsContent value="srl">
             <div className="bg-white rounded-md border shadow-sm p-4">
                <div className="flex justify-between items-center mb-4">
                    <h2 className="text-lg font-bold text-slate-700">Grilla Comercial SRL</h2>
                    {canManage && (
                        <Button variant="outline" size="sm" onClick={handleAddSrlType}>
                            <Plus className="w-4 h-4 mr-2" /> Nuevo Tipo de Aviso
                        </Button>
                    )}
                </div>
                <div className="overflow-x-auto">
                    <Table>
                        <TableHeader className="bg-slate-100">
                            <TableRow>
                                <TableHead className="min-w-[200px] border-r">Programa</TableHead>
                                {allSrlColumns.map(col => <TableHead key={col.key} className="text-right whitespace-nowrap min-w-[120px]">{col.label}</TableHead>)}
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {programs.map(program => (
                                <TableRow key={program.id} className="hover:bg-slate-50">
                                    <TableCell className="font-bold border-r text-slate-800">{program.name}</TableCell>
                                    {allSrlColumns.map(col => (
                                        <TableCell key={col.key} className="text-right">
                                            <Input
                                                type="number"
                                                className="w-[100px] ml-auto text-right font-mono text-sm h-8"
                                                value={editedRates[program.id]?.[col.key] ?? program.rates?.[col.key] ?? ''}
                                                onChange={(e) => handleSrlRateChange(program.id, col.key, e.target.value)}
                                                disabled={!canManage}
                                                placeholder="-"
                                            />
                                        </TableCell>
                                    ))}
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </div>
             </div>
          </TabsContent>
          
          <TabsContent value="sas">
            <div className="bg-white rounded-md border shadow-sm p-4">
                <div className="flex justify-between items-center mb-4">
                    <h2 className="text-lg font-bold text-slate-700">Inventario Digital SAS</h2>
                    {canManage && (
                        <Button variant="outline" size="sm" onClick={handleAddSasProduct}>
                            <Plus className="w-4 h-4 mr-2" /> Agregar Producto
                        </Button>
                    )}
                </div>
                
                <div className="overflow-x-auto">
                    <Table>
                        <TableHeader className="bg-slate-100">
                            <TableRow>
                                <TableHead className="w-[180px]">Formato Maestro</TableHead>
                                <TableHead className="w-[200px]">Tipo / Ubicación</TableHead>
                                <TableHead className="min-w-[200px]">Detalle</TableHead>
                                <TableHead className="w-[120px] text-right">CPM</TableHead>
                                <TableHead className="w-[120px] text-right">Tarifa Un.</TableHead>
                                <TableHead className="w-[50px]"></TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {sasProducts.length === 0 && (
                                <TableRow><TableCell colSpan={6} className="text-center py-8 text-slate-400">No hay productos digitales cargados.</TableCell></TableRow>
                            )}
                            {sasProducts.map((p, idx) => (
                                <TableRow key={p.id}>
                                    <TableCell><Input value={p.format} onChange={e => handleSasProductChange(idx, 'format', e.target.value)} className="h-8 font-bold" disabled={!canManage}/></TableCell>
                                    <TableCell><Input value={p.type} onChange={e => handleSasProductChange(idx, 'type', e.target.value)} className="h-8" disabled={!canManage}/></TableCell>
                                    <TableCell><Input value={p.detail} onChange={e => handleSasProductChange(idx, 'detail', e.target.value)} className="h-8" disabled={!canManage}/></TableCell>
                                    <TableCell><Input type="number" value={p.cpm} onChange={e => handleSasProductChange(idx, 'cpm', parseFloat(e.target.value)||0)} className="h-8 text-right font-mono" disabled={!canManage}/></TableCell>
                                    <TableCell><Input type="number" value={p.unitRate} onChange={e => handleSasProductChange(idx, 'unitRate', parseFloat(e.target.value)||0)} className="h-8 text-right font-mono" disabled={!canManage}/></TableCell>
                                    <TableCell>
                                        {canManage && (
                                            <Button variant="ghost" size="sm" onClick={() => handleRemoveSasProduct(idx)} className="text-red-500 hover:bg-red-50 h-8 w-8 p-0">
                                                <Trash2 className="w-4 h-4"/>
                                            </Button>
                                        )}
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </div>
            </div>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
