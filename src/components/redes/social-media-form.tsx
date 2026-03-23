'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/hooks/use-toast';
import { getClients, saveSocialMediaRequest, updateSocialMediaRequest, getSocialMediaRequest } from '@/lib/firebase-service'; 
import { Client, SocialMediaRequest } from '@/lib/types';
import { sendEmail } from '@/lib/google-gmail-service';

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
import { Save, ExternalLink, ArrowLeft, Loader2 } from 'lucide-react';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import { SocialMediaPdf } from './social-media-pdf';

export function SocialMediaForm({ editId, cloneId }: { editId?: string, cloneId?: string }) {
    const { userInfo, getGoogleAccessToken } = useAuth();
    const { toast } = useToast();
    const router = useRouter();
    const pdfRef = useRef<HTMLDivElement>(null);
    
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [clients, setClients] = useState<Client[]>([]);
    
    // --- ESTADOS DEL FORMULARIO ---
    const [clientId, setClientId] = useState('');
    const [contactName, setContactName] = useState('');
    const [recordingLocation, setRecordingLocation] = useState('');
    const [recordingDate, setRecordingDate] = useState('');
    const [recordingTime, setRecordingTime] = useState('');
    const [contentType, setContentType] = useState<'Reel' | 'Story'>('Reel');
    const [creator, setCreator] = useState<'Redes' | 'Audiovisual'>('Redes');
    const [publishDate, setPublishDate] = useState('');
    const [clientValidation, setClientValidation] = useState(false);
    const [objective, setObjective] = useState('');
    const [script, setScript] = useState('');
    const [observations, setObservations] = useState('');

    // Específicos Story
    const [isWebReplication, setIsWebReplication] = useState(false);
    const [storyUrl, setStoryUrl] = useState('');
    const [storyCta, setStoryCta] = useState('');
    const [storyTagClient, setStoryTagClient] = useState(false);
    const [storyTagHandle, setStoryTagHandle] = useState('');

    // Específicos Reel
    const [reelCopy, setReelCopy] = useState('');
    const [reelCollaboration, setReelCollaboration] = useState(false);
    const [reelCollabHandle, setReelCollabHandle] = useState('');

    const [notifyOnSave, setNotifyOnSave] = useState(true);

    useEffect(() => {
        const init = async () => {
            try {
                const clientsData = await getClients();
                setClients(userInfo?.role === 'Asesor' ? clientsData.filter(c => c.ownerId === userInfo.id) : clientsData);
                
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

                        setIsWebReplication(req.isWebReplication || false);
                        setStoryUrl(req.storyUrl || '');
                        setStoryCta(req.storyCta || '');
                        setStoryTagClient(req.storyTagClient || false);
                        setStoryTagHandle(req.storyTagHandle || '');

                        setReelCopy(req.reelCopy || '');
                        setReelCollaboration(req.reelCollaboration || false);
                        setReelCollabHandle(req.reelCollabHandle || '');
                    }
                }
            } catch (e) {
                console.error(e);
                toast({ title: 'Error al cargar datos', variant: 'destructive' });
            } finally {
                setLoading(false);
            }
        };
        if (userInfo) init();
    }, [userInfo, editId, cloneId, toast]);

    const getPreviewData = (): Partial<SocialMediaRequest> => ({
        clientId,
        clientName: clients.find(c => c.id === clientId)?.denominacion || 'Cliente Desconocido',
        advisorName: userInfo?.name || '',
        contactName, recordingLocation, recordingDate, recordingTime,
        contentType, creator, publishDate, clientValidation,
        objective, script, observations,
        isWebReplication, storyUrl, storyCta, storyTagClient, storyTagHandle,
        reelCopy, reelCollaboration, reelCollabHandle
    });

    const generatePdfBase64 = async (containerElement: HTMLElement) => {
        const pdf = new jsPDF('p', 'mm', 'a4');
        const canvas = await html2canvas(containerElement, { scale: 1.5, useCORS: true });
        const imgData = canvas.toDataURL('image/jpeg', 0.8);
        
        const pdfWidth = pdf.internal.pageSize.getWidth();
        const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
        
        pdf.addImage(imgData, 'JPEG', 0, 0, pdfWidth, pdfHeight);
        return pdf;
    };

    const handleDownloadPdf = async () => {
        if (!pdfRef.current) return;
        try {
            const pdf = await generatePdfBase64(pdfRef.current);
            pdf.save(`PedidoRedes_${clients.find(c => c.id === clientId)?.denominacion || 'Cliente'}.pdf`);
        } catch (error) {
            toast({ title: 'Error al exportar PDF', variant: 'destructive' });
        }
    };

    const handleSave = async () => {
        if (!clientId || !contactName || !recordingLocation || !objective || !script) {
            toast({ title: 'Datos incompletos', description: 'Por favor complete los campos obligatorios marcados con *', variant: 'destructive' });
            return;
        }

        setSaving(true);
        try {
            const client = clients.find(c => c.id === clientId);
            const dataToSave: Omit<SocialMediaRequest, 'id' | 'createdAt'> = {
                clientId,
                clientName: client?.denominacion || 'Unknown',
                advisorId: userInfo!.id,
                advisorName: userInfo!.name,
                contactName, recordingLocation, recordingDate, recordingTime,
                contentType, creator, publishDate, clientValidation,
                objective, script, observations,
            };

            if (contentType === 'Story') {
                dataToSave.isWebReplication = isWebReplication;
                dataToSave.storyUrl = storyUrl;
                dataToSave.storyCta = storyCta;
                dataToSave.storyTagClient = storyTagClient;
                dataToSave.storyTagHandle = storyTagClient ? storyTagHandle : undefined;
            } else {
                dataToSave.reelCopy = reelCopy;
                dataToSave.reelCollaboration = reelCollaboration;
                dataToSave.reelCollabHandle = reelCollaboration ? reelCollabHandle : undefined;
            }

            let finalId = editId;
            if (editId) {
                await updateSocialMediaRequest(editId, dataToSave, userInfo!.id, userInfo!.name);
            } else {
                finalId = await saveSocialMediaRequest(dataToSave, userInfo!.id, userInfo!.name);
            }

            if (notifyOnSave && pdfRef.current && finalId) {
                const token = await getGoogleAccessToken();
                if (token) {
                    const pdf = await generatePdfBase64(pdfRef.current);
                    const base64 = pdf.output('datauristring').split(',')[1];
                    const link = `${window.location.origin}/redes/${finalId}`;
                    
                    const emailBody = `
                        <h2>Pedido de Material para Redes (${contentType})</h2>
                        <p>Asesor: <strong>${userInfo!.name}</strong></p>
                        <p>Cliente: <strong>${client?.denominacion}</strong></p>
                        <p><a href="${link}">Ver Detalles del Pedido en el CRM</a></p>
                    `;

                    await sendEmail({
                        accessToken: token,
                        to: ['lchena@airedesantafe.com.ar', 'alucca@airedesantafe.com.ar', 'redes@airedesantafe.com.ar'],
                        subject: `Pedido Redes: ${contentType} - ${client?.denominacion}`,
                        body: emailBody,
                        attachments: [{ filename: `Redes_${client?.denominacion}.pdf`, content: base64, encoding: 'base64' }]
                    });
                }
            }

            toast({ title: 'Pedido guardado correctamente' });
            router.push('/redes');
        } catch (error) {
            toast({ title: 'Error al guardar', variant: 'destructive' });
        } finally {
            setSaving(false);
        }
    };

    if (loading) return <div className="flex h-full items-center justify-center"><Spinner size="large" /></div>;

    return (
        <div className="space-y-6 pb-10">
            <div className="flex justify-between items-center bg-white p-4 rounded shadow-sm">
                <Button variant="ghost" onClick={() => router.back()}><ArrowLeft className="mr-2 h-4 w-4"/> Volver</Button>
                <div className="flex gap-4 items-center">
                    <Button variant="outline" onClick={handleDownloadPdf} disabled={!clientId}><ExternalLink className="mr-2 h-4 w-4"/> Exportar PDF</Button>
                    <div className="flex items-center gap-2 border p-2 rounded bg-gray-50"><Switch checked={notifyOnSave} onCheckedChange={setNotifyOnSave} /><Label className="text-sm">Notificar</Label></div>
                    <Button onClick={handleSave} disabled={saving}>{saving ? <Loader2 className="animate-spin" /> : <Save className="mr-2 h-4 w-4"/>} Guardar</Button>
                </div>
            </div>

            <Card>
                <CardHeader><CardTitle>Datos Básicos</CardTitle></CardHeader>
                <CardContent className="grid md:grid-cols-2 gap-4">
                    <div className="space-y-2"><Label>Cliente *</Label>
                        <Select value={clientId} onValueChange={setClientId}>
                            <SelectTrigger><SelectValue placeholder="Seleccione cliente..."/></SelectTrigger>
                            <SelectContent>{clients.map(c => <SelectItem key={c.id} value={c.id}>{c.razonSocial ? `${c.razonSocial} (${c.denominacion})` : c.denominacion}</SelectItem>)}</SelectContent>
                        </Select>
                    </div>
                    <div className="space-y-2"><Label>Contacto Coordinación *</Label><Input value={contactName} onChange={e=>setContactName(e.target.value)} /></div>
                    <div className="space-y-2"><Label>Lugar de Grabación *</Label><Input value={recordingLocation} onChange={e=>setRecordingLocation(e.target.value)} /></div>
                    <div className="flex gap-4">
                        <div className="space-y-2 flex-1"><Label>Fecha Grabación</Label><Input type="date" value={recordingDate} onChange={e=>setRecordingDate(e.target.value)} /></div>
                        <div className="space-y-2 flex-1"><Label>Hora</Label><Input type="time" value={recordingTime} onChange={e=>setRecordingTime(e.target.value)} /></div>
                    </div>
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
                            <div className="flex items-center space-x-2 h-9"><Checkbox id="val" checked={clientValidation} onCheckedChange={(v) => setClientValidation(!!v)} /><Label htmlFor="val">Requiere validación del cliente antes de publicar</Label></div>
                        </div>
                    </div>

                    <div className="space-y-4">
                        <div className="space-y-2">
                            <Label>Objetivo del contenido * <span className="text-xs text-muted-foreground font-normal">(¿Qué quiero comunicar? ¿Beneficio de marca? ¿Vías de contacto?)</span></Label>
                            <Textarea className="h-20" value={objective} onChange={e=>setObjective(e.target.value)} />
                        </div>
                        <div className="space-y-2">
                            <Label>Guion estimativo / Idea * <span className="text-xs text-muted-foreground font-normal">(Qué mostrar y qué NO mostrar)</span></Label>
                            <Textarea className="h-20" value={script} onChange={e=>setScript(e.target.value)} />
                        </div>
                        <div className="space-y-2 flex-1"><Label>Fecha de Publicación Sugerida</Label><Input type="date" className="w-48" value={publishDate} onChange={e=>setPublishDate(e.target.value)} /></div>
                    </div>

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
                            <div className="space-y-2"><Label>Copy estimado (o datos clave a incluir)</Label><Textarea className="h-20" value={reelCopy} onChange={e=>setReelCopy(e.target.value)} /></div>
                            <div className="flex items-center space-x-2"><Checkbox checked={reelCollaboration} onCheckedChange={(v) => setReelCollaboration(!!v)} /><Label>Publicación en Colaboración</Label></div>
                            {reelCollaboration && <div className="space-y-2 w-1/2"><Label>Cuenta a invitar</Label><Input value={reelCollabHandle} onChange={e=>setReelCollabHandle(e.target.value)} placeholder="@usuario" /></div>}
                        </div>
                    )}

                    <div className="space-y-2"><Label>Observaciones adicionales</Label><Textarea value={observations} onChange={e=>setObservations(e.target.value)} /></div>
                </CardContent>
            </Card>
            
            <div style={{ position: 'absolute', top: -9999, left: -9999 }}>
                <SocialMediaPdf ref={pdfRef} request={getPreviewData() as Partial<SocialMediaRequest>} />
            </div>
        </div>
    );
}
