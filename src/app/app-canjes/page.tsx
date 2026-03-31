'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { useRouter } from 'next/navigation';
import { getClients, createClient, createOpportunity, saveConvenioCanje, createAdvertisingOrder, getPrograms, getProspects } from '@/lib/firebase-service';
import type { Client, Program, Prospect } from '@/lib/types';
import { sendEmail } from '@/lib/google-gmail-service';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { advertisingOrderSchema, AdvertisingOrderFormValues } from '@/lib/validators/advertising';
import { Form } from '@/components/ui/form';
import { SrlSection } from '@/components/publicidad/srl-section';
import { SasSection } from '@/components/publicidad/sas-section';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { Spinner } from '@/components/ui/spinner';
import { ArrowRight, ArrowLeft, CheckCircle2, Search, Radio, Trash2 } from 'lucide-react';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import { cn } from '@/lib/utils';

import { ConvenioPdf } from '@/components/canjes/convenio-pdf';
import { AdvertisingOrderPdf } from '@/components/publicidad/advertising-pdf';

export default function AppCanjesMobile() {
    const { userInfo, getGoogleAccessToken } = useAuth();
    const router = useRouter();
    const { toast } = useToast();
    
    const [step, setStep] = useState(1);
    const [loading, setLoading] = useState(true);
    const [isSubmitting, setIsSubmitting] = useState(false);
    
    const [clients, setClients] = useState<Client[]>([]);
    const [prospects, setProspects] = useState<Prospect[]>([]);
    const [programs, setPrograms] = useState<Program[]>([]);
    
    // --- ESTADOS PASO 1: CLIENTE ---
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedClient, setSelectedClient] = useState<Client | null>(null);
    const [isNewClient, setIsNewClient] = useState(false);
    const [newClientData, setNewClientData] = useState({ denominacion: '', cuit: '', phone: '', email: '' });

    // --- ESTADOS PASO 2: OPORTUNIDAD ---
    const [oppTitle, setOppTitle] = useState('');
    const [oppValue, setOppValue] = useState('');

    // --- ESTADOS PASO 3: CONVENIO ---
    const [radioEntrega, setRadioEntrega] = useState('');
    const [clienteEntrega, setClienteEntrega] = useState('');
    const [fechaInicio, setFechaInicio] = useState('');
    const [fechaFin, setFechaFin] = useState('');

    // --- ESTADOS PASO 4: ORDEN DE PUBLICIDAD ---
    const [materialUrls, setMaterialUrls] = useState<string[]>(['']);
    
    const form = useForm<AdvertisingOrderFormValues>({
        resolver: zodResolver(advertisingOrderSchema),
        defaultValues: {
            srlItems: [],
            sasItems: [],
            adjustmentSas: 0,
            adjustmentSrl: 0,
            commissionSrl: 0,
            agencySale: false,
            certReq: false,
            materialSent: false,
            materialUrl: '',
            observations: ''
        }
    });

    const handleAddMaterialUrl = () => setMaterialUrls([...materialUrls, '']);
    const handleMaterialUrlChange = (index: number, value: string) => {
        const newUrls = [...materialUrls];
        newUrls[index] = value;
        setMaterialUrls(newUrls);
    };
    const handleRemoveMaterialUrl = (index: number) => {
        const newUrls = materialUrls.filter((_, i) => i !== index);
        setMaterialUrls(newUrls.length ? newUrls : ['']);
    };

    // Refs para PDFs
    const convenioPdfRef = useRef<HTMLDivElement>(null);
    const pautadoPdfRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!userInfo) return;
        const load = async () => {
            try {
                const [c, p, pros] = await Promise.all([getClients(), getPrograms(), getProspects()]);
                setClients(c);
                setPrograms(p);
                setProspects(pros);
            } catch (e) {
                console.error(e);
            } finally {
                setLoading(false);
            }
        };
        load();
    }, [userInfo]);

    const searchResults = React.useMemo(() => {
        if (searchQuery.length < 3) return [];
        const query = searchQuery.toLowerCase();
        
        const matchedClients = clients.filter(c => 
            c.denominacion.toLowerCase().includes(query) || 
            (c.razonSocial && c.razonSocial.toLowerCase().includes(query))
        );
        const matchedProspects = prospects.filter(p => 
            p.companyName.toLowerCase().includes(query)
        );

        return [...matchedClients, ...matchedProspects].slice(0, 10);
    }, [searchQuery, clients, prospects]);

    const handleNextStep = async () => {
        if (step === 1) {
            if (!isNewClient && !selectedClient) return toast({ title: "Selecciona un cliente", variant: "destructive" });
            if (isNewClient && !newClientData.denominacion) return toast({ title: "La denominación es obligatoria", variant: "destructive" });
            if (!oppTitle) setOppTitle(`Canje ${new Date().getFullYear()} - ${selectedClient?.denominacion || newClientData.denominacion}`);
        }
        if (step === 2) {
            if (!oppTitle || !oppValue) return toast({ title: "Completa el título y el valor", variant: "destructive" });
        }
        if (step === 3) {
            if (!radioEntrega || !clienteEntrega || !fechaInicio || !fechaFin) return toast({ title: "Completa todos los campos del convenio", variant: "destructive" });
            form.setValue('startDate', new Date(fechaInicio));
            form.setValue('endDate', new Date(fechaFin));
        }
        if (step === 4) {
            const isValid = await form.trigger(['srlItems', 'sasItems']);
            if (!isValid) return toast({ title: "Revisa los campos del pautado", variant: "destructive" });
        }
        setStep(s => s + 1);
    };

    const generatePdfBase64 = async (element: HTMLElement) => {
        const pdf = new jsPDF('p', 'mm', 'a4');
        const canvas = await html2canvas(element, { scale: 1.5, useCORS: true });
        const imgData = canvas.toDataURL('image/jpeg', 0.8);
        const pdfWidth = pdf.internal.pageSize.getWidth();
        const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
        pdf.addImage(imgData, 'JPEG', 0, 0, pdfWidth, pdfHeight);
        return pdf.output('datauristring').split(',')[1];
    };

    const handleFinalSubmit = async () => {
        setIsSubmitting(true);
        
        try {
            let finalClientId = selectedClient?.id || '';
            let finalClientName = selectedClient?.denominacion || '';
            
            if (isNewClient) {
                finalClientId = await createClient({
                    ...newClientData,
                    razonSocial: newClientData.denominacion,
                    condicionIVA: 'Responsable Inscripto',
                    tipoEntidad: 'Privada',
                    provincia: 'Santa Fe',
                    localidad: 'Santa Fe',
                    rubro: 'Canje',
                    isNewClient: true
                }, userInfo!.id, userInfo!.name);
                finalClientName = newClientData.denominacion;
            }

            // Notar que la oportunidad se crea a nombre del vendedor original si el cliente ya existía
            const clientOwnerId = selectedClient?.ownerId || userInfo!.id;
            const clientOwnerName = selectedClient?.ownerName || userInfo!.name;

            const oppId = await createOpportunity({
                title: oppTitle,
                clientId: finalClientId,
                clientName: finalClientName,
                value: Number(oppValue),
                stage: 'Cerrado - Ganado', 
                closeDate: new Date().toISOString(),
                createdAt: new Date().toISOString(),
                formaDePago: [],
                periodicidad: [],
            }, userInfo!.id, userInfo!.name, clientOwnerName);

            const canjeId = await saveConvenioCanje({
                clientId: finalClientId,
                clientName: finalClientName,
                advisorId: userInfo!.id, // 🟢 El convenio queda a nombre del Asesor Canjes
                advisorName: userInfo!.name,
                opportunityId: oppId,
                radioEntrega,
                clienteEntrega,
                fechaInicio: new Date(fechaInicio).toISOString(),
                fechaFin: new Date(fechaFin).toISOString(),
            }, userInfo!.id, userInfo!.name);

            const formValues = form.getValues();
            const validSrlItems = formValues.srlItems?.filter(item => item.month) || [];
            const validSasItems = formValues.sasItems?.filter(item => item.month) || [];

            await createAdvertisingOrder({
                clientId: finalClientId,
                clientName: finalClientName,
                product: oppTitle,
                accountExecutive: userInfo!.name, // 🟢 La OP queda a nombre del Asesor Canjes
                opportunityId: oppId,
                opportunityTitle: oppTitle,
                canjeId: canjeId,
                startDate: new Date(fechaInicio).toISOString(),
                endDate: new Date(fechaFin).toISOString(),
                materialSent: false,
                materialUrls: materialUrls.filter(u => u.trim() !== ''),
                certReq: false,
                agencySale: false,
                commissionSrl: 0,
                adjustmentSas: 0,
                adjustmentSrl: 0,
                observations: formValues.observations || `PAUTA POR CANJE.\n`,
                srlItems: validSrlItems,
                sasItems: validSasItems,
                createdBy: userInfo!.id
            });

            const token = await getGoogleAccessToken();
            if (token && convenioPdfRef.current && pautadoPdfRef.current) {
                const convenio64 = await generatePdfBase64(convenioPdfRef.current);
                const pautado64 = await generatePdfBase64(pautadoPdfRef.current);

                const emailBody = `
                    <div style="font-family: Arial, sans-serif; color: #333;">
                        <h2 style="color: #dc2626;">Nuevo Ingreso por Canje</h2>
                        <p>El asesor <strong>${userInfo!.name}</strong> ha cerrado un nuevo canje mediante la App Móvil.</p>
                        <div style="background-color: #f5f5f5; padding: 15px; border-left: 4px solid #dc2626; margin: 20px 0;">
                            <p><strong>Cliente:</strong> ${finalClientName} ${isNewClient ? '<span style="color:#2563eb; font-weight:bold;">(CLIENTE NUEVO)</span>' : ''}</p>
                            <p><strong>Valor Canje:</strong> $${Number(oppValue).toLocaleString()}</p>
                            <p><strong>Vigencia:</strong> ${format(new Date(fechaInicio), 'dd/MM/yyyy')} al ${format(new Date(fechaFin), 'dd/MM/yyyy')}</p>
                        </div>
                        <p>Se adjunta el Convenio firmado por el sistema y la Orden de Publicidad generada automáticamente.</p>
                    </div>
                `;

                await sendEmail({
                    accessToken: token,
                    to: ['lchena@airedesantafe.com.ar', userInfo!.email], 
                    subject: `Nuevo Canje: ${finalClientName} - ${userInfo!.name}`,
                    body: emailBody,
                    attachments: [
                        { filename: `Convenio_${finalClientName.replace(/ /g, "_")}.pdf`, content: convenio64, encoding: 'base64' },
                        { filename: `OP_${finalClientName.replace(/ /g, "_")}.pdf`, content: pautado64, encoding: 'base64' }
                    ]
                });
            }

            toast({ title: '¡Canje procesado y enviado con éxito!' });
            setStep(1);
            setSelectedClient(null);
            setIsNewClient(false);
            setOppTitle('');
            setOppValue('');
            setRadioEntrega('');
            setClienteEntrega('');
            setSearchQuery('');
            setMaterialUrls(['']);
            form.reset();
            
        } catch (error) {
            console.error(error);
            toast({ title: 'Error al procesar el canje', variant: 'destructive' });
        } finally {
            setIsSubmitting(false);
        }
    };

    if (loading) return <div className="flex h-screen items-center justify-center bg-slate-50"><Spinner size="large" /></div>;

    const previewOrderData: any = {
        clientName: isNewClient ? newClientData.denominacion : selectedClient?.denominacion,
        accountExecutive: userInfo?.name,
        startDate: fechaInicio ? new Date(fechaInicio).toISOString() : new Date().toISOString(),
        endDate: fechaFin ? new Date(fechaFin).toISOString() : new Date().toISOString(),
        srlItems: form.getValues('srlItems') || [],
        sasItems: form.getValues('sasItems') || [],
        totalOrder: 0,
        observations: form.getValues('observations') || `PAUTA POR CANJE.`
    };

    return (
        <div className="min-h-screen bg-slate-50 flex flex-col font-sans">
            <header className="bg-red-600 text-white p-4 shadow-md sticky top-0 z-10">
                <div className="flex items-center justify-between">
                    <h1 className="font-bold text-lg flex items-center gap-2"><Radio className="h-5 w-5"/> App Canjes</h1>
                    <span className="text-xs bg-red-800 px-2 py-1 rounded-full">Paso {step} de 5</span>
                </div>
                <div className="w-full bg-red-800 h-1.5 mt-3 rounded-full overflow-hidden">
                    <div className="bg-white h-full transition-all duration-300" style={{ width: `${(step / 5) * 100}%` }}></div>
                </div>
            </header>

            <main className="flex-1 p-4 pb-24 overflow-y-auto">
                {step === 1 && (
                    <Card className="border-0 shadow-sm">
                        <CardHeader><CardTitle className="text-xl text-slate-800">1. Identificar Cliente</CardTitle></CardHeader>
                        <CardContent className="space-y-6">
                            <div className="flex items-center space-x-2 bg-slate-100 p-3 rounded-md">
                                <Checkbox id="newClient" checked={isNewClient} onCheckedChange={(c) => {
                                    setIsNewClient(!!c);
                                    if(!!c) setSelectedClient(null);
                                }} />
                                <Label htmlFor="newClient" className="text-base font-semibold text-primary">Es un cliente nuevo</Label>
                            </div>

                            {!isNewClient ? (
                                <div className="space-y-4 animate-in fade-in">
                                    <div className="relative">
                                        <Search className="absolute left-3 top-3 h-5 w-5 text-gray-400" />
                                        <Input className="pl-10 h-12 text-lg" placeholder="Buscar cliente existente (mín. 3 letras)..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />
                                    </div>
                                    
                                    {searchQuery.length > 0 && searchQuery.length < 3 && (
                                        <p className="text-sm text-muted-foreground text-center">Escribe al menos 3 caracteres para buscar...</p>
                                    )}

                                    <div className="space-y-2">
                                        {searchResults.map(item => {
                                            const isClient = 'denominacion' in item;
                                            const name = isClient ? item.denominacion : item.companyName;
                                            const razonSocial = isClient ? item.razonSocial : '';
                                            const ownerId = item.ownerId;
                                            const ownerName = item.ownerName || 'Sin asignar';
                                            
                                            // 🟢 REGLA DE SELECCIÓN ACTUALIZADA
                                            const canSelect = isClient && (
                                                ownerId === userInfo?.id || 
                                                userInfo?.role === 'Admin' || 
                                                (item as Client).allowCanjes === true
                                            );

                                            return (
                                                <div 
                                                    key={item.id} 
                                                    onClick={() => canSelect ? setSelectedClient(item as Client) : undefined}
                                                    className={cn(
                                                        "p-4 border rounded-lg flex flex-col justify-center transition-colors",
                                                        canSelect 
                                                            ? (selectedClient?.id === item.id ? 'border-red-500 bg-red-50 cursor-pointer' : 'bg-white cursor-pointer hover:bg-gray-50')
                                                            : 'bg-gray-100 opacity-80 cursor-not-allowed'
                                                    )}
                                                >
                                                    <div className="flex items-center justify-between">
                                                        <span className="font-medium text-lg">{name} {razonSocial ? `(${razonSocial})` : ''}</span>
                                                        {selectedClient?.id === item.id && <CheckCircle2 className="text-red-500 h-5 w-5" />}
                                                    </div>
                                                    {!canSelect && (
                                                        <span className="text-sm text-red-600 font-bold mt-1">
                                                            {ownerId !== userInfo?.id 
                                                                ? `Asignado a: ${ownerName} (No habilitado para canje externo)`
                                                                : `Es un Prospecto. Conviértelo a Cliente en el CRM.`}
                                                        </span>
                                                    )}
                                                </div>
                                            );
                                        })}
                                        
                                        {searchQuery.length >= 3 && searchResults.length === 0 && (
                                            <p className="text-sm text-muted-foreground text-center pt-4">No se encontraron resultados. Márcarlo como "Cliente nuevo" arriba.</p>
                                        )}
                                    </div>
                                </div>
                            ) : (
                                <div className="space-y-4 animate-in slide-in-from-right-4">
                                    <div className="space-y-1"><Label>Nombre de Fantasía *</Label><Input className="h-12" value={newClientData.denominacion} onChange={e=>setNewClientData({...newClientData, denominacion: e.target.value})}/></div>
                                    <div className="space-y-1"><Label>CUIT</Label><Input type="number" className="h-12" value={newClientData.cuit} onChange={e=>setNewClientData({...newClientData, cuit: e.target.value})}/></div>
                                    <div className="space-y-1"><Label>Teléfono</Label><Input type="tel" className="h-12" value={newClientData.phone} onChange={e=>setNewClientData({...newClientData, phone: e.target.value})}/></div>
                                    <div className="space-y-1"><Label>Email</Label><Input type="email" className="h-12" value={newClientData.email} onChange={e=>setNewClientData({...newClientData, email: e.target.value})}/></div>
                                </div>
                            )}
                        </CardContent>
                    </Card>
                )}

                {step === 2 && (
                    <Card className="border-0 shadow-sm animate-in slide-in-from-right-4">
                        <CardHeader>
                            <CardTitle className="text-xl text-slate-800">2. Datos Comerciales</CardTitle>
                            <CardDescription>Para: {isNewClient ? newClientData.denominacion : selectedClient?.denominacion}</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-6">
                            <div className="space-y-2">
                                <Label className="text-base">Nombre del Acuerdo (Oportunidad) *</Label>
                                <Input className="h-12 text-lg" value={oppTitle} onChange={e=>setOppTitle(e.target.value)} placeholder="Ej: Canje Gastronómico 2026"/>
                            </div>
                            <div className="space-y-2">
                                <Label className="text-base">Valor monetario del Canje ($) *</Label>
                                <Input type="number" className="h-12 text-2xl font-bold text-green-700" value={oppValue} onChange={e=>setOppValue(e.target.value)} placeholder="0.00"/>
                                <p className="text-xs text-muted-foreground">Valor estimado en pesos de lo que entrega el cliente.</p>
                            </div>
                        </CardContent>
                    </Card>
                )}

                {step === 3 && (
                    <Card className="border-0 shadow-sm animate-in slide-in-from-right-4">
                        <CardHeader><CardTitle className="text-xl text-slate-800">3. Redacción del Convenio</CardTitle></CardHeader>
                        <CardContent className="space-y-6">
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2"><Label>Fecha de Inicio *</Label><Input type="date" className="h-12" value={fechaInicio} onChange={e=>setFechaInicio(e.target.value)}/></div>
                                <div className="space-y-2"><Label>Fecha de Fin *</Label><Input type="date" className="h-12" value={fechaFin} onChange={e=>setFechaFin(e.target.value)}/></div>
                            </div>
                            <div className="space-y-2">
                                <Label className="text-base text-red-600 font-bold">Aire de Santa Fe entrega: *</Label>
                                <Textarea className="h-32 text-base" placeholder="Detalla el pautado, menciones, banners..." value={radioEntrega} onChange={e=>setRadioEntrega(e.target.value)}/>
                            </div>
                            <div className="space-y-2">
                                <Label className="text-base text-blue-600 font-bold">El Cliente entrega: *</Label>
                                <Textarea className="h-32 text-base" placeholder="Detalla los productos, viandas, vouchers..." value={clienteEntrega} onChange={e=>setClienteEntrega(e.target.value)}/>
                            </div>
                        </CardContent>
                    </Card>
                )}

                {step === 4 && (
                    <Card className="border-0 shadow-sm animate-in slide-in-from-right-4">
                        <CardHeader><CardTitle className="text-xl text-slate-800">4. Pautado (Orden de Publicidad)</CardTitle></CardHeader>
                        <CardContent className="space-y-6 p-2 sm:p-6">
                            <Form {...form}>
                                <div className="space-y-6">
                                    <div className="space-y-2 bg-white p-4 rounded border">
                                        <Label className="text-base font-bold">Links de Materiales</Label>
                                        <div className="space-y-2 mt-2">
                                            {materialUrls.map((url, idx) => (
                                                <div key={idx} className="flex gap-2">
                                                    <Input value={url} onChange={e => handleMaterialUrlChange(idx, e.target.value)} placeholder="https://..." className="h-12" />
                                                    {materialUrls.length > 1 && (
                                                        <Button type="button" size="icon" variant="ghost" className="h-12 w-12 text-red-500 hover:bg-red-100 shrink-0" onClick={() => handleRemoveMaterialUrl(idx)}>
                                                            <Trash2 className="h-5 w-5"/>
                                                        </Button>
                                                    )}
                                                </div>
                                            ))}
                                            <Button type="button" size="sm" variant="outline" onClick={handleAddMaterialUrl}>+ Agregar Link</Button>
                                        </div>
                                    </div>

                                    <div className="space-y-2 bg-white p-4 rounded border">
                                        <Label className="text-base font-bold">Observaciones Generales (OP)</Label>
                                        <Textarea {...form.register('observations')} placeholder="Ej: Pauta por canje..." className="h-24 mt-2" />
                                    </div>
                                    
                                    <div className="border rounded-md p-2 sm:p-4 bg-slate-50">
                                        <h3 className="font-bold text-lg mb-4 text-slate-700">Pautado AIRE SRL</h3>
                                        <SrlSection form={form} startDate={new Date(fechaInicio)} endDate={new Date(fechaFin)} programs={programs} />
                                    </div>

                                    <div className="border rounded-md p-2 sm:p-4 bg-slate-50">
                                        <h3 className="font-bold text-lg mb-4 text-slate-700">Pautado AIRE SAS</h3>
                                        <SasSection form={form} startDate={new Date(fechaInicio)} endDate={new Date(fechaFin)} />
                                    </div>
                                </div>
                            </Form>
                        </CardContent>
                    </Card>
                )}

                {step === 5 && (
                    <Card className="border-0 shadow-sm bg-green-50 border-green-200 animate-in zoom-in-95">
                        <CardHeader className="text-center pb-2">
                            <CheckCircle2 className="h-16 w-16 text-green-600 mx-auto mb-2" />
                            <CardTitle className="text-2xl text-green-800">Todo listo para enviar</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4 text-center">
                            <p className="text-slate-600">Al tocar el botón de abajo, el sistema procesará automáticamente:</p>
                            <ul className="text-left text-sm space-y-2 bg-white p-4 rounded-lg border shadow-inner">
                                <li>👤 {isNewClient ? 'Alta de nuevo cliente' : 'Asignación a cliente existente'}</li>
                                <li>💼 Creación de Oportunidad ganada (${oppValue})</li>
                                <li>📄 Generación y guardado de "Convenio de Canje"</li>
                                <li>📢 Generación de "Orden de Publicidad" completa</li>
                                <li>📧 Envío de email a Gerencia y a tu correo.</li>
                            </ul>
                        </CardContent>
                    </Card>
                )}
            </main>

            {/* BOTONERA FIJA INFERIOR */}
            <div className="fixed bottom-0 left-0 right-0 p-4 bg-white border-t shadow-[0_-5px_15px_rgba(0,0,0,0.05)] flex gap-3 z-20">
                {step > 1 && (
                    <Button variant="outline" className="h-14 w-14 rounded-full shrink-0" onClick={() => setStep(s => s - 1)}>
                        <ArrowLeft className="h-6 w-6"/>
                    </Button>
                )}
                {step < 5 ? (
                    <Button className="flex-1 h-14 text-lg rounded-full shadow-md bg-primary hover:bg-primary/90" onClick={handleNextStep}>
                        Siguiente <ArrowRight className="ml-2 h-5 w-5"/>
                    </Button>
                ) : (
                    <Button className="flex-1 h-14 text-lg rounded-full shadow-lg bg-green-600 hover:bg-green-700" onClick={handleFinalSubmit} disabled={isSubmitting}>
                        {isSubmitting ? <Spinner color="white" /> : 'Confirmar y Enviar'}
                    </Button>
                )}
            </div>

            {/* CONTENEDORES OCULTOS PARA RENDERIZAR PDFs */}
            <div style={{ position: 'fixed', top: '-10000px', left: '-10000px', zIndex: -1 }}>
                <ConvenioPdf 
                    ref={convenioPdfRef} 
                    convenio={{
                        clientName: isNewClient ? newClientData.denominacion : selectedClient?.denominacion,
                        advisorName: userInfo?.name,
                        fechaInicio, fechaFin, radioEntrega, clienteEntrega
                    }} 
                />
                <AdvertisingOrderPdf ref={pautadoPdfRef} order={previewOrderData} programs={programs} />
            </div>
        </div>
    );
}
