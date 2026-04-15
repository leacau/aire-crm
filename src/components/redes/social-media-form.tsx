'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/hooks/use-toast';
import { getClients, saveSocialMediaRequest, updateSocialMediaRequest, getSocialMediaRequest, getAllUsers } from '@/lib/firebase-service'; 
import { Client, SocialMediaRequest, User, CarouselSlide } from '@/lib/types';
import { sendEmail } from '@/lib/google-gmail-service';
import { hasManagementPrivileges } from '@/lib/role-utils';

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
import { Save, ExternalLink, ArrowLeft, Loader2, Plus, Trash2 } from 'lucide-react';
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

    // Específicos Story
    const [isWebReplication, setIsWebReplication] = useState(false);
    const [storyUrl, setStoryUrl] = useState('');
    const [storyCta, setStoryCta] = useState('');
    const [storyTagClient, setStoryTagClient] = useState(false);
    const [storyTagHandle, setStoryTagHandle] = useState('');

    // Específicos Reel / Carrusel
    const [reelCopy, setReelCopy] = useState('');
    const [reelCollaboration, setReelCollaboration] = useState(false);
    const [reelCollabHandle, setReelCollabHandle] = useState('');

    // 🟢 Específicos Carrusel (Slides)
    const [carouselSlides, setCarouselSlides] = useState<CarouselSlide[]>([{ text: '', link: '' }]);

    const [advisorId, setAdvisorId] = useState('');
    const [advisorName, setAdvisorName] = useState('');

    const [notifyOnSave, setNotifyOnSave] = useState(true);
    
    const canReassign = userInfo && (hasManagementPrivileges(userInfo) || userInfo.role === 'Administracion' || userInfo.role === 'Admin');

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

                        setIsWebReplication(req.isWebReplication || false);
                        setStoryUrl(req.storyUrl || '');
                        setStoryCta(req.storyCta || '');
                        setStoryTagClient(req.storyTagClient || false);
                        setStoryTagHandle(req.storyTagHandle || '');

                        setReelCopy(req.reelCopy || '');
                        setReelCollaboration(req.reelCollaboration || false);
                        setReelCollabHandle(req.reelCollabHandle || '');

                        // 🟢 Cargar slides si es carrusel
                        if (req.carouselSlides && req.carouselSlides.length > 0) {
                            setCarouselSlides(req.carouselSlides);
                        }

                        setAdvisorId(req.advisorId || userInfo?.id || '');
                        setAdvisorName(req.advisorName || userInfo?.name || '');
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
    }, [userInfo, editId, cloneId, toast, canReassign]);

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
        objective, script, observations,
        isWebReplication, storyUrl, storyCta, storyTagClient, storyTagHandle,
        reelCopy, reelCollaboration, reelCollabHandle,
        carouselSlides // 🟢 Al PDF
    });

    const generateMultiPagePdf = async (element: HTMLElement) => {
        const page1 = element.querySelector('#social-pdf-page-1') as HTMLElement;
        const page2 = element.querySelector('#social-pdf-page-2') as HTMLElement;
        if (!page1 || !page2) throw new Error("No se encontraron las páginas del PDF");

        const pdf = new jsPDF('p', 'mm', 'a4');
        const pdfWidth = pdf.internal.pageSize.getWidth();
        const pdfHeight = pdf.internal.pageSize.getHeight();

        const processPage = async (pageElement: HTMLElement, pageNum: number) => {
            const canvas = await html2canvas(pageElement, { scale: 1.5, useCORS: true });
            const imgData = canvas.toDataURL('image/jpeg', 0.8);
            
            if (pageNum > 1) pdf.addPage();
            pdf.addImage(imgData, 'JPEG', 0, 0, pdfWidth, pdfHeight);

            const links = pageElement.querySelectorAll('a');
            const elementRect = pageElement.getBoundingClientRect();

            links.forEach((link) => {
                const linkRect = link.getBoundingClientRect();
                if (linkRect.width === 0 || linkRect.height === 0) return;
                
                const top = ((linkRect.top - elementRect.top) * pdfHeight) / elementRect.height;
                const left = ((linkRect.left - elementRect.left) * pdfWidth) / elementRect.width;
                const width = (linkRect.width * pdfWidth) / elementRect.width;
                const height = (linkRect.height * pdfHeight) / elementRect.height;
                pdf.link(left, top, width, height, { url: link.href });
            });
        };

        await processPage(page1, 1);
        await processPage(page2, 2);

        return pdf;
    };

    const handleDownloadPdf = async () => {
        if (!pdfRef.current) return;
        try {
            const pdf = await generateMultiPagePdf(pdfRef.current);
            pdf.save(`PedidoRedes_${clients.find(c => c.id === clientId)?.denominacion || 'Cliente'}.pdf`);
        } catch (error) {
            console.error(error);
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
                advisorId: advisorId || userInfo!.id,
                advisorName: advisorName || userInfo!.name,
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
            } else if (contentType === 'Reel') {
                dataToSave.reelCopy = reelCopy;
                dataToSave.reelCollaboration = reelCollaboration;
                dataToSave.reelCollabHandle = reelCollaboration ? reelCollabHandle : undefined;
            } else if (contentType === 'Carrusel') {
                dataToSave.reelCollaboration = reelCollaboration;
                dataToSave.reelCollabHandle = reelCollaboration ? reelCollabHandle : undefined;
                // Guardamos solo los slides que tienen algo de info
                dataToSave.carouselSlides = carouselSlides.filter(s => s.text.trim() || s.link.trim());
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
                    const pdf = await generateMultiPagePdf(pdfRef.current);
                    const base64 = pdf.output('datauristring').split(',')[1];
                    const link = `${window.location.origin}/redes/${finalId}`;
                    
                    const emailBody = `
                        <h2>Pedido de Material para Redes (${contentType})</h2>
                        <p>El usuario <strong>${userInfo!.name}</strong> ha cargado o modificado un pedido a nombre de <strong>${advisorName}</strong>.</p>
                        <p>Cliente: <strong>${client?.denominacion}</strong></p>
                        <p><a href="${link}">Ver Detalles del Pedido en el CRM</a></p>
                    `;

                    await sendEmail({
                        accessToken: token,
                        to: ['lchena@airedesantafe.com.ar', 'alucca@airedesantafe.com.ar', 'materiales@airedesantafe.com.ar'],
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
                    <div className="space-y-2">
                        <Label>Ejecutivo / Asesor</Label>
                        {canReassign ? (
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

                    {/* 🟢 Opciones Dinámicas de Carrusel */}
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

                    <div className="space-y-2"><Label>Observaciones adicionales</Label><Textarea value={observations} onChange={e=>setObservations(e.target.value)} /></div>
                </CardContent>
            </Card>
            
            <div style={{ position: 'absolute', top: -9999, left: -9999 }}>
                <SocialMediaPdf ref={pdfRef} request={getPreviewData() as Partial<SocialMediaRequest>} />
            </div>
        </div>
    );
}
