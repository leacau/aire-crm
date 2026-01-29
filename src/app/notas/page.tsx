'use client';

import React, { useState, useEffect } from 'react';
import { Header } from '@/components/layout/header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/hooks/use-toast';
import { Spinner } from '@/components/ui/spinner';
import { getClients, getPrograms, updateClientTangoMapping, saveCommercialNote } from '@/lib/firebase-service';
import type { Client, Program, CommercialNote } from '@/lib/types';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { CalendarIcon, Save } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { Switch } from '@/components/ui/switch';

export default function NotaComercialPage() {
    const { userInfo } = useAuth();
    const { toast } = useToast();
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    // Data
    const [clients, setClients] = useState<Client[]>([]);
    const [programs, setPrograms] = useState<Program[]>([]);

    // Form State
    const [selectedClientId, setSelectedClientId] = useState<string>('');
    const [cuit, setCuit] = useState('');
    const [razonSocial, setRazonSocial] = useState('');
    const [denominacion, setDenominacion] = useState('');
    const [rubro, setRubro] = useState('');
    const [instagram, setInstagram] = useState('');
    const [phone, setPhone] = useState('');
    const [whatsapp, setWhatsapp] = useState('');
    const [address, setAddress] = useState('');
    
    // Program Selection
    const [selectedProgramIds, setSelectedProgramIds] = useState<string[]>([]);
    // Date Selection: Map programId -> Date[]
    const [programDates, setProgramDates] = useState<Record<string, Date[]>>({});

    // Financials
    const [saleValue, setSaleValue] = useState<string>(''); // User input
    
    // Other
    const [observations, setObservations] = useState('');
    const [replicateWeb, setReplicateWeb] = useState(false);
    const [replicateSocials, setReplicateSocials] = useState<string[]>([]);
    const [graphicSupport, setGraphicSupport] = useState(false);
    const [graphicLink, setGraphicLink] = useState('');

    useEffect(() => {
        const loadData = async () => {
            try {
                const [fetchedClients, fetchedPrograms] = await Promise.all([
                    getClients(),
                    getPrograms()
                ]);
                
                // Filter clients for advisor if not admin
                if (userInfo) {
                    if (userInfo.role === 'Admin' || userInfo.email === 'lchena@airedesantafe.com.ar') {
                        setClients(fetchedClients);
                    } else {
                        setClients(fetchedClients.filter(c => c.ownerId === userInfo.id));
                    }
                }
                setPrograms(fetchedPrograms);
            } catch (e) {
                console.error(e);
                toast({ title: 'Error cargando datos', variant: 'destructive' });
            } finally {
                setLoading(false);
            }
        };
        if (userInfo) loadData();
    }, [userInfo, toast]);

    const handleClientSelect = (clientId: string) => {
        setSelectedClientId(clientId);
        const client = clients.find(c => c.id === clientId);
        if (client) {
            setCuit(client.cuit || '');
            setRazonSocial(client.razonSocial || '');
            setDenominacion(client.denominacion || '');
            setRubro(client.rubro || '');
            setPhone(client.phone || '');
        }
    };

    const toggleProgram = (programId: string) => {
        setSelectedProgramIds(prev => 
            prev.includes(programId) 
                ? prev.filter(id => id !== programId)
                : [...prev, programId]
        );
        // Initialize dates if adding
        if (!programDates[programId]) {
            setProgramDates(prev => ({ ...prev, [programId]: [] }));
        }
    };

    const handleDateSelect = (programId: string, dates: Date[] | undefined) => {
        if (!dates) return;
        setProgramDates(prev => ({
            ...prev,
            [programId]: dates
        }));
    };

    const toggleSocial = (social: string) => {
        setReplicateSocials(prev => 
            prev.includes(social) 
                ? prev.filter(s => s !== social)
                : [...prev, social]
        );
    };

    // Calculations
    const totalValue = selectedProgramIds.reduce((acc, pid) => {
        const prog = programs.find(p => p.id === pid);
        const datesCount = programDates[pid]?.length || 0;
        const rate = prog?.rates?.notaComercial || 0;
        return acc + (rate * datesCount);
    }, 0);

    const saleValueNum = parseFloat(saleValue) || 0;
    const mismatch = saleValueNum > 0 ? (totalValue - saleValueNum) : 0;

    const handleSave = async () => {
        if (!selectedClientId || !userInfo) {
            toast({ title: 'Datos incompletos', description: 'Seleccione un cliente', variant: 'destructive' });
            return;
        }
        if (selectedProgramIds.length === 0) {
            toast({ title: 'Datos incompletos', description: 'Seleccione al menos un programa', variant: 'destructive' });
            return;
        }

        setSaving(true);
        try {
            const client = clients.find(c => c.id === selectedClientId);
            
            // 1. Update Client if needed (CUIT/Rubro)
            if (client && (client.cuit !== cuit || client.rubro !== rubro)) {
                await updateClientTangoMapping(client.id, { cuit, rubro }, userInfo.id, userInfo.name);
            }

            // 2. Prepare Data
            const noteData: Omit<CommercialNote, 'id' | 'createdAt'> = {
                clientId: selectedClientId,
                clientName: client?.denominacion || 'Unknown',
                cuit,
                advisorId: userInfo.id,
                advisorName: userInfo.name,
                razonSocial,
                denominacion,
                rubro,
                instagram,
                phone,
                whatsapp,
                address,
                programIds: selectedProgramIds,
                schedule: selectedProgramIds.reduce((acc, pid) => ({
                    ...acc,
                    [pid]: programDates[pid]?.map(d => d.toISOString()) || []
                }), {}),
                totalValue,
                saleValue: saleValueNum,
                mismatch,
                observations,
                replicateWeb,
                replicateSocials,
                graphicSupport,
                graphicSupportLink: graphicSupport ? graphicLink : undefined,
            };

            // 3. Save
            await saveCommercialNote(noteData, userInfo.id, userInfo.name);
            
            toast({ title: 'Nota guardada exitosamente' });
            
            // Reset crucial fields
            setSelectedProgramIds([]);
            setProgramDates({});
            setSaleValue('');
            setObservations('');
            
        } catch (error) {
            console.error(error);
            toast({ title: 'Error al guardar', variant: 'destructive' });
        } finally {
            setSaving(false);
        }
    };

    if (loading) return <div className="flex h-full items-center justify-center"><Spinner size="large"/></div>;

    return (
        <div className="flex flex-col h-full overflow-hidden">
            <Header title="Nueva Nota Comercial">
                <Button onClick={handleSave} disabled={saving}>
                    {saving ? <Spinner size="small" className="mr-2"/> : <Save className="mr-2 h-4 w-4"/>}
                    Guardar Nota
                </Button>
            </Header>
            <main className="flex-1 overflow-auto p-4 md:p-6 space-y-6">
                
                {/* Datos del Cliente */}
                <Card>
                    <CardHeader><CardTitle>Datos del Cliente</CardTitle></CardHeader>
                    <CardContent className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                         <div className="space-y-2">
                            <Label>Cliente</Label>
                            <Select value={selectedClientId} onValueChange={handleClientSelect}>
                                <SelectTrigger><SelectValue placeholder="Seleccionar..." /></SelectTrigger>
                                <SelectContent>
                                    {clients.map(c => <SelectItem key={c.id} value={c.id}>{c.denominacion}</SelectItem>)}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-2">
                            <Label>CUIT</Label>
                            <Input value={cuit} onChange={e => setCuit(e.target.value)} placeholder="00-00000000-0" />
                        </div>
                        <div className="space-y-2">
                            <Label>Vendedor</Label>
                            <Input value={userInfo?.name} disabled className="bg-muted" />
                        </div>
                        <div className="space-y-2">
                            <Label>Razón Social</Label>
                            <Input value={razonSocial} onChange={e => setRazonSocial(e.target.value)} />
                        </div>
                        <div className="space-y-2">
                            <Label>Denominación Comercial</Label>
                            <Input value={denominacion} onChange={e => setDenominacion(e.target.value)} />
                        </div>
                        <div className="space-y-2">
                            <Label>Rubro</Label>
                            <Input value={rubro} onChange={e => setRubro(e.target.value)} />
                        </div>
                        <div className="space-y-2">
                            <Label>Instagram (Link)</Label>
                            <Input value={instagram} onChange={e => setInstagram(e.target.value)} placeholder="https://instagram.com/..." />
                        </div>
                         <div className="space-y-2">
                            <Label>Teléfono Comercial</Label>
                            <Input value={phone} onChange={e => setPhone(e.target.value)} placeholder="0342-155..." />
                        </div>
                         <div className="space-y-2">
                            <Label>WhatsApp</Label>
                            <Input value={whatsapp} onChange={e => setWhatsapp(e.target.value)} placeholder="0342-155..." />
                        </div>
                         <div className="space-y-2 md:col-span-3">
                            <Label>Domicilio Comercial</Label>
                            <Input value={address} onChange={e => setAddress(e.target.value)} />
                        </div>
                    </CardContent>
                </Card>

                {/* Programación */}
                <Card>
                    <CardHeader><CardTitle>Programación</CardTitle></CardHeader>
                    <CardContent className="space-y-4">
                        <div className="space-y-2">
                            <Label>Seleccionar Programas</Label>
                            <div className="flex flex-wrap gap-2">
                                {programs.map(prog => (
                                    <div key={prog.id} className="flex items-center space-x-2 border p-2 rounded-md hover:bg-muted/50 cursor-pointer" onClick={() => toggleProgram(prog.id)}>
                                        <Checkbox checked={selectedProgramIds.includes(prog.id)} onCheckedChange={() => toggleProgram(prog.id)} />
                                        <span className="text-sm font-medium">{prog.name}</span>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {selectedProgramIds.length > 0 && (
                            <div className="grid gap-4 md:grid-cols-2">
                                {selectedProgramIds.map(pid => {
                                    const prog = programs.find(p => p.id === pid);
                                    return (
                                        <Card key={pid} className="border-dashed">
                                            <CardHeader className="pb-2">
                                                <CardTitle className="text-base font-medium">{prog?.name}</CardTitle>
                                                <p className="text-xs text-muted-foreground">Valor unitario: ${prog?.rates?.notaComercial?.toLocaleString() || 0}</p>
                                            </CardHeader>
                                            <CardContent>
                                                <div className="space-y-2">
                                                    <Label>Fechas</Label>
                                                    <Popover>
                                                        <PopoverTrigger asChild>
                                                            <Button variant={"outline"} className={cn("w-full justify-start text-left font-normal", !programDates[pid]?.length && "text-muted-foreground")}>
                                                                <CalendarIcon className="mr-2 h-4 w-4" />
                                                                {programDates[pid]?.length > 0 ? `${programDates[pid].length} días seleccionados` : <span>Seleccionar fechas</span>}
                                                            </Button>
                                                        </PopoverTrigger>
                                                        <PopoverContent className="w-auto p-0" align="start">
                                                            <Calendar
                                                                mode="multiple"
                                                                selected={programDates[pid]}
                                                                onSelect={(dates) => handleDateSelect(pid, dates)}
                                                                initialFocus
                                                                locale={es}
                                                            />
                                                        </PopoverContent>
                                                    </Popover>
                                                    <div className="text-sm text-muted-foreground">
                                                        Subtotal: ${( (programDates[pid]?.length || 0) * (prog?.rates?.notaComercial || 0) ).toLocaleString()}
                                                    </div>
                                                </div>
                                            </CardContent>
                                        </Card>
                                    );
                                })}
                            </div>
                        )}
                    </CardContent>
                </Card>

                {/* Valores y Cierre */}
                 <Card>
                    <CardHeader><CardTitle>Valores y Detalles</CardTitle></CardHeader>
                    <CardContent className="grid gap-6 md:grid-cols-2">
                        <div className="space-y-4">
                             <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label>Valor Total (Tarifario)</Label>
                                    <Input value={`$ ${totalValue.toLocaleString()}`} disabled className="font-bold bg-muted" />
                                </div>
                                <div className="space-y-2">
                                    <Label>Valor de Venta</Label>
                                    <Input 
                                        type="number" 
                                        value={saleValue} 
                                        onChange={e => setSaleValue(e.target.value)} 
                                        placeholder="0"
                                    />
                                </div>
                            </div>
                            {mismatch !== 0 && (
                                <div className="p-3 rounded-md bg-yellow-50 text-yellow-800 border border-yellow-200 text-sm">
                                    <strong>Desajuste:</strong> ${mismatch.toLocaleString()} (Diferencia entre tarifario y venta)
                                </div>
                            )}
                             <div className="space-y-2">
                                <Label>Observaciones Generales</Label>
                                <Textarea 
                                    value={observations} 
                                    onChange={e => setObservations(e.target.value)} 
                                    placeholder="Objetivo del cliente, indicaciones..."
                                    className="min-h-[100px]"
                                />
                            </div>
                        </div>

                        <div className="space-y-6 border-l pl-0 md:pl-6">
                            <div className="flex items-center space-x-2">
                                <Switch checked={replicateWeb} onCheckedChange={setReplicateWeb} />
                                <Label>Replica Nota Web</Label>
                            </div>
                            
                             <div className="space-y-2">
                                <Label>Replica Redes Sociales</Label>
                                <div className="flex gap-4">
                                    {['Facebook', 'Instagram', 'X'].map(social => (
                                        <div key={social} className="flex items-center space-x-2">
                                            <Checkbox checked={replicateSocials.includes(social)} onCheckedChange={() => toggleSocial(social)} />
                                            <span>{social}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>

                             <div className="space-y-2">
                                <div className="flex items-center space-x-2">
                                    <Switch checked={graphicSupport} onCheckedChange={setGraphicSupport} />
                                    <Label>Agrega Soporte Gráfico</Label>
                                </div>
                                {graphicSupport && (
                                    <Input 
                                        value={graphicLink} 
                                        onChange={e => setGraphicLink(e.target.value)} 
                                        placeholder="Pegar link de Google Drive aquí..." 
                                        className="mt-2"
                                    />
                                )}
                            </div>
                        </div>
                    </CardContent>
                </Card>

            </main>
        </div>
    );
}
