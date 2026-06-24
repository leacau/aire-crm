'use client';

import React, { useState, useEffect, useRef } from 'react';
import { flushSync } from 'react-dom';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/hooks/use-toast';
// 🟢 AGREGAMOS getAdvertisingOrder
import { getClients, saveSocialMediaRequest, updateSocialMediaRequest, getSocialMediaRequest, getAllUsers, getAdvertisingOrder, getAdvertisingOrdersByClientId } from '@/lib/firebase-service'; 
import { AdvertisingOrder, Client, SocialMediaRequest, User, CarouselSlide } from '@/lib/types';
import { sendEmail } from '@/lib/google-gmail-service';
import { hasExecutiveManagementPrivileges, hasManagementPrivileges } from '@/lib/role-utils';
import { advertisingOrderSupportsExecution, getAdvertisingOrderApprovalStatus, getSuggestedSocialMediaType } from '@/lib/advertising-order-utils';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Switch } from '@/components/ui/switch';
import { Spinner } from '@/components/ui/spinner';
import { Save, ExternalLink, ArrowLeft, Loader2, Plus, Trash2, Link as LinkIcon } from 'lucide-react';
import dynamic from 'next/dynamic';
import { ClientCombobox } from '@/components/clients/client-combobox';

const SocialMediaPdf = dynamic(
    () => import('./social-media-pdf').then(mod => mod.SocialMediaPdf),
    { ssr: false }
);

import { arrayUnion } from 'firebase/firestore';
import { format } from 'date-fns';

// 🟢 AGREGAMOS orderId A LAS PROPS
export function SocialMediaForm({ editId, cloneId, orderId }: { editId?: string, cloneId?: string, orderId?: string }) {
    const { userInfo, getGoogleAccessToken } = useAuth();
    const { toast } = useToast();
    const router = useRouter();
    const pdfRef = useRef<HTMLDivElement>(null);
    const [materialUrl, setMaterialUrl] = useState('');
    
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [isPdfMounted, setIsPdfMounted] = useState(false);
    const [clients, setClients] = useState<Client[]>([]);
    const [users, setUsers] = useState<User[]>([]); 
    
    // --- ESTADOS DEL FORMULARIO ---
    const [clientId, setClientId] = useState('');
    const [contactName, setContactName] = useState('');
    const [recordingLocation, setRecordingLocation] = useState('');
    const [recordingDate, setRecordingDate] = useState('');
    const [recordingTime, setRecordingTime] = useState('');
    const [contentType, setContentType] = useState<'Reel' | 'Story' | 'Carrusel'>('Reel');
    const [creator, setCreator] = useState<'Redes' | 'Audiovisual'>('Redes');
    const [publishDate, setPublishDate] = useState('');
    const [clientValidation, setClientValidation] = useState(false);
    const [objective, setObjective] = useState('');
    const [script, setScript] = useState('');
    const [observations, setObservations] = useState('');

    const [isWebReplication, setIsWebReplication] = useState(false);
    const [storyUrl, setStoryUrl] = useState('');
    const [storyCta, setStoryCta] = useState('');
    const [storyTagClient, setStoryTagClient] = useState(false);
    const [storyTagHandle, setStoryTagHandle] = useState('');

    const [reelCopy, setReelCopy] = useState('');
    const [reelCollaboration, setReelCollaboration] = useState(false);
    const [reelCollabHandle, setReelCollabHandle] = useState('');

    const [carouselSlides, setCarouselSlides] = useState<CarouselSlide[]>([{ text: '', link: '' }]);

    const [advisorId, setAdvisorId] = useState('');
    const [advisorName, setAdvisorName] = useState('');
    
    // 🟢 ESTADO PARA GUARDAR EL TÍTULO DE LA ORDEN MADRE
    const [orderTitle, setOrderTitle] = useState('');
    const [selectedOrderId, setSelectedOrderId] = useState('');
    const [clientOrders, setClientOrders] = useState<AdvertisingOrder[]>([]);

    const [notifyOnSave, setNotifyOnSave] = useState(true);
    
    const canReassign = userInfo && (hasManagementPrivileges(userInfo) || userInfo.role === 'Administracion' || userInfo.role === 'Admin');
    const effectiveOrderId = orderId || selectedOrderId;
    const canUseUnapprovedOrder = hasExecutiveManagementPrivileges(userInfo);
    const compatibleOrders = clientOrders.filter(order =>
        advertisingOrderSupportsExecution(order, 'social-media')
        && (getAdvertisingOrderApprovalStatus(order) === 'Aprobado' || canUseUnapprovedOrder));

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            if (e.target instanceof HTMLTextAreaElement) {
                return;
            }
            e.preventDefault();
        }
    };

    useEffect(() => {
        const init = async () => {
            try {
                const clientsData = await getClients();
                
                if (canReassign) {
                    setClients(clientsData);
                    const allUsers = await getAllUsers();
                    setUsers(allUsers);
                } else {
                    setClients(clientsData.filter(c => c.ownerId === userInfo?.id));
                }
                
                const idToFetch = editId || cloneId;
                if (idToFetch) {
                    const req = await getSocialMediaRequest(idToFetch);
                    if (req) {
                        setClientId(req.clientId);
                        setContactName(req.contactName || '');
                        setRecordingLocation(req.recordingLocation || '');
                        setRecordingDate(req.recordingDate || '');
                        setRecordingTime(req.recordingTime || '');
                        setContentType(req.contentType);
                        setCreator(req.creator);
                        setPublishDate(req.publishDate || '');
                        setClientValidation(req.clientValidation);
                        setObjective(req.objective || '');
                        setScript(req.script || '');
                        setObservations(req.observations || '');
                        setMaterialUrl(req.materialUrl || '');

                        setIsWebReplication(req.isWebReplication || false);
                        setStoryUrl(req.storyUrl || '');
                        setStoryCta(req.storyCta || '');
                        setStoryTagClient(req.storyTagClient || false);
                        setStoryTagHandle(req.storyTagHandle || '');

                        setReelCopy(req.reelCopy || '');
                        setReelCollaboration(req.reelCollaboration || false);
                        setReelCollabHandle(req.reelCollabHandle || '');

                        if (req.carouselSlides && req.carouselSlides.length > 0) {
                            setCarouselSlides(req.carouselSlides);
                        }

                        setAdvisorId(req.advisorId || userInfo?.id || '');
                        setAdvisorName(req.advisorName || userInfo?.name || '');
                        
                        if (req.orderId) setOrderTitle(req.orderTitle || 'Orden Vinculada');
                    }
                } else if (orderId) {
                    // 🟢 SI VIENE DE UNA ORDEN MADRE, AUTO-COMPLETAMOS
                    const parentOrder = await getAdvertisingOrder(orderId);
                    if (parentOrder) {
                        if (getAdvertisingOrderApprovalStatus(parentOrder) !== 'Aprobado' && !canUseUnapprovedOrder) {
                            toast({ title: 'Orden pendiente de aprobación', description: 'Solo Jefes o Gerencia pueden cargar ejecuciones antes de la aprobación.', variant: 'destructive' });
                            router.replace(`/publicidad/${orderId}`);
                            return;
                        }
                        setClientId(parentOrder.clientId);
                        setAdvisorId(parentOrder.createdBy || userInfo?.id || '');
                        setAdvisorName(parentOrder.accountExecutive || userInfo?.name || '');
                        setOrderTitle(parentOrder.product || parentOrder.opportunityTitle || 'Orden sin título');
                        const suggestedType = getSuggestedSocialMediaType(parentOrder.sasItems || []);
                        if (suggestedType) setContentType(suggestedType);
                    }
                } else {
                    setAdvisorId(userInfo?.id || '');
                    setAdvisorName(userInfo?.name || '');
                }
            } catch (e) {
                console.error(e);
                toast({ title: 'Error al cargar datos', variant: 'destructive' });
            } finally {
                setLoading(false);
            }
        };
        if (userInfo) init();
    }, [userInfo, editId, cloneId, orderId, toast, canReassign, canUseUnapprovedOrder, router]);

    useEffect(() => {
        const loadClientOrders = async () => {
            if (!clientId || orderId) {
                setClientOrders([]);
                return;
            }
            const orders = await getAdvertisingOrdersByClientId(clientId);
            setClientOrders(orders);
        };
        loadClientOrders();
    }, [clientId, orderId]);

    const handleOrderSelect = (value: string) => {
        setSelectedOrderId(value);
        const selectedOrder = clientOrders.find(order => order.id === value);
        setOrderTitle(selectedOrder?.product || selectedOrder?.opportunityTitle || 'Orden vinculada');
        if (selectedOrder) {
            setAdvisorId(selectedOrder.createdBy || userInfo?.id || '');
            setAdvisorName(selectedOrder.accountExecutive || userInfo?.name || '');
            const suggestedType = getSuggestedSocialMediaType(selectedOrder.sasItems || []);
            if (suggestedType) setContentType(suggestedType);
        }
    };

    const handleAddSlide = () => setCarouselSlides([...carouselSlides, { text: '', link: '' }]);
    const handleRemoveSlide = (idx: number) => {
        const newSlides = carouselSlides.filter((_, i) => i !== idx);
        setCarouselSlides(newSlides.length ? newSlides : [{ text: '', link: '' }]);
    };
    const handleSlideChange = (idx: number, field: 'text'|'link', value: string) => {
        const newSlides = [...carouselSlides];
        newSlides[idx][field] = value;
        setCarouselSlides(newSlides);
    };

    const getPreviewData = (): Partial<SocialMediaRequest> => ({
        clientId,
        clientName: clients.find(c => c.id === clientId)?.denominacion || 'Cliente Desconocido',
        advisorName: advisorName || userInfo?.name || '',
        contactName, recordingLocation, recordingDate, recordingTime,
        contentType, creator, publishDate, clientValidation,
        objective, script, observations, materialUrl,
        isWebReplication, storyUrl, storyCta, storyTagClient, storyTagHandle,
        reelCopy, reelCollaboration, reelCollabHandle,
        carouselSlides, 
    });

    const generateMultiPagePdf = async (element: HTMLElement) => {
        const [{ default: html2canvas }, { default: jsPDF }] = await Promise.all([
            import('html2canvas'),
            import('jspdf'),
        ]);
        const page1 = element.querySelector('#social-pdf-page-1') as HTMLElement;
        const page2 = element.querySelector('#social-pdf-page-2') as HTMLElement;
        if (!page1) throw new Error("No se encontraron las páginas del PDF");
        const pdf = new jsPDF('p', 'mm', 'a4');
        const pdfWidth = pdf.internal.pageSize.getWidth();
        const pdfHeight = pdf.internal.pageSize.getHeight();
        const processPage = async (pageElement: HTMLElement, pageNum: number) => {
            const canvas = await html2canvas(pageElement, { scale: 1.5, useCORS: true });
            const imgData = canvas.toDataURL('image/jpeg', 0.8);
            if (pageNum > 1) pdf.addPage();
            pdf.addImage(imgData, 'JPEG', 0, 0, pdfWidth, pdfHeight);
        };
        await processPage(page1, 1);
        if (page2) await processPage(page2, 2);
        return pdf;
    };

    const handleDownloadPdf = async () => {
        flushSync(() => setIsPdfMounted(true));
        try {
            await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
            if (!pdfRef.current) throw new Error("No se pudo preparar la vista del PDF.");
            const pdf = await generateMultiPagePdf(pdfRef.current);
            pdf.save(`PedidoRedes_${clients.find(c => c.id === clientId)?.denominacion || 'Cliente'}.pdf`);
        } catch (error) {
            console.error(error);
            toast({ title: 'Error al exportar PDF', variant: 'destructive' });
        } finally {
            setIsPdfMounted(false);
        }
    };

    const handleSave = async () => {
        if (!clientId || !contactName || !objective) {
            toast({ title: 'Datos incompletos', description: 'Por favor complete los campos obligatorios marcados con *', variant: 'destructive' });
            return;
        }

        if (contentType === 'Reel' && !recordingLocation.trim()) {
            toast({ title: 'Falta Lugar de Grabación', description: 'Debe especificar dónde se grabará el Reel.', variant: 'destructive' });
            return;
        }

        if ((contentType === 'Reel' || contentType === 'Carrusel') && !reelCopy.trim()) {
            toast({ title: 'Falta el Copy', description: 'El Copy de la publicación es obligatorio para Reel y Carrusel.', variant: 'destructive' });
            return;
        }

        if (cloneId && !effectiveOrderId) {
            toast({ title: 'Seleccione una Orden de Publicidad', description: 'Para duplicar un pedido de redes debe vincularlo a una OP con redes pautadas.', variant: 'destructive' });
            return;
        }

        setSaving(true);
        try {
            const client = clients.find(c => c.id === clientId);
            
            const targetStatus = notifyOnSave ? 'Pendiente' : 'Borrador';
            const historyItem: any = {
                timestamp: format(new Date(), 'dd/MM/yyyy HH:mm'),
                status: targetStatus,
                userId: userInfo!.id,
                userName: userInfo!.name,
                userRole: userInfo!.role,
                comments: editId ? 'Pedido de redes corregido y reenviado para evaluación.' : 'Carga inicial enviada a revisión.'
            };

            const dataToSaveRaw: Partial<SocialMediaRequest> = {
                status: targetStatus,
                clientId,
                clientName: client?.denominacion || 'Unknown',
                advisorId: advisorId || userInfo!.id,
                advisorName: advisorName || userInfo!.name,
                contactName,
                contentType, creator, publishDate, clientValidation,
                objective, script, observations, materialUrl,
            };

            // 🟢 VINCULAMOS AL PADRE
            if (effectiveOrderId) {
                dataToSaveRaw.orderId = effectiveOrderId;
                dataToSaveRaw.orderTitle = orderTitle;
            }

            if (contentType === 'Story') {
                dataToSaveRaw.isWebReplication = isWebReplication;
                dataToSaveRaw.storyUrl = storyUrl;
                dataToSaveRaw.storyCta = storyCta;
                dataToSaveRaw.storyTagClient = storyTagClient;
                if (storyTagClient) dataToSaveRaw.storyTagHandle = storyTagHandle;
            } else if (contentType === 'Reel') {
                dataToSaveRaw.recordingLocation = recordingLocation;
                dataToSaveRaw.recordingDate = recordingDate;
                dataToSaveRaw.recordingTime = recordingTime;
                dataToSaveRaw.reelCopy = reelCopy;
                dataToSaveRaw.reelCollaboration = reelCollaboration;
                if (reelCollaboration) dataToSaveRaw.reelCollabHandle = reelCollabHandle;
            } else if (contentType === 'Carrusel') {
                dataToSaveRaw.reelCopy = reelCopy;
                dataToSaveRaw.reelCollaboration = reelCollaboration;
                if (reelCollaboration) dataToSaveRaw.reelCollabHandle = reelCollabHandle;
                dataToSaveRaw.carouselSlides = carouselSlides.filter(s => s.text.trim() || s.link.trim());
            }

            if (editId) {
                dataToSaveRaw.approvalHistory = arrayUnion(historyItem) as any;
            } else {
                dataToSaveRaw.approvalHistory = [historyItem];
            }

            const dataToSave = Object.keys(dataToSaveRaw).reduce((acc, key) => {
                const val = (dataToSaveRaw as any)[key];
                if (val !== undefined) {
                    acc[key] = val;
                }
                return acc;
            }, {} as Record<string, any>) as Omit<SocialMediaRequest, 'id' | 'createdAt'>;

            if (editId) {
                await updateSocialMediaRequest(editId, dataToSave, userInfo!.id, userInfo!.name);
            } else {
                await saveSocialMediaRequest(dataToSave, userInfo!.id, userInfo!.name);
            }        

            if (notifyOnSave) {
                const token = await getGoogleAccessToken();
                if (token) {
                    try {
                        const clientDisplayName = client?.denominacion || 'Desconocido';
                        const baseUrl = window.location.origin;
                        const emailBody = `
                            <div style="font-family: Arial, sans-serif; color: #333; max-w: 600px; border: 1px solid #e2e8f0; padding: 20px; border-radius: 8px;">
                                <p>Se ha cargado un pedido de revisión de un <strong>Pedido de Redes</strong> para el cliente <strong>${clientDisplayName}</strong>.</p>
                                <p>Para evaluar el formato, objetivo y copy, ingresa desde el siguiente enlace directo:</p>
                                <p style="margin-top: 15px;"><a href="${baseUrl}/approvals?tab=pending" style="display: inline-block; padding: 10px 20px; background-color: #1d4ed8; color: white; text-decoration: none; border-radius: 4px; font-weight: bold; font-size: 14px;">EVALUAR PEDIDO DE REDES</a></p>
                            </div>
                        `;
                        await sendEmail({
                            accessToken: token,
                            to: ['materiales@airedesantafe.com.ar', 'alucca@airedesantafe.com.ar', 'lchena@airedesantafe.com.ar'],
                            subject: `Pedido de Revisión de Pedido de Redes - ${clientDisplayName}`,
                            body: emailBody
                        });
                    } catch (emailErr) {
                        console.error("Error al enviar notificación simple de redes:", emailErr);
                    }
                }
            }

            toast({ 
              title: notifyOnSave ? 'Enviado a Revisión' : 'Guardado Provisorio', 
              description: notifyOnSave ? 'Pedido enviado a revisión exitosamente.' : 'Guardado en modo Borrador (No enviado).' 
            });
            // 🟢 REDIRECCIÓN INTELIGENTE AL PADRE
            if (effectiveOrderId) {
                router.push(`/publicidad/${effectiveOrderId}`);
            } else {
                router.push('/redes');
            }
        } catch (error) {
            console.error("Error crítico al guardar el pedido:", error);
            toast({ title: 'Error al guardar', variant: 'destructive' });
        } finally {
            setSaving(false);
        }
    };

    if (loading) return <div className="flex h-full items-center justify-center"><Spinner size="large" /></div>;

    return (
        <div className="space-y-6 pb-10" onKeyDown={handleKeyDown}>
            <div className="flex justify-between items-center bg-white p-4 rounded shadow-sm">
                <Button variant="ghost" onClick={() => router.back()}><ArrowLeft className="mr-2 h-4 w-4"/> Volver</Button>
                <div className="flex gap-4 items-center">
                    <Button variant="outline" onClick={handleDownloadPdf} disabled={!clientId}><ExternalLink className="mr-2 h-4 w-4"/> Exportar PDF</Button>
                    <div className="flex items-center gap-2 border p-2 rounded bg-gray-50">
                        <Switch checked={notifyOnSave} onCheckedChange={setNotifyOnSave} />
                        <Label className="text-sm font-semibold">Pasar a aprobación</Label>
                    </div>
                    <Button onClick={handleSave} disabled={saving}>{saving ? <Loader2 className="animate-spin" /> : <Save className="mr-2 h-4 w-4"/>} Guardar</Button>
                </div>
            </div>

            {/* 🟢 BANNER INFORMATIVO SI ESTÁ VINCULADO */}
            {(effectiveOrderId || editId && orderTitle) && (
                <div className="bg-blue-50 border border-blue-200 p-3 rounded-md flex items-center gap-2 text-blue-800 text-sm font-medium">
                    <LinkIcon className="w-4 h-4" />
                    Ejecución vinculada a la Orden de Publicidad Madre: <strong>{orderTitle}</strong>
                </div>
            )}

            <Card>
                <CardHeader><CardTitle>Datos Básicos</CardTitle></CardHeader>
                <CardContent className="grid md:grid-cols-2 gap-4">
                    {cloneId && !orderId && (
                        <div className="space-y-2 md:col-span-2">
                            <Label>Orden con Pedido de Redes pautado <span className="text-red-500">*</span></Label>
                            <Select value={selectedOrderId} onValueChange={handleOrderSelect} disabled={!clientId}>
                                <SelectTrigger>
                                    <SelectValue placeholder={clientId ? 'Seleccionar orden compatible...' : 'Seleccione primero un cliente'} />
                                </SelectTrigger>
                                <SelectContent>
                                    {compatibleOrders.map(order => (
                                        <SelectItem key={order.id} value={order.id || ''}>
                                            {(order.product || order.opportunityTitle || 'Orden sin tÃ­tulo')} - {order.startDate?.slice(0, 10)} al {order.endDate?.slice(0, 10)}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            {clientId && compatibleOrders.length === 0 && (
                                <p className="text-sm text-destructive">Este cliente no tiene Ã³rdenes con redes pautadas.</p>
                            )}
                        </div>
                    )}
                    <div className="space-y-2"><Label>Cliente *</Label>
                        <ClientCombobox
                            clients={clients}
                            value={clientId}
                            onChange={setClientId}
                            disabled={!!orderId}
                            placeholder="Buscar cliente..."
                        />
                    </div>
                    <div className="space-y-2">
                        <Label>Ejecutivo / Asesor</Label>
                        {canReassign && !orderId ? (
                            <Select value={advisorId} onValueChange={(val) => {
                                setAdvisorId(val);
                                const u = users.find(x => x.id === val);
                                if (u) setAdvisorName(u.name);
                            }}>
                                <SelectTrigger><SelectValue placeholder="Seleccionar..." /></SelectTrigger>
                                <SelectContent>
                                    {users.map(u => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}
                                </SelectContent>
                            </Select>
                        ) : (
                            <Input value={advisorName} readOnly className="bg-slate-50" />
                        )}
                    </div>
                    <div className="space-y-2 md:col-span-2"><Label>Contacto Coordinación *</Label><Input value={contactName} onChange={e=>setContactName(e.target.value)} /></div>
                </CardContent>
            </Card>

            <Card>
                <CardHeader><CardTitle>Especificaciones del Contenido</CardTitle></CardHeader>
                <CardContent className="space-y-6">
                    <div className="grid md:grid-cols-3 gap-6 border-b pb-6">
                        <div className="space-y-3">
                            <Label className="font-bold">Formato</Label>
                            <RadioGroup value={contentType} onValueChange={(v: any) => setContentType(v)} className="flex gap-4">
                                <div className="flex items-center space-x-2"><RadioGroupItem value="Reel" id="t-r" /><Label htmlFor="t-r">Reel</Label></div>
                                <div className="flex items-center space-x-2"><RadioGroupItem value="Story" id="t-s" /><Label htmlFor="t-s">Story</Label></div>
                                <div className="flex items-center space-x-2"><RadioGroupItem value="Carrusel" id="t-c" /><Label htmlFor="t-c">Carrusel</Label></div>
                            </RadioGroup>
                        </div>
                        <div className="space-y-3">
                            <Label className="font-bold">Creador</Label>
                            <RadioGroup value={creator} onValueChange={(v: any) => setCreator(v)} className="flex gap-4">
                                <div className="flex items-center space-x-2"><RadioGroupItem value="Redes" id="c-r" /><Label htmlFor="c-r">Redes</Label></div>
                                <div className="flex items-center space-x-2"><RadioGroupItem value="Audiovisual" id="c-a" /><Label htmlFor="c-a">Audiovisual</Label></div>
                            </RadioGroup>
                        </div>
                        <div className="space-y-3">
                            <Label className="font-bold">Validación</Label>
                            <div className="flex items-center space-x-2 h-9"><Checkbox id="val" checked={clientValidation} onCheckedChange={(v) => setClientValidation(!!v)} /><Label htmlFor="val">Requiere validación del cliente</Label></div>
                        </div>
                    </div>

                    {contentType === 'Reel' && (
                        <div className="grid md:grid-cols-3 gap-4 border-b border-dashed pb-6 bg-slate-50 p-4 rounded-md">
                            <div className="space-y-2"><Label>Lugar de Grabación *</Label><Input value={recordingLocation} onChange={e=>setRecordingLocation(e.target.value)} placeholder="Ej: Estudio / Local del cliente" /></div>
                            <div className="space-y-2"><Label>Fecha Grabación</Label><Input type="date" value={recordingDate} onChange={e=>setRecordingDate(e.target.value)} /></div>
                            <div className="space-y-2"><Label>Hora</Label><Input type="time" value={recordingTime} onChange={e=>setRecordingTime(e.target.value)} /></div>
                        </div>
                    )}

                    <div className="space-y-4">
                        <div className="space-y-2 flex-1"><Label>Fecha de Publicación Sugerida</Label><Input type="date" className="w-48" value={publishDate} onChange={e=>setPublishDate(e.target.value)} /></div>
                        <div className="space-y-2">
                            <Label>Objetivo del contenido * <span className="text-xs text-muted-foreground font-normal">(¿Qué quiero comunicar? ¿Beneficio de marca? ¿Vías de contacto?)</span></Label>
                            <Textarea className="h-20" value={objective} onChange={e=>setObjective(e.target.value)} />
                        </div>
                        <div className="space-y-2">
                            <Label>Guion estimativo / Idea <span className="text-xs text-muted-foreground font-normal">(Qué mostrar y qué NO mostrar)</span></Label>
                            <Textarea className="h-20" value={script} onChange={e=>setScript(e.target.value)} />
                        </div>
                    </div>

                    {(contentType === 'Reel' || contentType === 'Carrusel') && (
                        <div className="space-y-2 bg-blue-50/50 p-4 rounded-md border border-blue-100">
                            <Label>Copy de la publicación * <span className="text-xs text-muted-foreground font-normal">(Texto que acompaña al posteo en el feed)</span></Label>
                            <Textarea className="h-20 bg-white" value={reelCopy} onChange={e=>setReelCopy(e.target.value)} />
                        </div>
                    )}

                    {contentType === 'Story' && (
                        <div className="bg-orange-50 p-4 rounded-md border border-orange-100 space-y-4">
                            <h3 className="font-bold text-orange-800 border-b border-orange-200 pb-2">Opciones de Story</h3>
                            <div className="flex items-center space-x-2"><Checkbox checked={isWebReplication} onCheckedChange={(v) => setIsWebReplication(!!v)} /><Label>Es replicar una nota web / contenido externo</Label></div>
                            <div className="grid md:grid-cols-2 gap-4">
                                <div className="space-y-2"><Label>URL a enlazar</Label><Input value={storyUrl} onChange={e=>setStoryUrl(e.target.value)} placeholder="https://..." /></div>
                                <div className="space-y-2"><Label>Texto CTA (Call To Action)</Label><Input value={storyCta} onChange={e=>setStoryCta(e.target.value)} placeholder="Ej: Mirá más acá" /></div>
                            </div>
                            <div className="flex items-center space-x-2"><Checkbox checked={storyTagClient} onCheckedChange={(v) => setStoryTagClient(!!v)} /><Label>Etiqueta visible al cliente</Label></div>
                            {storyTagClient && <div className="space-y-2 w-1/2"><Label>Cuenta a arrobar</Label><Input value={storyTagHandle} onChange={e=>setStoryTagHandle(e.target.value)} placeholder="@usuario" /></div>}
                        </div>
                    )}

                    {contentType === 'Reel' && (
                        <div className="bg-blue-50 p-4 rounded-md border border-blue-100 space-y-4">
                            <h3 className="font-bold text-blue-800 border-b border-blue-200 pb-2">Opciones de Reel</h3>
                            <div className="flex items-center space-x-2"><Checkbox checked={reelCollaboration} onCheckedChange={(v) => setReelCollaboration(!!v)} /><Label>Publicación en Colaboración</Label></div>
                            {reelCollaboration && <div className="space-y-2 w-1/2"><Label>Cuenta a invitar</Label><Input value={reelCollabHandle} onChange={e=>setReelCollabHandle(e.target.value)} placeholder="@usuario" /></div>}
                        </div>
                    )}

                    {contentType === 'Carrusel' && (
                        <div className="bg-purple-50 p-4 rounded-md border border-purple-100 space-y-4">
                            <div className="flex justify-between items-center border-b border-purple-200 pb-2">
                                <h3 className="font-bold text-purple-800">Slides del Carrusel (Total: {carouselSlides.length})</h3>
                                <Button type="button" size="sm" variant="outline" onClick={handleAddSlide}><Plus className="mr-1 h-4 w-4"/> Agregar Slide</Button>
                            </div>
                            
                            <div className="space-y-4">
                                {carouselSlides.map((slide, idx) => (
                                    <div key={idx} className="p-3 bg-white border rounded shadow-sm relative">
                                        <div className="absolute top-3 right-3 text-xs font-bold text-purple-300">#{idx + 1}</div>
                                        <div className="space-y-3">
                                            <div>
                                                <Label className="text-xs">Texto / Copy del Slide</Label>
                                                <Textarea className="h-16 mt-1" value={slide.text} onChange={e=>handleSlideChange(idx, 'text', e.target.value)} placeholder="Ej: 3 beneficios de nuestro producto..." />
                                            </div>
                                            <div className="flex gap-2 items-end">
                                                <div className="flex-1">
                                                    <Label className="text-xs">Enlace del material (opcional)</Label>
                                                    <Input className="mt-1" value={slide.link} onChange={e=>handleSlideChange(idx, 'link', e.target.value)} placeholder="https://drive.google.com/..." />
                                                </div>
                                                {carouselSlides.length > 1 && (
                                                    <Button type="button" variant="ghost" className="text-red-500 hover:bg-red-50" onClick={() => handleRemoveSlide(idx)}><Trash2 className="h-4 w-4"/></Button>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>

                            <div className="flex items-center space-x-2 pt-4 border-t border-purple-200 mt-4"><Checkbox checked={reelCollaboration} onCheckedChange={(v) => setReelCollaboration(!!v)} /><Label>Publicación en Colaboración</Label></div>
                            {reelCollaboration && <div className="space-y-2 w-1/2"><Label>Cuenta a invitar</Label><Input value={reelCollabHandle} onChange={e=>setReelCollabHandle(e.target.value)} placeholder="@usuario" /></div>}
                        </div>
                    )}
                    <div className="space-y-2">
                        <Label className="flex items-center gap-2">
                            Link a Materiales de Apoyo 
                            <span className="text-xs text-muted-foreground font-normal">(Drive, Dropbox, WeTransfer, etc.)</span>
                        </Label>
                        <Input 
                            value={materialUrl} 
                            onChange={e => setMaterialUrl(e.target.value)} 
                            placeholder="https://drive.google.com/..." 
                            className="bg-white"
                        />
                    </div>
                    <div className="space-y-2"><Label>Observaciones adicionales</Label><Textarea value={observations} onChange={e=>setObservations(e.target.value)} /></div>
                </CardContent>
            </Card>
            
            {isPdfMounted && (
                <div style={{ position: 'absolute', top: -9999, left: -9999 }}>
                    <SocialMediaPdf ref={pdfRef} request={getPreviewData() as Partial<SocialMediaRequest>} />
                </div>
            )}
        </div>
    );
}
