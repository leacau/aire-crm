'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { 
    getClients, createClient, createOpportunity, saveConvenioCanje, createAdvertisingOrder, 
    getPrograms, getProspects, getConveniosCanje, getOpportunityById, getAdvertisingOrdersByOpportunity, 
    updateOpportunity, updateConvenioCanje, updateAdvertisingOrder, deleteConvenioCanje 
} from '@/lib/firebase-service';
import type { Client, Program, Prospect, ConvenioCanje, CondicionIVA, TipoEntidad, AdvertisingOrder } from '@/lib/types';
import { sendEmail } from '@/lib/google-gmail-service';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { advertisingOrderSchema, AdvertisingOrderFormValues } from '@/lib/validators/advertising';
import { Form } from '@/components/ui/form';
import { SrlSection } from '@/components/publicidad/srl-section';
import { SasSection } from '@/components/publicidad/sas-section';

import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import { formatCuit, cleanCuit } from '@/lib/utils';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { Spinner } from '@/components/ui/spinner';
import { ArrowRight, ArrowLeft, CheckCircle2, Search, Radio, Trash2, Plus, Clock, FileText, Edit, Copy, ExternalLink } from 'lucide-react';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import { cn } from '@/lib/utils';

import { ConvenioPdf } from '@/components/canjes/convenio-pdf';
import { AdvertisingOrderPdf } from '@/components/publicidad/advertising-pdf';
import { ClientPdf } from '@/components/clients/client-pdf';
import { provinciasArgentina, tipoEntidadOptions, condicionIVAOptions } from '@/lib/data';

type BillingType = 'SRL' | 'SAS' | 'AVION';

export default function AppCanjesMobile() {
    const { userInfo, getGoogleAccessToken } = useAuth();
    const { toast } = useToast();
    
    // --- ESTADOS DE VISTA ---
    const [view, setView] = useState<'list' | 'form' | 'detail'>('list');
    const [step, setStep] = useState(1);
    const [loading, setLoading] = useState(true);
    const [isSubmitting, setIsSubmitting] = useState(false);
    
    // --- ESTADOS DE EDICIÓN ---
    const [editId, setEditId] = useState<string | undefined>();
    const [editOppId, setEditOppId] = useState<string | undefined>();
    const [editAdOrderId, setEditAdOrderId] = useState<string | undefined>();
    
    // --- DATA ---
    const [myCanjes, setMyCanjes] = useState<ConvenioCanje[]>([]);
    const [selectedCanjeDetail, setSelectedCanjeDetail] = useState<ConvenioCanje | null>(null);
    const [selectedAdOrder, setSelectedAdOrder] = useState<AdvertisingOrder | null>(null); // 🟢 ORDEN DE PUBLICIDAD ASOCIADA
    const [clients, setClients] = useState<Client[]>([]);
    const [prospects, setProspects] = useState<Prospect[]>([]);
    const [programs, setPrograms] = useState<Program[]>([]);
    
    // --- ESTADOS PASO 1: CLIENTE ---
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedClient, setSelectedClient] = useState<Client | null>(null);
    const [isNewClient, setIsNewClient] = useState(false);
    
    const [newClientData, setNewClientData] = useState({ 
        denominacion: '', razonSocial: '', cuit: '', 
        condicionIVA: 'Responsable Inscripto' as CondicionIVA, 
        provincia: 'Santa Fe', localidad: 'Santa Fe', tipoEntidad: 'Privada' as TipoEntidad, 
        rubro: '', phone: '', email: '' 
    });

    // --- ESTADOS PASO 2: OPORTUNIDAD & FACTURACION ---
    const [oppTitle, setOppTitle] = useState('');
    const [oppValue, setOppValue] = useState('');
    const [billingType, setBillingType] = useState<BillingType>('AVION');

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
            srlItems: [], sasItems: [], adjustmentSas: 0, adjustmentSrl: 0, commissionSrl: 0,
            agencySale: false, certReq: false, materialSent: false, materialUrl: '', observations: ''
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
    const clientPdfRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!userInfo) return;
        loadData();
    }, [userInfo]);

    const loadData = async () => {
        setLoading(true);
        try {
            const [c, p, pros, allConvenios] = await Promise.all([getClients(), getPrograms(), getProspects(), getConveniosCanje()]);
            setClients(c);
            setPrograms(p);
            setProspects(pros);
            
            const isBossOrAdmin = userInfo?.role === 'Jefe' || userInfo?.role === 'Gerencia' || userInfo?.role === 'Administracion' || userInfo?.role === 'Admin';
            if (isBossOrAdmin) {
                setMyCanjes(allConvenios);
            } else {
                setMyCanjes(allConvenios.filter(conv => conv.advisorId === userInfo?.id));
            }
        } catch (e) {
            console.error(e);
            toast({ title: 'Error al cargar datos', variant: 'destructive'});
        } finally {
            setLoading(false);
        }
    };

    const searchResults = React.useMemo(() => {
        if (searchQuery.length < 3) return [];
        const query = searchQuery.toLowerCase();
        const cleanedQuery = cleanCuit(query); 
        
        const matchedClients = clients.filter(c => 
            c.denominacion.toLowerCase().includes(query) || 
            (c.razonSocial && c.razonSocial.toLowerCase().includes(query)) ||
            (c.cuit && cleanCuit(c.cuit).includes(cleanedQuery))
        );
        const matchedProspects = prospects.filter(p => p.companyName.toLowerCase().includes(query));

        return [...matchedClients, ...matchedProspects].slice(0, 10);
    }, [searchQuery, clients, prospects]);

    const resetWizard = () => {
        setStep(1);
        setSelectedClient(null);
        setIsNewClient(false);
        setNewClientData({ denominacion: '', razonSocial: '', cuit: '', condicionIVA: 'Responsable Inscripto', provincia: 'Santa Fe', localidad: 'Santa Fe', tipoEntidad: 'Privada', rubro: '', phone: '', email: '' });
        setOppTitle('');
        setOppValue('');
        setBillingType('AVION');
        setRadioEntrega('');
        setClienteEntrega('');
        setSearchQuery('');
        setMaterialUrls(['']);
        setEditId(undefined);
        setEditOppId(undefined);
        setEditAdOrderId(undefined);
        form.reset();
    };

    const loadForEditOrClone = async (mode: 'edit' | 'clone') => {
        if (!selectedCanjeDetail) return;
        setLoading(true);
        try {
            const opp = await getOpportunityById(selectedCanjeDetail.opportunityId);
            const adOrders = await getAdvertisingOrdersByOpportunity(selectedCanjeDetail.opportunityId);
            const adOrder = adOrders[0]; 

            const client = clients.find(c => c.id === selectedCanjeDetail.clientId);
            if (client) setSelectedClient(client);
            setIsNewClient(false);

            if (opp) {
                setOppTitle(mode === 'clone' ? `${opp.title} (Copia)` : opp.title);
                setOppValue(opp.value.toString());
            }

            let bType: BillingType = 'AVION';
            if (selectedCanjeDetail.observaciones?.includes('SRL')) bType = 'SRL';
            else if (selectedCanjeDetail.observaciones?.includes('SAS')) bType = 'SAS';
            setBillingType(bType);

            setFechaInicio(selectedCanjeDetail.fechaInicio ? selectedCanjeDetail.fechaInicio.split('T')[0] : '');
            setFechaFin(selectedCanjeDetail.fechaFin ? selectedCanjeDetail.fechaFin.split('T')[0] : '');
            setRadioEntrega(selectedCanjeDetail.radioEntrega || '');
            setClienteEntrega(selectedCanjeDetail.clienteEntrega || '');

            if (adOrder) {
                setMaterialUrls(adOrder.materialUrls?.length ? adOrder.materialUrls : ['']);
                let obs = adOrder.observations || '';
                obs = obs.replace(/Facturación solicitada: (SRL|SAS|AVIÓN)/g, '').replace(/Facturación: (SRL|SAS|AVIÓN)/g, '').replace(/PAUTA POR CANJE\./g, '').trim();

                form.reset({
                    srlItems: adOrder.srlItems || [],
                    sasItems: adOrder.sasItems || [],
                    adjustmentSas: adOrder.adjustmentSas || 0,
                    adjustmentSrl: adOrder.adjustmentSrl || 0,
                    commissionSrl: adOrder.commissionSrl || 0,
                    agencySale: adOrder.agencySale || false,
                    certReq: adOrder.certReq || false,
                    materialSent: adOrder.materialSent || false,
                    materialUrl: '',
                    observations: obs
                });
            }

            if (mode === 'edit') {
                setEditId(selectedCanjeDetail.id);
                setEditOppId(selectedCanjeDetail.opportunityId);
                setEditAdOrderId(adOrder?.id);
            } else {
                setEditId(undefined);
                setEditOppId(undefined);
                setEditAdOrderId(undefined);
            }

            setStep(1);
            setView('form');
        } catch (error) {
            console.error(error);
            toast({ title: 'Error al cargar los datos', variant: 'destructive' });
        } finally {
            setLoading(false);
        }
    };

    const handleDeleteCanje = async () => {
        if (!selectedCanjeDetail || !userInfo) return;
        if (window.confirm("¿Estás seguro de que deseas eliminar este canje? También se eliminará la oportunidad y el pautado asociado de forma irreversible.")) {
            setLoading(true);
            try {
                await deleteConvenioCanje(selectedCanjeDetail.id!, selectedCanjeDetail.opportunityId, userInfo.id, userInfo.name);
                toast({ title: 'Canje y registros eliminados' });
                setSelectedCanjeDetail(null);
                setView('list');
                loadData();
            } catch (error) {
                console.error(error);
                toast({ title: 'Error al eliminar', variant: 'destructive' });
            } finally {
                setLoading(false);
            }
        }
    };

    const handleNextStep = async () => {
        if (step === 1) {
            if (!isNewClient && !selectedClient) return toast({ title: "Selecciona un cliente", variant: "destructive" });
            if (isNewClient) {
                if (!newClientData.denominacion || !newClientData.razonSocial || !newClientData.provincia || !newClientData.localidad) {
                    return toast({ title: "Faltan datos obligatorios del cliente nuevo", variant: "destructive" });
                }
                const cleanedCuit = cleanCuit(newClientData.cuit);
                if (cleanedCuit) {
                    const exists = clients.find(c => cleanCuit(c.cuit) === cleanedCuit);
                    if (exists) return toast({ title: `El CUIT ya pertenece a ${exists.denominacion}`, variant: "destructive" });
                }
            }
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
                    cuit: cleanCuit(newClientData.cuit),
                    isNewClient: true
                }, userInfo!.id, userInfo!.name);
                finalClientName = newClientData.denominacion;
            }

            const clientOwnerName = selectedClient?.ownerName || userInfo!.name;
            const formValues = form.getValues();
            const validSrlItems = formValues.srlItems?.filter(item => item.month) || [];
            const validSasItems = formValues.sasItems?.filter(item => item.month) || [];

            if (editId) {
                // 🟢 FLUJO DE ACTUALIZACIÓN
                await updateOpportunity(editOppId!, {
                    title: oppTitle,
                    value: Number(oppValue),
                    clientId: finalClientId,
                    clientName: finalClientName
                }, userInfo!.id, userInfo!.name, clientOwnerName);

                await updateConvenioCanje(editId, {
                    clientId: finalClientId,
                    clientName: finalClientName,
                    radioEntrega,
                    clienteEntrega,
                    fechaInicio: new Date(fechaInicio).toISOString(),
                    fechaFin: new Date(fechaFin).toISOString(),
                    observaciones: `Facturación: ${billingType}` 
                }, userInfo!.id, userInfo!.name);

                if (editAdOrderId) {
                    await updateAdvertisingOrder(editAdOrderId, {
                        clientId: finalClientId,
                        clientName: finalClientName,
                        product: oppTitle,
                        opportunityTitle: oppTitle,
                        startDate: new Date(fechaInicio).toISOString(),
                        endDate: new Date(fechaFin).toISOString(),
                        materialUrls: materialUrls.filter(u => u.trim() !== ''),
                        observations: formValues.observations ? `${formValues.observations}\nFacturación: ${billingType}` : `PAUTA POR CANJE.\nFacturación: ${billingType}`,
                        srlItems: validSrlItems,
                        sasItems: validSasItems,
                    }, userInfo!.id, userInfo!.name);
                }

            } else {
                // 🟢 FLUJO DE CREACIÓN NUEVA
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
                    advisorId: userInfo!.id,
                    advisorName: userInfo!.name,
                    opportunityId: oppId,
                    radioEntrega,
                    clienteEntrega,
                    fechaInicio: new Date(fechaInicio).toISOString(),
                    fechaFin: new Date(fechaFin).toISOString(),
                    observaciones: `Facturación: ${billingType}` 
                }, userInfo!.id, userInfo!.name);

                const adOrderPayload = {
                    clientId: finalClientId,
                    clientName: finalClientName,
                    product: oppTitle,
                    accountExecutive: userInfo!.name,
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
                    observations: formValues.observations || `PAUTA POR CANJE.\nFacturación solicitada: ${billingType}`,
                    srlItems: validSrlItems,
                    sasItems: validSasItems,
                    createdBy: userInfo!.id
                };

                await createAdvertisingOrder(JSON.parse(JSON.stringify(adOrderPayload)));
            }

            // 🟢 Generar PDFs y Enviar Email
            const token = await getGoogleAccessToken();
            if (token && convenioPdfRef.current && pautadoPdfRef.current) {
                const convenio64 = await generatePdfBase64(convenioPdfRef.current);
                const pautado64 = await generatePdfBase64(pautadoPdfRef.current);
                
                const attachments = [
                    { filename: `Convenio_${finalClientName.replace(/ /g, "_")}.pdf`, content: convenio64, encoding: 'base64' },
                    { filename: `OP_${finalClientName.replace(/ /g, "_")}.pdf`, content: pautado64, encoding: 'base64' }
                ];

                if (isNewClient && clientPdfRef.current) {
                    const client64 = await generatePdfBase64(clientPdfRef.current);
                    attachments.push({ filename: `Alta_${finalClientName.replace(/ /g, "_")}.pdf`, content: client64, encoding: 'base64' });
                }

                const emailBody = `
                    <div style="font-family: Arial, sans-serif; color: #333;">
                        <h2 style="color: #dc2626;">${editId ? 'Canje Editado' : 'Nuevo Ingreso por Canje'}</h2>
                        <p>El asesor <strong>${userInfo!.name}</strong> ha ${editId ? 'editado' : 'cerrado'} un canje mediante la App Móvil.</p>
                        <div style="background-color: #f5f5f5; padding: 15px; border-left: 4px solid #dc2626; margin: 20px 0;">
                            <p><strong>Cliente:</strong> ${finalClientName} ${isNewClient ? '<span style="color:#2563eb; font-weight:bold;">(CLIENTE NUEVO - Se adjunta Alta)</span>' : ''}</p>
                            <p><strong>Valor Canje:</strong> $${Number(oppValue).toLocaleString('es-AR')}</p>
                            <p><strong>Facturación:</strong> ${billingType}</p>
                            <p><strong>Vigencia:</strong> ${format(new Date(fechaInicio), 'dd/MM/yyyy')} al ${format(new Date(fechaFin), 'dd/MM/yyyy')}</p>
                        </div>
                        <p>Se adjuntan los documentos correspondientes actualizados.</p>
                    </div>
                `;

                await sendEmail({
                    accessToken: token,
                    to: ['lchena@airedesantafe.com.ar', userInfo!.email], 
                    subject: `${editId ? 'Edición de Canje:' : 'Nuevo Canje:'} ${finalClientName} - ${userInfo!.name}`,
                    body: emailBody,
                    attachments
                });
            }

            toast({ title: editId ? '¡Canje actualizado con éxito!' : '¡Canje procesado y enviado con éxito!' });
            loadData(); 
            setView('list'); 
            resetWizard();
            
        } catch (error) {
            console.error(error);
            toast({ title: 'Error al procesar el canje', variant: 'destructive' });
        } finally {
            setIsSubmitting(false);
        }
    };

    if (loading) return <div className="flex h-screen items-center justify-center bg-slate-50"><Spinner size="large" /></div>;

    const isBossOrAdmin = userInfo?.role === 'Jefe' || userInfo?.role === 'Gerencia' || userInfo?.role === 'Administracion' || userInfo?.role === 'Admin';

    // --- VISTA: DETALLE DE UN CANJE ---
    if (view === 'detail' && selectedCanjeDetail) {
        return (
            <div className="min-h-screen bg-slate-50 flex flex-col font-sans">
                <header className="bg-red-600 text-white p-4 shadow-md sticky top-0 z-10 flex items-center">
                    <Button variant="ghost" size="icon" className="text-white hover:bg-red-700 mr-2" onClick={() => setView('list')}>
                        <ArrowLeft className="h-6 w-6"/>
                    </Button>
                    <h1 className="font-bold text-lg">Resumen de Canje</h1>
                </header>
                <main className="flex-1 p-4 pb-20 space-y-4">
                    <Card>
                        <CardHeader>
                            <CardTitle className="text-xl">Canje con {selectedCanjeDetail.clientName}</CardTitle>
                            <CardDescription>
                                Cargado el: {format(parseISO(selectedCanjeDetail.createdAt), 'dd/MM/yyyy')} 
                                <br /> Por: {selectedCanjeDetail.advisorName}
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div>
                                <Label className="text-muted-foreground text-xs uppercase">Vigencia</Label>
                                <div className="font-semibold text-lg text-slate-800">
                                    {selectedCanjeDetail.fechaInicio ? format(parseISO(selectedCanjeDetail.fechaInicio), 'dd/MM/yyyy') : '-'} al {selectedCanjeDetail.fechaFin ? format(parseISO(selectedCanjeDetail.fechaFin), 'dd/MM/yyyy') : '-'}
                                </div>
                            </div>
                            <div>
                                <Label className="text-muted-foreground text-xs uppercase">Aire de Santa Fe entrega</Label>
                                <div className="bg-slate-100 p-3 rounded text-sm mt-1 whitespace-pre-wrap text-slate-700">{selectedCanjeDetail.radioEntrega}</div>
                            </div>
                            <div>
                                <Label className="text-muted-foreground text-xs uppercase">El Cliente entrega</Label>
                                <div className="bg-slate-100 p-3 rounded text-sm mt-1 whitespace-pre-wrap text-slate-700">{selectedCanjeDetail.clienteEntrega}</div>
                            </div>
                            {selectedCanjeDetail.observaciones && (
                                <div>
                                    <Label className="text-muted-foreground text-xs uppercase">Observaciones</Label>
                                    <div className="bg-slate-100 p-3 rounded text-sm mt-1 whitespace-pre-wrap text-slate-700">{selectedCanjeDetail.observaciones}</div>
                                </div>
                            )}
                        </CardContent>
                        
                        <CardFooter className="flex flex-col sm:flex-row gap-3 pt-6 border-t bg-slate-50/50 rounded-b-lg">
                            <Button variant="outline" className="w-full sm:flex-1 border-2" onClick={() => loadForEditOrClone('edit')}>
                                <Edit className="mr-2 h-4 w-4" /> Editar
                            </Button>
                            <Button variant="outline" className="w-full sm:flex-1 border-2" onClick={() => loadForEditOrClone('clone')}>
                                <Copy className="mr-2 h-4 w-4" /> Duplicar
                            </Button>
                            {isBossOrAdmin && (
                                <Button variant="destructive" className="w-full sm:flex-1" onClick={handleDeleteCanje}>
                                    <Trash2 className="mr-2 h-4 w-4" /> Eliminar
                                </Button>
                            )}
                        </CardFooter>
                    </Card>

                    {/* 🟢 ORDEN DE PUBLICIDAD ASOCIADA */}
                    {selectedAdOrder && (
                        <Card className="mt-4 border-blue-200 shadow-sm">
                            <CardHeader className="bg-blue-50/50 border-b border-blue-100 pb-4">
                                <CardTitle className="text-lg text-blue-800">Orden de Publicidad (Pautado)</CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-5 pt-4">
                                {selectedAdOrder.materialUrls && selectedAdOrder.materialUrls.length > 0 && (
                                    <div>
                                        <Label className="text-muted-foreground text-xs uppercase">Materiales</Label>
                                        <div className="flex flex-col gap-2 mt-2">
                                            {selectedAdOrder.materialUrls.map((url, idx) => (
                                                <a key={idx} href={url.startsWith('http') ? url : `https://${url}`} target="_blank" rel="noopener noreferrer" className="flex items-center text-blue-600 text-sm hover:underline bg-blue-50 px-3 py-2 rounded-md border border-blue-100 w-fit">
                                                    <ExternalLink className="h-4 w-4 mr-2" /> Enlace de material {idx + 1}
                                                </a>
                                            ))}
                                        </div>
                                    </div>
                                )}
                                
                                {selectedAdOrder.srlItems && selectedAdOrder.srlItems.length > 0 && (
                                    <div>
                                        <Label className="text-muted-foreground text-xs uppercase mb-1 block">Pautado SRL</Label>
                                        <div className="bg-red-50 p-3 rounded-md text-sm border border-red-100 space-y-2">
                                            {selectedAdOrder.srlItems.map((item, idx) => {
                                                const progName = programs.find(p => p.id === item.programId)?.name || 'Programa';
                                                return (
                                                    <div key={idx} className="border-b border-red-200/60 last:border-0 pb-2 last:pb-0">
                                                        <span className="font-semibold text-red-800 uppercase text-xs tracking-wider mr-2">{item.month}:</span> 
                                                        <span className="font-medium">{progName}</span> - {item.adType === 'Otro' ? item.customType : item.adType} {item.hasTv ? <span className="text-xs bg-red-200 text-red-800 px-1 py-0.5 rounded ml-1">TV</span> : ''}
                                                    </div>
                                                )
                                            })}
                                        </div>
                                    </div>
                                )}
                                
                                {selectedAdOrder.sasItems && selectedAdOrder.sasItems.length > 0 && (
                                    <div>
                                        <Label className="text-muted-foreground text-xs uppercase mb-1 block">Pautado SAS</Label>
                                        <div className="bg-blue-50 p-3 rounded-md text-sm border border-blue-100 space-y-2">
                                            {selectedAdOrder.sasItems.map((item, idx) => (
                                                <div key={idx} className="border-b border-blue-200/60 last:border-0 pb-2 last:pb-0 flex flex-col">
                                                    <div>
                                                        <span className="font-semibold text-blue-800 uppercase text-xs tracking-wider mr-2">{item.month}:</span> 
                                                        <span className="font-medium">{item.format}</span> {item.detail && item.detail !== 'Otro' ? `- ${item.detail}` : ''} {item.customDetail ? `- ${item.customDetail}` : ''}
                                                    </div>
                                                    {item.url && <a href={item.url.startsWith('http') ? item.url : `https://${item.url}`} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 hover:underline mt-1">Ver URL de destino</a>}
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                                
                                {selectedAdOrder.observations && (
                                    <div>
                                        <Label className="text-muted-foreground text-xs uppercase">Observaciones OP</Label>
                                        <div className="bg-slate-100 p-3 rounded-md text-sm mt-1 whitespace-pre-wrap text-slate-700 italic border">{selectedAdOrder.observations}</div>
                                    </div>
                                )}
                            </CardContent>
                        </Card>
                    )}
                </main>
            </div>
        );
    }


    // --- VISTA: LISTA PRINCIPAL (BANDEJA) ---
    if (view === 'list') {
        return (
            <div className="min-h-screen bg-slate-50 flex flex-col font-sans relative pb-20">
                <header className="bg-red-600 text-white p-6 shadow-md sticky top-0 z-10 rounded-b-xl">
                    <div className="flex justify-between items-center mb-2">
                        <h1 className="font-bold text-2xl tracking-tight">Mis Canjes</h1>
                        <Radio className="h-6 w-6 opacity-80" />
                    </div>
                    <p className="text-red-100 text-sm">Gestioná tus intercambios comerciales desde la calle.</p>
                </header>

                <main className="flex-1 p-4">
                    {myCanjes.length === 0 ? (
                        <div className="text-center py-20 text-slate-400 space-y-3">
                            <FileText className="h-16 w-16 mx-auto opacity-50" />
                            <p className="text-lg font-medium">Aún no cargaste canjes.</p>
                            <p className="text-sm">Toca el botón "+" para empezar.</p>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {myCanjes.map(canje => (
                                <Card 
                                    key={canje.id} 
                                    className="cursor-pointer hover:border-red-300 transition-colors shadow-sm" 
                                    onClick={() => { 
                                        setSelectedCanjeDetail(canje); 
                                        setView('detail'); 
                                        setSelectedAdOrder(null);
                                        // 🟢 Buscar OP al abrir el detalle
                                        getAdvertisingOrdersByOpportunity(canje.opportunityId).then(orders => {
                                            if (orders && orders.length > 0) setSelectedAdOrder(orders[0]);
                                        }).catch(console.error);
                                    }}
                                >
                                    <CardContent className="p-4 flex items-center justify-between">
                                        <div className="flex-1 min-w-0 pr-4">
                                            <h3 className="font-bold text-slate-800 truncate text-lg">{canje.clientName}</h3>
                                            <p className="text-sm text-slate-500 truncate mt-1">
                                                Vigencia: {canje.fechaInicio ? format(parseISO(canje.fechaInicio), 'dd/MM/yy') : '-'} al {canje.fechaFin ? format(parseISO(canje.fechaFin), 'dd/MM/yy') : '-'}
                                            </p>
                                            <div className="flex items-center gap-2 mt-2">
                                                <span className="text-xs text-slate-400 font-medium flex items-center gap-1"><Clock className="h-3 w-3"/> Creado: {format(parseISO(canje.createdAt), 'dd/MM/yy')}</span>
                                            </div>
                                        </div>
                                    </CardContent>
                                </Card>
                            ))}
                        </div>
                    )}
                </main>

                <div className="fixed bottom-6 right-6 z-20">
                    <Button size="icon" className="h-16 w-16 rounded-full shadow-xl bg-red-600 hover:bg-red-700" onClick={() => { resetWizard(); setView('form'); }}>
                        <Plus className="h-8 w-8 text-white" />
                    </Button>
                </div>
            </div>
        );
    }


    // --- VISTA: ASISTENTE DE CARGA (FORMULARIO) ---
    return (
        <div className="min-h-screen bg-slate-50 flex flex-col font-sans">
            <header className="bg-red-600 text-white p-4 shadow-md sticky top-0 z-10">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <Button variant="ghost" size="icon" className="text-white hover:bg-red-700 h-8 w-8 -ml-2" onClick={() => { resetWizard(); setView('list'); }}>
                            <ArrowLeft className="h-5 w-5"/>
                        </Button>
                        <h1 className="font-bold text-lg">{editId ? 'Editar Canje' : 'Nuevo Canje'}</h1>
                    </div>
                    <span className="text-xs bg-red-800 px-2 py-1 rounded-full">Paso {step} / 5</span>
                </div>
                <div className="w-full bg-red-800 h-1.5 mt-3 rounded-full overflow-hidden">
                    <div className="bg-white h-full transition-all duration-300" style={{ width: `${(step / 5) * 100}%` }}></div>
                </div>
            </header>

            <main className="flex-1 p-4 pb-24 overflow-y-auto">
                {step === 1 && (
                    <Card className="border-0 shadow-sm animate-in fade-in">
                        <CardHeader><CardTitle className="text-xl text-slate-800">1. Identificar Cliente</CardTitle></CardHeader>
                        <CardContent className="space-y-6">
                            <div className="flex items-center space-x-2 bg-slate-100 p-3 rounded-md">
                                <Checkbox id="newClient" checked={isNewClient} onCheckedChange={(c) => {
                                    setIsNewClient(!!c);
                                    if(!!c) setSelectedClient(null);
                                }} />
                                <Label htmlFor="newClient" className="text-base font-semibold text-primary cursor-pointer">Cargar como cliente nuevo</Label>
                            </div>

                            {!isNewClient ? (
                                <div className="space-y-4 animate-in fade-in">
                                    <div className="relative">
                                        <Search className="absolute left-3 top-3 h-5 w-5 text-gray-400" />
                                        <Input className="pl-10 h-12 text-lg" placeholder="Buscar existente (CUIT o Nombre)..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />
                                    </div>
                                    {searchQuery.length > 0 && searchQuery.length < 3 && <p className="text-sm text-muted-foreground text-center">Escribe 3 caracteres mínimo...</p>}

                                    <div className="space-y-2">
                                        {/* SI ESTAMOS EN EDICIÓN, MOSTRAMOS EL CLIENTE SELECCIONADO ARRIBA */}
                                        {editId && selectedClient && searchQuery === '' && (
                                            <div className="p-4 border border-red-500 bg-red-50 rounded-lg flex flex-col justify-center mb-4">
                                                <div className="flex items-center justify-between">
                                                    <span className="font-medium text-lg">{selectedClient.denominacion} {selectedClient.razonSocial ? `(${selectedClient.razonSocial})` : ''}</span>
                                                    <CheckCircle2 className="text-red-500 h-5 w-5" />
                                                </div>
                                                <span className="text-xs text-red-600 mt-1">Cliente actual del canje</span>
                                            </div>
                                        )}

                                        {searchResults.map(item => {
                                            const isClient = 'denominacion' in item;
                                            const name = isClient ? item.denominacion : item.companyName;
                                            const razonSocial = isClient ? item.razonSocial : '';
                                            const ownerId = item.ownerId;
                                            const ownerName = item.ownerName || 'Sin asignar';
                                            const canSelect = isClient && (ownerId === userInfo?.id || userInfo?.role === 'Admin' || (item as Client).allowCanjes === true || isBossOrAdmin);

                                            if (editId && selectedClient?.id === item.id && searchQuery === '') return null; // Ya se muestra arriba

                                            return (
                                                <div 
                                                    key={item.id} 
                                                    onClick={() => canSelect ? setSelectedClient(item as Client) : undefined}
                                                    className={cn("p-4 border rounded-lg flex flex-col justify-center transition-colors", canSelect ? (selectedClient?.id === item.id ? 'border-red-500 bg-red-50 cursor-pointer' : 'bg-white cursor-pointer hover:bg-gray-50') : 'bg-gray-100 opacity-80 cursor-not-allowed')}
                                                >
                                                    <div className="flex items-center justify-between">
                                                        <span className="font-medium text-lg">{name} {razonSocial ? `(${razonSocial})` : ''}</span>
                                                        {selectedClient?.id === item.id && <CheckCircle2 className="text-red-500 h-5 w-5" />}
                                                    </div>
                                                    {!canSelect && <span className="text-sm text-red-600 font-bold mt-1">{ownerId !== userInfo?.id ? `Asignado a: ${ownerName} (No habilitado para canje)` : `Es un Prospecto. Conviértelo en el CRM.`}</span>}
                                                </div>
                                            );
                                        })}
                                        {searchQuery.length >= 3 && searchResults.length === 0 && <p className="text-sm text-muted-foreground text-center pt-4">No se encontraron resultados.</p>}
                                    </div>
                                </div>
                            ) : (
                                <div className="space-y-4 animate-in slide-in-from-right-4 border-t pt-4">
                                    <div className="space-y-1"><Label>Denominación (Fantasía) *</Label><Input className="h-12 bg-white" value={newClientData.denominacion} onChange={e=>setNewClientData({...newClientData, denominacion: e.target.value})}/></div>
                                    <div className="space-y-1"><Label>Razón Social *</Label><Input className="h-12 bg-white" value={newClientData.razonSocial} onChange={e=>setNewClientData({...newClientData, razonSocial: e.target.value})}/></div>
                                    <div className="space-y-1"><Label>CUIT</Label><Input type="text" className="h-12 bg-white" placeholder="XX-XXXXXXXX-X" value={newClientData.cuit} onChange={e=>setNewClientData({...newClientData, cuit: formatCuit(e.target.value)})}/></div>
                                    
                                    <div className="space-y-1">
                                        <Label>Condición frente al IVA *</Label>
                                        <Select value={newClientData.condicionIVA} onValueChange={(v: CondicionIVA) => setNewClientData({...newClientData, condicionIVA: v})}>
                                            <SelectTrigger className="h-12 bg-white"><SelectValue /></SelectTrigger>
                                            <SelectContent>{condicionIVAOptions.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                                        </Select>
                                    </div>

                                    <div className="grid grid-cols-2 gap-3">
                                        <div className="space-y-1">
                                            <Label>Provincia *</Label>
                                            <Select value={newClientData.provincia} onValueChange={v => setNewClientData({...newClientData, provincia: v})}>
                                                <SelectTrigger className="h-12 bg-white"><SelectValue /></SelectTrigger>
                                                <SelectContent>{provinciasArgentina.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
                                            </Select>
                                        </div>
                                        <div className="space-y-1"><Label>Localidad *</Label><Input className="h-12 bg-white" value={newClientData.localidad} onChange={e=>setNewClientData({...newClientData, localidad: e.target.value})}/></div>
                                    </div>

                                    <div className="grid grid-cols-2 gap-3">
                                        <div className="space-y-1">
                                            <Label>Tipo de Entidad</Label>
                                            <Select value={newClientData.tipoEntidad} onValueChange={(v: TipoEntidad) => setNewClientData({...newClientData, tipoEntidad: v})}>
                                                <SelectTrigger className="h-12 bg-white"><SelectValue /></SelectTrigger>
                                                <SelectContent>{tipoEntidadOptions.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                                            </Select>
                                        </div>
                                        <div className="space-y-1"><Label>Rubro</Label><Input className="h-12 bg-white" value={newClientData.rubro} onChange={e=>setNewClientData({...newClientData, rubro: e.target.value})}/></div>
                                    </div>

                                    <div className="space-y-1"><Label>Teléfono Contacto</Label><Input type="tel" className="h-12 bg-white" value={newClientData.phone} onChange={e=>setNewClientData({...newClientData, phone: e.target.value})}/></div>
                                    <div className="space-y-1"><Label>Email Contacto</Label><Input type="email" className="h-12 bg-white" value={newClientData.email} onChange={e=>setNewClientData({...newClientData, email: e.target.value})}/></div>
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
                                <Label className="text-base font-bold">Nombre del Acuerdo (Oportunidad) *</Label>
                                <Input className="h-12 text-lg bg-white" value={oppTitle} onChange={e=>setOppTitle(e.target.value)} placeholder="Ej: Canje Gastronómico 2026"/>
                            </div>
                            <div className="space-y-2">
                                <Label className="text-base font-bold">Valor monetario del Canje ($) *</Label>
                                <Input type="number" className="h-12 text-2xl font-bold text-green-700 bg-white" value={oppValue} onChange={e=>setOppValue(e.target.value)} placeholder="0.00"/>
                                <p className="text-xs text-muted-foreground">Valor estimado en pesos de lo que entrega el cliente.</p>
                            </div>

                            <div className="space-y-3 pt-4 border-t">
                                <Label className="text-base font-bold">Tipo de Facturación *</Label>
                                <div className="grid grid-cols-3 gap-3">
                                    <div 
                                        className={cn("border-2 rounded-lg p-4 text-center cursor-pointer font-bold transition-all", billingType === 'SRL' ? 'border-red-600 bg-red-50 text-red-700' : 'bg-white text-slate-500 hover:bg-slate-50')}
                                        onClick={() => setBillingType('SRL')}
                                    >SRL</div>
                                    <div 
                                        className={cn("border-2 rounded-lg p-4 text-center cursor-pointer font-bold transition-all", billingType === 'SAS' ? 'border-blue-600 bg-blue-50 text-blue-700' : 'bg-white text-slate-500 hover:bg-slate-50')}
                                        onClick={() => setBillingType('SAS')}
                                    >SAS</div>
                                    <div 
                                        className={cn("border-2 rounded-lg p-4 text-center cursor-pointer font-bold transition-all", billingType === 'AVION' ? 'border-slate-800 bg-slate-100 text-slate-800' : 'bg-white text-slate-500 hover:bg-slate-50')}
                                        onClick={() => setBillingType('AVION')}
                                    >AVIÓN</div>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                )}

                {step === 3 && (
                    <Card className="border-0 shadow-sm animate-in slide-in-from-right-4">
                        <CardHeader><CardTitle className="text-xl text-slate-800">3. Redacción del Convenio</CardTitle></CardHeader>
                        <CardContent className="space-y-6">
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2"><Label className="font-bold">Fecha de Inicio *</Label><Input type="date" className="h-12 bg-white" value={fechaInicio} onChange={e=>setFechaInicio(e.target.value)}/></div>
                                <div className="space-y-2"><Label className="font-bold">Fecha de Fin *</Label><Input type="date" className="h-12 bg-white" value={fechaFin} onChange={e=>setFechaFin(e.target.value)}/></div>
                            </div>
                            <div className="space-y-2">
                                <Label className="text-base text-red-600 font-bold">Aire de Santa Fe entrega: *</Label>
                                <Textarea className="h-32 text-base bg-white" placeholder="Detalla el pautado, menciones, banners..." value={radioEntrega} onChange={e=>setRadioEntrega(e.target.value)}/>
                            </div>
                            <div className="space-y-2">
                                <Label className="text-base text-blue-600 font-bold">El Cliente entrega: *</Label>
                                <Textarea className="h-32 text-base bg-white" placeholder="Detalla los productos, viandas, vouchers..." value={clienteEntrega} onChange={e=>setClienteEntrega(e.target.value)}/>
                            </div>
                        </CardContent>
                    </Card>
                )}

                {step === 4 && (
                    <Card className="border-0 shadow-sm animate-in slide-in-from-right-4">
                        <CardHeader><CardTitle className="text-xl text-slate-800">4. Pautado (Orden de Publicidad)</CardTitle></CardHeader>
                        <CardContent className="space-y-6 p-2 sm:p-6 bg-slate-100/50 rounded-b-lg">
                            <Form {...form}>
                                <div className="space-y-6">
                                    <div className="space-y-2 bg-white p-4 rounded-xl border shadow-sm">
                                        <Label className="text-base font-bold">Links de Materiales</Label>
                                        <div className="space-y-3 mt-2">
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
                                            <Button type="button" size="sm" variant="outline" onClick={handleAddMaterialUrl} className="w-full h-10 border-dashed"> + Agregar otro link</Button>
                                        </div>
                                    </div>

                                    <div className="space-y-2 bg-white p-4 rounded-xl border shadow-sm">
                                        <Label className="text-base font-bold">Observaciones (OP)</Label>
                                        <Textarea {...form.register('observations')} placeholder="Ej: Pauta por canje..." className="h-24 mt-2" />
                                    </div>
                                    
                                    <div className="border border-red-100 rounded-xl p-3 sm:p-4 bg-white shadow-sm relative overflow-hidden">
                                        <div className="absolute top-0 left-0 w-1.5 h-full bg-red-500"></div>
                                        <h3 className="font-bold text-lg mb-4 text-red-800 pl-2">Pautado SRL</h3>
                                        <SrlSection form={form} startDate={new Date(fechaInicio)} endDate={new Date(fechaFin)} programs={programs} />
                                    </div>

                                    <div className="border border-blue-100 rounded-xl p-3 sm:p-4 bg-white shadow-sm relative overflow-hidden">
                                        <div className="absolute top-0 left-0 w-1.5 h-full bg-blue-500"></div>
                                        <h3 className="font-bold text-lg mb-4 text-blue-800 pl-2">Pautado SAS</h3>
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
                            <CardTitle className="text-2xl text-green-800">Todo listo para {editId ? 'actualizar' : 'enviar'}</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4 text-center">
                            <p className="text-slate-600">Al tocar el botón de abajo, se procesará automáticamente:</p>
                            <ul className="text-left text-sm space-y-2 bg-white p-4 rounded-lg border shadow-sm">
                                <li>👤 {isNewClient ? 'Alta de cliente (con PDF de Alta)' : (editId ? 'Actualización de cliente' : 'Asignación a cliente existente')}</li>
                                <li>💼 {editId ? 'Actualización de Oportunidad' : 'Oportunidad ganada'} (${oppValue} / {billingType})</li>
                                <li>📄 PDF "Convenio de Canje" actualizado</li>
                                <li>📢 PDF "Orden de Publicidad" actualizado</li>
                                <li>📧 Email adjunto a Gerencia y a tu correo.</li>
                            </ul>
                        </CardContent>
                    </Card>
                )}
            </main>

            {/* BOTONERA FIJA INFERIOR */}
            <div className="fixed bottom-0 left-0 right-0 p-4 bg-white border-t shadow-[0_-5px_15px_rgba(0,0,0,0.05)] flex gap-3 z-20">
                {step > 1 && (
                    <Button variant="outline" className="h-14 w-14 rounded-full shrink-0 border-2" onClick={() => setStep(s => s - 1)}>
                        <ArrowLeft className="h-6 w-6"/>
                    </Button>
                )}
                {step < 5 ? (
                    <Button className="flex-1 h-14 text-lg rounded-full shadow-md bg-slate-800 hover:bg-slate-900" onClick={handleNextStep}>
                        Siguiente <ArrowRight className="ml-2 h-5 w-5"/>
                    </Button>
                ) : (
                    <Button className="flex-1 h-14 text-lg rounded-full shadow-lg bg-green-600 hover:bg-green-700" onClick={handleFinalSubmit} disabled={isSubmitting}>
                        {isSubmitting ? <Spinner color="white" /> : (editId ? 'Guardar Cambios' : 'Confirmar y Enviar')}
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
                        fechaInicio, fechaFin, radioEntrega, clienteEntrega,
                        observaciones: `Facturación: ${billingType}`,
                        valorMonetario: Number(oppValue)
                    }} 
                />
                <AdvertisingOrderPdf 
                    ref={pautadoPdfRef} 
                    programs={programs}
                    order={{
                        clientName: isNewClient ? newClientData.denominacion : selectedClient?.denominacion,
                        accountExecutive: userInfo?.name,
                        startDate: fechaInicio ? new Date(fechaInicio).toISOString() : new Date().toISOString(),
                        endDate: fechaFin ? new Date(fechaFin).toISOString() : new Date().toISOString(),
                        srlItems: form.getValues('srlItems') || [],
                        sasItems: form.getValues('sasItems') || [],
                        totalOrder: 0,
                        observations: form.getValues('observations') || `PAUTA POR CANJE.\nFacturación: ${billingType}`
                    } as any} 
                />
                {isNewClient && (
                    <ClientPdf 
                        ref={clientPdfRef} 
                        client={{
                            ...newClientData,
                            cuit: cleanCuit(newClientData.cuit),
                            id: 'temp',
                            ownerId: '',
                            ownerName: '',
                            personIds: []
                        }} 
                        contact={null} 
                    />
                )}
            </div>
        </div>
    );
}
