'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Header } from '@/components/layout/header';
import { useAuth } from '@/hooks/use-auth';
import { Spinner } from '@/components/ui/spinner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Checkbox } from '@/components/ui/checkbox';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { getPipelineInteractions, createPipelineInteraction, deletePipelineInteraction, bulkCreatePipelineInteractions } from '@/lib/firebase-service';
import { PipelineInteraction } from '@/lib/types';
import { format, parseISO } from 'date-fns';
import { Plus, Trash2, Calculator, Upload } from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { Label } from '@/components/ui/label';
import * as XLSX from 'xlsx'; // 🟢 Librería de Excel

export default function PipelinePage() {
    const { userInfo, isBoss } = useAuth();
    const { toast } = useToast();
    
    const [interactions, setInteractions] = useState<PipelineInteraction[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [searchTerm, setSearchTerm] = useState('');
    const [isSheetOpen, setIsSheetOpen] = useState(false);
    
    // 🟢 ESTADOS PARA LA IMPORTACIÓN
    const [isImporting, setIsImporting] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // RESTRICCIÓN DE SEGURIDAD: Solo Jefes y Gerencia
    const canAccess = userInfo && (isBoss || userInfo.role === 'Gerencia' || userInfo.role === 'Jefe');

    useEffect(() => {
        if (canAccess) {
            loadData();
        } else if (userInfo) {
            setLoading(false); 
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

    // ==========================================
    // 🟢 LÓGICA DE IMPORTACIÓN MASIVA EXCEL/CSV
    // ==========================================
    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setIsImporting(true);
        try {
            const data = await file.arrayBuffer();
            // Leemos con "cellDates: true" para que Excel no nos rompa las fechas
            const workbook = XLSX.read(data, { type: 'array', cellDates: true });
            const sheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[sheetName];
            const json = XLSX.utils.sheet_to_json(worksheet);

            if (!json || json.length === 0) {
                toast({ title: 'Archivo vacío o sin formato', variant: 'destructive' });
                return;
            }

            // Helpers de limpieza de datos
            const parseDate = (val: any) => {
                if (!val) return '';
                if (val instanceof Date) return format(val, 'yyyy-MM-dd');
                if (typeof val === 'string') {
                    if (val.match(/^\d{4}-\d{2}-\d{2}$/)) return val;
                    const parts = val.split('/'); // Si viene en formato 31/12/2026
                    if (parts.length === 3) return `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
                    try { return new Date(val).toISOString().split('T')[0]; } catch { return ''; }
                }
                return '';
            };

            const parseMonto = (val: any) => {
                if (!val) return 0;
                if (typeof val === 'number') return val;
                const clean = val.toString().replace(/[^0-9,-]+/g, '').replace(',', '.');
                return Number(clean) || 0;
            };

            const mappedData: Partial<PipelineInteraction>[] = json.map((row: any) => ({
                fecha: parseDate(row['Fecha'] || row['fecha']) || new Date().toISOString().split('T')[0],
                empresa: String(row['ID Empresa'] || row['Empresa'] || row['empresa'] || 'Desconocida'),
                contacto: String(row['Contacto'] || row['contacto'] || ''),
                tipoInteraccion: String(row['Tipo interacción'] || row['Tipo interaccion'] || row['tipoInteraccion'] || ''),
                resultado: String(row['Resultado'] || row['resultado'] || ''),
                montoHablado: parseMonto(row['Monto hablado'] || row['Monto Estimado'] || row['montoHablado']),
                proximoPaso: String(row['Próximo paso'] || row['Proximo paso'] || row['proximoPaso'] || ''),
                fechaFollowUp: parseDate(row['Fecha follow-up'] || row['fecha follow-up'] || row['Fecha Follow-Up']),
                estadoPipeline: String(row['Estado pipeline'] || row['Estado'] || row['estadoPipeline'] || ''),
                observaciones: String(row['Observaciones'] || row['observaciones'] || '')
            }));

            await bulkCreatePipelineInteractions(mappedData, userInfo!.id, userInfo!.name);
            toast({ title: `Se importaron ${mappedData.length} registros con éxito.` });
            
            loadData(); // Recargamos para ver los cambios
        } catch (error) {
            console.error(error);
            toast({ title: 'Error leyendo el Excel', description: 'Revisa que los nombres de las columnas sean correctos.', variant: 'destructive' });
        } finally {
            setIsImporting(false);
            if (fileInputRef.current) fileInputRef.current.value = ''; 
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

    const totalMontoSeleccionado = interactions
        .filter(i => selectedIds.has(i.id!))
        .reduce((sum, curr) => sum + (Number(curr.montoHablado) || 0), 0);

    const filteredInteractions = interactions.filter(i => 
        i.empresa.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (i.contacto && i.contacto.toLowerCase().includes(searchTerm.toLowerCase()))
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

                {/* 🟢 INPUT INVISIBLE Y BOTÓN DE IMPORTACIÓN */}
                <input 
                    type="file" 
                    accept=".csv, .xlsx, .xls" 
                    className="hidden" 
                    ref={fileInputRef} 
                    onChange={handleFileUpload} 
                />
                <Button 
                    variant="outline" 
                    className="border-green-600 text-green-700 hover:bg-green-50 mr-2" 
                    onClick={() => fileInputRef.current?.click()} 
                    disabled={isImporting}
                >
                    {isImporting ? <Spinner size="small" className="mr-2" /> : <Upload className="w-4 h-4 mr-2" />}
                    {isImporting ? 'Cargando...' : 'Importar Archivo'}
                </Button>
                
                <Sheet open={isSheetOpen} onOpenChange={setIsSheetOpen}>
                    <SheetTrigger asChild>
                        <Button className="bg-blue-600 hover:bg-blue-700">
                            <Plus className="w-4 h-4 mr-2" /> Nueva Interacción
                        </Button>
                    </SheetTrigger>
                    <SheetContent className="w-[400px] sm:w-[540px] overflow-y-auto border-l shadow-2xl">
                        <SheetHeader>
                            <SheetTitle className="text-blue-900 border-b pb-2">Registrar Interacción</SheetTitle>
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
                                    <TableHead className="w-[100px]">Fecha</TableHead>
                                    <TableHead className="w-[180px]">Empresa</TableHead>
                                    <TableHead className="w-[150px]">Contacto</TableHead>
                                    <TableHead className="w-[150px]">Tipo Interacción</TableHead>
                                    <TableHead className="w-[150px]">Resultado</TableHead>
                                    <TableHead className="w-[120px] text-right">Monto Estimado</TableHead>
                                    <TableHead className="w-[180px]">Próximo Paso</TableHead>
                                    <TableHead className="w-[150px]">Estado</TableHead>
                                    <TableHead className="max-w-[200px]">Observaciones</TableHead>
                                    <TableHead className="w-[50px]"></TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {filteredInteractions.length === 0 && (
                                    <TableRow><TableCell colSpan={11} className="text-center py-8">No hay registros.</TableCell></TableRow>
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
                                        <TableCell className="text-xs">{row.contacto || '-'}</TableCell>
                                        <TableCell className="text-xs">{row.tipoInteraccion || '-'}</TableCell>
                                        <TableCell className="text-xs font-medium text-slate-600">{row.resultado || '-'}</TableCell>
                                        <TableCell className="text-right font-mono font-bold text-blue-700 text-xs">
                                            {row.montoHablado ? `$${row.montoHablado.toLocaleString('es-AR')}` : '-'}
                                        </TableCell>
                                        <TableCell className="text-xs text-slate-600">
                                            {row.proximoPaso || '-'}<br/>
                                            {row.fechaFollowUp && <span className="text-orange-600 font-bold">({format(parseISO(row.fechaFollowUp), 'dd/MM')})</span>}
                                        </TableCell>
                                        <TableCell>
                                            {row.estadoPipeline ? (
                                                <span className="bg-slate-200 px-2 py-1 rounded text-[10px] font-medium text-slate-700">
                                                    {row.estadoPipeline}
                                                </span>
                                            ) : '-'}
                                        </TableCell>
                                        <TableCell className="text-xs text-slate-500 max-w-[200px] truncate" title={row.observaciones}>
                                            {row.observaciones || '-'}
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

            {selectedIds.size > 0 && (
                <div className="fixed bottom-0 left-0 right-0 bg-blue-900 text-white p-4 shadow-2xl flex justify-between items-center z-50 px-8">
                    <div className="flex items-center gap-3">
                        <Calculator className="w-6 h-6 text-blue-300" />
                        <span className="font-medium text-lg">{selectedIds.size} interacciones seleccionadas</span>
                    </div>
                    <div className="flex items-center gap-4">
                        <span className="text-blue-200 uppercase text-sm font-bold tracking-wider">Suma Estimada:</span>
                        <span className="text-3xl font-black text-green-400 tracking-tight">
                            ${totalMontoSeleccionado.toLocaleString('es-AR')}
                        </span>
                    </div>
                </div>
            )}
        </div>
    );
}

function QuickAddForm({ onSuccess }: { onSuccess: (item: PipelineInteraction) => void }) {
    const { userInfo } = useAuth();
    const { toast } = useToast();
    const [saving, setSaving] = useState(false);
    
    const [formData, setFormData] = useState<Partial<PipelineInteraction>>({
        fecha: new Date().toISOString().split('T')[0],
        empresa: '', 
        contacto: '', 
        tipoInteraccion: '', 
        resultado: '',
        montoHablado: 0, 
        proximoPaso: '', 
        estadoPipeline: '', 
        observaciones: '', 
        fechaFollowUp: ''
    });

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!userInfo || !formData.empresa) return;
        setSaving(true);
        try {
            const id = await createPipelineInteraction(formData as any, userInfo.id, userInfo.name);
            toast({ title: 'Interacción guardada' });
            onSuccess({ id, ...formData, advisorId: userInfo.id, advisorName: userInfo.name } as PipelineInteraction);
            setFormData({
                fecha: new Date().toISOString().split('T')[0],
                empresa: '', contacto: '', tipoInteraccion: '', resultado: '',
                montoHablado: 0, proximoPaso: '', estadoPipeline: '', observaciones: '', fechaFollowUp: ''
            });
        } catch (error) {
            toast({ title: 'Error al guardar', variant: 'destructive' });
        } finally {
            setSaving(false);
        }
    };

    return (
        <form onSubmit={handleSubmit} className="space-y-4 mt-6 pb-6">
            <div className="grid grid-cols-2 gap-4">
                <div>
                    <Label className="text-xs font-bold text-slate-500 uppercase">1. Fecha de Interacción</Label>
                    <Input type="date" value={formData.fecha} onChange={e => setFormData({...formData, fecha: e.target.value})} required className="mt-1" />
                </div>
                <div>
                    <Label className="text-xs font-bold text-slate-500 uppercase">2. Empresa</Label>
                    <Input value={formData.empresa} onChange={e => setFormData({...formData, empresa: e.target.value})} required placeholder="Ej: Sancor" className="mt-1" />
                </div>
            </div>
            
            <div className="grid grid-cols-2 gap-4">
                <div>
                    <Label className="text-xs font-bold text-slate-500 uppercase">3. Contacto</Label>
                    <Input value={formData.contacto} onChange={e => setFormData({...formData, contacto: e.target.value})} placeholder="Nombre de la persona" className="mt-1" />
                </div>
                <div>
                    <Label className="text-xs font-bold text-slate-500 uppercase">4. Tipo Interacción</Label>
                    <Input value={formData.tipoInteraccion} onChange={e => setFormData({...formData, tipoInteraccion: e.target.value})} placeholder="Reunión, WhatsApp..." className="mt-1" />
                </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
                <div>
                    <Label className="text-xs font-bold text-slate-500 uppercase">5. Resultado</Label>
                    <Input value={formData.resultado} onChange={e => setFormData({...formData, resultado: e.target.value})} placeholder="Interesado, Rechazado..." className="mt-1" />
                </div>
                <div>
                    <Label className="text-xs font-bold text-slate-500 uppercase">6. Monto Estimado ($)</Label>
                    <Input type="number" value={formData.montoHablado || ''} onChange={e => setFormData({...formData, montoHablado: Number(e.target.value)})} placeholder="0" className="mt-1 font-mono text-right" />
                </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
                <div>
                    <Label className="text-xs font-bold text-slate-500 uppercase">7. Próximo Paso</Label>
                    <Input value={formData.proximoPaso} onChange={e => setFormData({...formData, proximoPaso: e.target.value})} placeholder="Enviar PPT..." className="mt-1" />
                </div>
                <div>
                    <Label className="text-xs font-bold text-slate-500 uppercase">8. Estado Pipeline</Label>
                    <Input value={formData.estadoPipeline} onChange={e => setFormData({...formData, estadoPipeline: e.target.value})} placeholder="Aprobado, En Negociación..." className="mt-1" />
                </div>
            </div>

            <div>
                <Label className="text-xs font-bold text-slate-500 uppercase">9. Observaciones</Label>
                <Textarea 
                    value={formData.observaciones} 
                    onChange={e => setFormData({...formData, observaciones: e.target.value})} 
                    placeholder="Detalles que sirvan para recordar lo conversado..." 
                    className="mt-1 h-20 resize-none" 
                />
            </div>

            <div>
                <Label className="text-xs font-bold text-slate-500 uppercase">10. Fecha de Seguimiento (Follow-Up)</Label>
                <Input type="date" value={formData.fechaFollowUp} onChange={e => setFormData({...formData, fechaFollowUp: e.target.value})} className="mt-1" />
            </div>
            
            <Button type="submit" className="w-full mt-6 bg-blue-600 hover:bg-blue-700 font-bold" disabled={saving}>
                {saving ? 'Guardando...' : 'Guardar en Pipeline'}
            </Button>
        </form>
    );
}
