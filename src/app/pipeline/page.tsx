'use client';

import React, { useState, useEffect } from 'react';
import { Header } from '@/components/layout/header';
import { useAuth } from '@/hooks/use-auth';
import { Spinner } from '@/components/ui/spinner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '@/hooks/use-toast';
import { getPipelineInteractions, createPipelineInteraction, deletePipelineInteraction } from '@/lib/firebase-service';
import { PipelineInteraction } from '@/lib/types';
import { format, parseISO } from 'date-fns';
import { Plus, Trash2, Calculator } from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { Label } from '@/components/ui/label';

export default function PipelinePage() {
    const { userInfo, isBoss } = useAuth();
    const { toast } = useToast();
    
    const [interactions, setInteractions] = useState<PipelineInteraction[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [searchTerm, setSearchTerm] = useState('');
    const [isSheetOpen, setIsSheetOpen] = useState(false);

    // 🟢 RESTRICCIÓN DE SEGURIDAD: Solo Jefes y Gerencia
    const canAccess = userInfo && (isBoss || userInfo.role === 'Gerencia' || userInfo.role === 'Jefe');

    useEffect(() => {
        if (canAccess) {
            loadData();
        } else if (userInfo) {
            setLoading(false); // Deja de cargar si no tiene permisos
        }
    }, [canAccess, userInfo]);

    const loadData = async () => {
        setLoading(true);
        try {
            const data = await getPipelineInteractions();
            setInteractions(data);
        } catch (error) {
            toast({ title: 'Error al cargar', variant: 'destructive' });
        } finally {
            setLoading(false);
        }
    };

    const toggleSelection = (id: string) => {
        const newSet = new Set(selectedIds);
        if (newSet.has(id)) newSet.delete(id);
        else newSet.add(id);
        setSelectedIds(newSet);
    };

    const toggleAll = () => {
        if (selectedIds.size === filteredInteractions.length) {
            setSelectedIds(new Set());
        } else {
            setSelectedIds(new Set(filteredInteractions.map(i => i.id!)));
        }
    };

    const handleDelete = async (id: string) => {
        if (!window.confirm("¿Eliminar este registro?")) return;
        try {
            await deletePipelineInteraction(id);
            setInteractions(prev => prev.filter(i => i.id !== id));
            toast({ title: 'Eliminado' });
        } catch (error) {
            toast({ title: 'Error al eliminar', variant: 'destructive' });
        }
    };

    // 🟢 LÓGICA DE SUMATORIA AUTOMÁTICA
    const totalMontoSeleccionado = interactions
        .filter(i => selectedIds.has(i.id!))
        .reduce((sum, curr) => sum + (Number(curr.montoHablado) || 0), 0);

    const filteredInteractions = interactions.filter(i => 
        i.empresa.toLowerCase().includes(searchTerm.toLowerCase()) ||
        i.contacto?.toLowerCase().includes(searchTerm.toLowerCase())
    );

    if (!userInfo) return <Spinner />;
    if (!canAccess) return <div className="p-10 text-center text-red-500 font-bold text-xl">Acceso Denegado. Esta pantalla es exclusiva de Gerencia.</div>;

    return (
        <div className="flex flex-col h-full bg-slate-50 relative pb-20">
            <Header title="Pipeline & Gestión de Interacciones">
                <Input 
                    placeholder="Buscar empresa..." 
                    className="w-64 bg-white" 
                    value={searchTerm}
                    onChange={e => setSearchTerm(e.target.value)}
                />
                
                <Sheet open={isSheetOpen} onOpenChange={setIsSheetOpen}>
                    <SheetTrigger asChild>
                        <Button className="bg-blue-600 hover:bg-blue-700">
                            <Plus className="w-4 h-4 mr-2" /> Nueva Interacción
                        </Button>
                    </SheetTrigger>
                    <SheetContent className="w-[400px] sm:w-[540px] overflow-y-auto">
                        <SheetHeader>
                            <SheetTitle>Registrar Visita / Propuesta</SheetTitle>
                        </SheetHeader>
                        <QuickAddForm 
                            onSuccess={(newItem) => {
                                setInteractions([newItem, ...interactions]);
                                setIsSheetOpen(false);
                            }} 
                        />
                    </SheetContent>
                </Sheet>
            </Header>

            <main className="flex-1 overflow-auto p-4 md:p-6">
                {loading ? <Spinner size="large" className="mx-auto mt-20" /> : (
                    <div className="bg-white border shadow-sm rounded-md overflow-hidden">
                        <Table>
                            <TableHeader className="bg-slate-100">
                                <TableRow>
                                    <TableHead className="w-[40px] text-center">
                                        <Checkbox 
                                            checked={selectedIds.size > 0 && selectedIds.size === filteredInteractions.length} 
                                            onCheckedChange={toggleAll} 
                                        />
                                    </TableHead>
                                    <TableHead>Fecha</TableHead>
                                    <TableHead>Empresa</TableHead>
                                    <TableHead>Contacto</TableHead>
                                    <TableHead>Acción/Medio</TableHead>
                                    <TableHead>Estado</TableHead>
                                    <TableHead className="text-right">Monto Hablado</TableHead>
                                    <TableHead>Próximo Paso</TableHead>
                                    <TableHead className="w-[50px]"></TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {filteredInteractions.length === 0 && (
                                    <TableRow><TableCell colSpan={9} className="text-center py-8">No hay registros.</TableCell></TableRow>
                                )}
                                {filteredInteractions.map(row => (
                                    <TableRow key={row.id} className={selectedIds.has(row.id!) ? "bg-blue-50" : ""}>
                                        <TableCell className="text-center">
                                            <Checkbox 
                                                checked={selectedIds.has(row.id!)} 
                                                onCheckedChange={() => toggleSelection(row.id!)} 
                                            />
                                        </TableCell>
                                        <TableCell className="text-xs text-slate-500 whitespace-nowrap">
                                            {row.fecha ? format(parseISO(row.fecha), 'dd/MM/yyyy') : '-'}
                                        </TableCell>
                                        <TableCell className="font-bold text-slate-700">{row.empresa}</TableCell>
                                        <TableCell className="text-sm">{row.contacto || '-'}</TableCell>
                                        <TableCell className="text-sm">{row.tipoInteraccion || '-'}</TableCell>
                                        <TableCell>
                                            <span className="bg-slate-200 px-2 py-1 rounded text-xs font-medium text-slate-700">
                                                {row.estadoPipeline || 'Sin estado'}
                                            </span>
                                        </TableCell>
                                        <TableCell className="text-right font-mono font-bold text-blue-700">
                                            {row.montoHablado ? `$${row.montoHablado.toLocaleString('es-AR')}` : '-'}
                                        </TableCell>
                                        <TableCell className="text-xs text-slate-600">
                                            {row.proximoPaso || '-'}<br/>
                                            {row.fechaFollowUp && <span className="text-orange-600 font-bold">({format(parseISO(row.fechaFollowUp), 'dd/MM')})</span>}
                                        </TableCell>
                                        <TableCell>
                                            <Button variant="ghost" size="icon" className="text-red-400 hover:text-red-600 h-8 w-8" onClick={() => handleDelete(row.id!)}>
                                                <Trash2 className="w-4 h-4" />
                                            </Button>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </div>
                )}
            </main>

            {/* 🟢 BARRA FLOTANTE DE CÁLCULO MÁGICO */}
            {selectedIds.size > 0 && (
                <div className="fixed bottom-0 left-0 right-0 bg-blue-900 text-white p-4 shadow-2xl flex justify-between items-center z-50 px-8">
                    <div className="flex items-center gap-3">
                        <Calculator className="w-6 h-6 text-blue-300" />
                        <span className="font-medium text-lg">{selectedIds.size} propuestas seleccionadas</span>
                    </div>
                    <div className="flex items-center gap-4">
                        <span className="text-blue-200 uppercase text-sm font-bold tracking-wider">Monto Total Proyectado:</span>
                        <span className="text-3xl font-black text-green-400 tracking-tight">
                            ${totalMontoSeleccionado.toLocaleString('es-AR')}
                        </span>
                    </div>
                </div>
            )}
        </div>
    );
}

// ==========================================
// FORMULARIO DE CARGA RÁPIDA LATERAL
// ==========================================
function QuickAddForm({ onSuccess }: { onSuccess: (item: PipelineInteraction) => void }) {
    const { userInfo } = useAuth();
    const { toast } = useToast();
    const [saving, setSaving] = useState(false);
    
    const [formData, setFormData] = useState<Partial<PipelineInteraction>>({
        fecha: new Date().toISOString().split('T')[0],
        empresa: '', contacto: '', tipoInteraccion: 'Reunión Presencial', 
        estadoPipeline: 'Propuesta enviada', montoHablado: 0, proximoPaso: '', fechaFollowUp: ''
    });

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!userInfo || !formData.empresa) return;
        setSaving(true);
        try {
            const id = await createPipelineInteraction(formData as any, userInfo.id, userInfo.name);
            toast({ title: 'Interacción guardada' });
            onSuccess({ id, ...formData, advisorId: userInfo.id, advisorName: userInfo.name } as PipelineInteraction);
        } catch (error) {
            toast({ title: 'Error al guardar', variant: 'destructive' });
        } finally {
            setSaving(false);
        }
    };

    return (
        <form onSubmit={handleSubmit} className="space-y-4 mt-6">
            <div><Label>Fecha de Interacción</Label><Input type="date" value={formData.fecha} onChange={e => setFormData({...formData, fecha: e.target.value})} required /></div>
            <div><Label>Empresa</Label><Input value={formData.empresa} onChange={e => setFormData({...formData, empresa: e.target.value})} required placeholder="Ej: Sancor" /></div>
            <div className="grid grid-cols-2 gap-4">
                <div><Label>Contacto</Label><Input value={formData.contacto} onChange={e => setFormData({...formData, contacto: e.target.value})} /></div>
                <div><Label>Medio / Acción</Label><Input value={formData.tipoInteraccion} onChange={e => setFormData({...formData, tipoInteraccion: e.target.value})} placeholder="WhatsApp, Mail..." /></div>
            </div>
            <div className="grid grid-cols-2 gap-4">
                <div><Label>Estado de Propuesta</Label><Input value={formData.estadoPipeline} onChange={e => setFormData({...formData, estadoPipeline: e.target.value})} /></div>
                <div><Label>Monto Estimado ($)</Label><Input type="number" value={formData.montoHablado} onChange={e => setFormData({...formData, montoHablado: Number(e.target.value)})} /></div>
            </div>
            <div><Label>Próximo Paso / Resultado</Label><Input value={formData.proximoPaso} onChange={e => setFormData({...formData, proximoPaso: e.target.value})} placeholder="Esperar respuesta, armar propuesta..." /></div>
            <div><Label>Fecha de Seguimiento (Follow-Up)</Label><Input type="date" value={formData.fechaFollowUp} onChange={e => setFormData({...formData, fechaFollowUp: e.target.value})} /></div>
            
            <Button type="submit" className="w-full mt-4" disabled={saving}>{saving ? 'Guardando...' : 'Guardar en Pipeline'}</Button>
        </form>
    );
}
