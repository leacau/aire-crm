'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/hooks/use-toast';
import { getClients, saveWebNote, updateWebNote, getWebNote, getAllUsers, getAdvertisingOrder } from '@/lib/firebase-service'; 
import { Client, WebNote, User, WebNoteFormat, WebNoteImageSupport } from '@/lib/types';
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
import { Save, ExternalLink, ArrowLeft, Loader2, Link as LinkIcon } from 'lucide-react';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import { WebNotePdf } from './web-note-pdf';

import { arrayUnion } from 'firebase/firestore';
import { format as formatDate } from 'date-fns';

export function WebNoteForm({ editId, cloneId, orderId }: { editId?: string, cloneId?: string, orderId?: string }) {
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
    const [advisorId, setAdvisorId] = useState('');
    const [advisorName, setAdvisorName] = useState('');
    const [orderTitle, setOrderTitle] = useState('');
    
    const [contactName, setContactName] = useState('');
    const [contactPhone, setContactPhone] = useState('');
    const [clientWebOrSocial, setClientWebOrSocial] = useState('');
    
    const [objective, setObjective] = useState('');
    const [formatOption, setFormatOption] = useState<WebNoteFormat>('Gacetilla de prensa enviada por la empresa');
    const [imageSupport, setImageSupport] = useState<WebNoteImageSupport>('Fotografías y/o videos enviados por el cliente');
    const [inserts, setInserts] = useState('');

    const [repIgStory, setRepIgStory] = useState(false);
    const [repIgStoryProducer, setRepIgStoryProducer] = useState<'Produce Aire' | 'Envía Cte'>('Envía Cte');
    const [repIgReel, setRepIgReel] = useState(false);
    const [repIgReelProducer, setRepIgReelProducer] = useState<'Produce Aire' | 'Envía Cte'>('Envía Cte');
    const [repFacebook, setRepFacebook] = useState(false);
    const [repTwitter, setRepTwitter] = useState(false);
    const [clientIgHandle, setClientIgHandle] = useState('');
    const [collaborateReel, setCollaborateReel] = useState(false);

    const [materialUrl, setMaterialUrl] = useState('');
    const [observations, setObservations] = useState('');

    const [notifyOnSave, setNotifyOnSave] = useState(true);
    
    const canReassign = userInfo && (hasManagementPrivileges(userInfo) || userInfo.role === 'Administracion' || userInfo.role === 'Admin');

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !(e.target instanceof HTMLTextAreaElement)) {
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
                    const req = await getWebNote(idToFetch);
                    if (req) {
                        setClientId(req.clientId);
                        setAdvisorId(req.advisorId || userInfo?.id || '');
                        setAdvisorName(req.advisorName || userInfo?.name || '');
                        if (req.orderId) setOrderTitle(req.orderTitle || 'Orden Vinculada');
                        
                        setContactName(req.contactName || '');
                        setContactPhone(req.contactPhone || '');
                        setClientWebOrSocial(req.clientWebOrSocial || '');
                        setObjective(req.objective || '');
                        setFormatOption(req.format);
                        setImageSupport(req.imageSupport);
                        setInserts(req.inserts || '');
                        setRepIgStory(req.repIgStory || false);
                        setRepIgStoryProducer(req.repIgStoryProducer || 'Envía Cte');
                        setRepIgReel(req.repIgReel || false);
                        setRepIgReelProducer(req.repIgReelProducer || 'Envía Cte');
                        setRepFacebook(req.repFacebook || false);
                        setRepTwitter(req.repTwitter || false);
                        setClientIgHandle(req.clientIgHandle || '');
                        setCollaborateReel(req.collaborateReel || false);
                        setMaterialUrl(req.materialUrl || '');
                        setObservations(req.observations || '');
                    }
                } else if (orderId) {
                    const parentOrder = await getAdvertisingOrder(orderId);
                    if (parentOrder) {
                        setClientId(parentOrder.clientId);
                        setAdvisorId(parentOrder.createdBy || userInfo?.id || '');
                        setAdvisorName(parentOrder.accountExecutive || userInfo?.name || '');
                        setOrderTitle(parentOrder.product || parentOrder.opportunityTitle || 'Orden sin título');
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
    }, [userInfo, editId, cloneId, orderId, toast, canReassign]);

    const getPreviewData = (): Partial<WebNote> => ({
        clientId,
        clientName: clients.find(c => c.id === clientId)?.denominacion || 'Cliente Desconocido',
        advisorName: advisorName || userInfo?.name || '',
        orderTitle,
        contactName, contactPhone, clientWebOrSocial,
        objective, format: formatOption, imageSupport, inserts,
        repIgStory, repIgStoryProducer, repIgReel, repIgReelProducer,
        repFacebook, repTwitter, clientIgHandle, collaborateReel,
        materialUrl, observations,
        createdAt: new Date().toISOString()
    });

    const generatePdf = async (containerElement: HTMLElement) => {
        const pdf = new jsPDF('p', 'mm', 'a4');
        const canvas = await html2canvas(containerElement, { scale: 1.5, useCORS: true });
        const imgData = canvas.toDataURL('image/jpeg', 0.8);
        const pdfWidth = 210;
        const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
        pdf.addImage(imgData, 'JPEG', 0, 0, pdfWidth, pdfHeight);
        return pdf;
    };

    const handleDownloadPdf = async () => {
        if (!pdfRef.current) return;
        try {
            const pdf = await generatePdf(pdfRef.current);
            pdf.save(`NotaWeb_${clients.find(c => c.id === clientId)?.denominacion || 'Cliente'}.pdf`);
        } catch (error) {
            console.error(error);
            toast({ title: 'Error al exportar PDF', variant: 'destructive' });
        }
    };

    const handleSave = async () => {
        if (!clientId || !contactName || !objective) {
            toast({ title: 'Datos incompletos', description: 'Por favor complete los campos obligatorios (*)', variant: 'destructive' });
            return;
        }

        setSaving(true);
        try {
            const client = clients.find(c => c.id === clientId);
            const targetStatus = notifyOnSave ? 'Pendiente' : 'Borrador';
            const historyItem: any = {
                timestamp: formatDate(new Date(), 'dd/MM/yyyy HH:mm'),
                status: targetStatus,
                userId: userInfo!.id,
                userName: userInfo!.name,
                userRole: userInfo!.role,
                comments: editId ? 'Nota Web corregida y reenviada.' : 'Carga inicial enviada a revisión.'
            };

            const dataToSaveRaw: Partial<WebNote> = {
                status: targetStatus,
                clientId,
                clientName: client?.denominacion || 'Unknown',
                advisorId: advisorId || userInfo!.id,
                advisorName: advisorName || userInfo!.name,
                contactName, contactPhone, clientWebOrSocial,
                objective, format: formatOption, imageSupport, inserts,
                repIgStory, repIgStoryProducer, repIgReel, repIgReelProducer,
                repFacebook, repTwitter, clientIgHandle, collaborateReel,
                materialUrl, observations,
            };

            if (orderId) {
                dataToSaveRaw.orderId = orderId;
                dataToSaveRaw.orderTitle = orderTitle;
            }

            if (editId) {
                dataToSaveRaw.approvalHistory = arrayUnion(historyItem) as any;
            } else {
                dataToSaveRaw.approvalHistory = [historyItem];
            }

            const dataToSave = Object.keys(dataToSaveRaw).reduce((acc, key) => {
                const val = (dataToSaveRaw as any)[key];
                if (val !== undefined) acc[key] = val;
                return acc;
            }, {} as Record<string, any>) as Omit<WebNote, 'id' | 'createdAt'>;

            if (editId) {
                await updateWebNote(editId, dataToSave, userInfo!.id, userInfo!.name);
            } else {
                await saveWebNote(dataToSave, userInfo!.id, userInfo!.name);
            }        

            if (notifyOnSave) {
                const token = await getGoogleAccessToken();
                if (token) {
                    try {
                        const clientDisplayName = client?.denominacion || 'Desconocido';
                        const baseUrl = window.location.origin;
                        const emailBody = `
                            <div style="font-family: Arial, sans-serif; color: #333; max-w: 600px; border: 1px solid #e2e8f0; padding: 20px; border-radius: 8px;">
                                <p>Se ha cargado un pedido de revisión de <strong>Nota Web / Gacetilla</strong> para <strong>${clientDisplayName}</strong>.</p>
                                <p><a href="${baseUrl}/approvals?tab=pending" style="display: inline-block; padding: 10px 20px; background-color: #f97316; color: white; text-decoration: none; border-radius: 4px; font-weight: bold;">EVALUAR NOTA WEB</a></p>
                            </div>
                        `;
                        await sendEmail({
                            accessToken: token,
                            to: ['materiales@airedesantafe.com.ar', 'alucca@airedesantafe.com.ar', 'lchena@airedesantafe.com.ar'],
                            subject: `Pedido de Revisión Web - ${clientDisplayName}`,
                            body: emailBody
                        });
                    } catch (e) {}
                }
            }

            toast({ title: notifyOnSave ? 'Enviado a Revisión' : 'Guardado Provisorio' });
            if (orderId) router.push(`/publicidad/${orderId}`);
            else router.back();

        } catch (error) {
            console.error(error);
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
                    <Button onClick={handleSave} disabled={saving} className="bg-orange-600 hover:bg-orange-700">{saving ? <Loader2 className="animate-spin" /> : <Save className="mr-2 h-4 w-4"/>} Guardar</Button>
                </div>
            </div>

            {(orderId || (editId && orderTitle)) && (
                <div className="bg-orange-50 border border-orange-200 p-3 rounded-md flex items-center gap-2 text-orange-800 text-sm font-medium">
                    <LinkIcon className="w-4 h-4" />
                    Ejecución vinculada a la Orden de Publicidad Madre: <strong>{orderTitle}</strong>
                </div>
            )}

            <Card>
                <CardHeader><CardTitle>Datos Básicos y Contacto</CardTitle></CardHeader>
                <CardContent className="grid md:grid-cols-2 gap-4">
                    <div className="space-y-2"><Label>Cliente *</Label>
                        <Select value={clientId} onValueChange={setClientId} disabled={!!orderId}>
                            <SelectTrigger className={orderId ? "bg-slate-50 opacity-100" : ""}><SelectValue placeholder="Seleccione cliente..."/></SelectTrigger>
                            <SelectContent>{clients.map(c => <SelectItem key={c.id} value={c.id}>{c.razonSocial ? `${c.razonSocial} (${c.denominacion})` : c.denominacion}</SelectItem>)}</SelectContent>
                        </Select>
                    </div>
                    <div className="space-y-2">
                        <Label>Ejecutivo / Asesor</Label>
                        <Input value={advisorName} readOnly className="bg-slate-50" />
                    </div>
                    <div className="space-y-2"><Label>Contacto de Coordinación *</Label><Input value={contactName} onChange={e=>setContactName(e.target.value)} /></div>
                    <div className="space-y-2"><Label>Teléfono del Contacto</Label><Input value={contactPhone} onChange={e=>setContactPhone(e.target.value)} /></div>
                    <div className="space-y-2 md:col-span-2"><Label>Web o Red Social del Cliente (para linkear)</Label><Input value={clientWebOrSocial} onChange={e=>setClientWebOrSocial(e.target.value)} placeholder="Ej: https://..." /></div>
                </CardContent>
            </Card>

            <Card>
                <CardHeader><CardTitle>Especificaciones Web</CardTitle></CardHeader>
                <CardContent className="space-y-6">
                    <div className="space-y-2">
                        <Label>Objetivo de la Nota * <span className="text-xs text-muted-foreground font-normal">(¿Qué queremos comunicar al público?)</span></Label>
                        <Textarea className="h-20" value={objective} onChange={e=>setObjective(e.target.value)} />
                    </div>
                    
                    <div className="grid md:grid-cols-2 gap-6 border-t pt-6">
                        <div className="space-y-3">
                            <Label className="font-bold text-orange-700">Producto / Tipo de Contenido</Label>
                            <RadioGroup value={formatOption} onValueChange={(v: any) => setFormatOption(v)} className="flex flex-col gap-2">
                                <div className="flex items-center space-x-2"><RadioGroupItem value="Gacetilla de prensa enviada por la empresa" id="f1" /><Label htmlFor="f1">Gacetilla enviada por empresa</Label></div>
                                <div className="flex items-center space-x-2"><RadioGroupItem value="Nota en web con entrevista telefónica" id="f2" /><Label htmlFor="f2">Nota con entrevista telefónica</Label></div>
                                <div className="flex items-center space-x-2"><RadioGroupItem value="Nota en web con entrevista presencial (sin video)" id="f3" /><Label htmlFor="f3">Entrevista presencial (sin video)</Label></div>
                                <div className="flex items-center space-x-2"><RadioGroupItem value="Nota en web con entrevista en empresa + video youtube" id="f4" /><Label htmlFor="f4">Entrevista en empresa + Video YouTube</Label></div>
                                <div className="flex items-center space-x-2"><RadioGroupItem value="Nota en WEB a partir de Móvil o entrevista en Radio" id="f5" /><Label htmlFor="f5">A partir de Móvil o Radio</Label></div>
                            </RadioGroup>
                        </div>
                        
                        <div className="space-y-6">
                            <div className="space-y-3">
                                <Label className="font-bold text-orange-700">Soporte de Imágenes</Label>
                                <RadioGroup value={imageSupport} onValueChange={(v: any) => setImageSupport(v)} className="flex flex-col gap-2">
                                    <div className="flex items-center space-x-2"><RadioGroupItem value="Fotografías y/o videos enviados por el cliente" id="i1" /><Label htmlFor="i1">Enviados por cliente</Label></div>
                                    <div className="flex items-center space-x-2"><RadioGroupItem value="Fotografías y/o videos realizados por AIRE" id="i2" /><Label htmlFor="i2">Realizados por AIRE</Label></div>
                                    <div className="flex items-center space-x-2"><RadioGroupItem value="No requiere" id="i3" /><Label htmlFor="i3">No requiere</Label></div>
                                </RadioGroup>
                            </div>
                            <div className="space-y-2">
                                <Label>Inserts de apoyo (Opcional)</Label>
                                <Input value={inserts} onChange={e=>setInserts(e.target.value)} placeholder="Ej: Flyer adjunto, logo en Drive, etc." />
                            </div>
                        </div>
                    </div>
                </CardContent>
            </Card>

            <Card>
                <CardHeader><CardTitle>Réplica en Redes Sociales</CardTitle></CardHeader>
                <CardContent className="space-y-6">
                    <div className="grid md:grid-cols-2 gap-6">
                        <div className="space-y-4 border p-4 rounded bg-slate-50">
                            <div className="flex items-center space-x-2"><Checkbox checked={repIgStory} onCheckedChange={(v) => setRepIgStory(!!v)} /><Label className="font-bold">Publicación en IG Stories</Label></div>
                            {repIgStory && (
                                <RadioGroup value={repIgStoryProducer} onValueChange={(v: any) => setRepIgStoryProducer(v)} className="flex gap-4 ml-6">
                                    <div className="flex items-center space-x-2"><RadioGroupItem value="Envía Cte" id="s1" /><Label htmlFor="s1" className="text-xs">Envía Cliente</Label></div>
                                    <div className="flex items-center space-x-2"><RadioGroupItem value="Produce Aire" id="s2" /><Label htmlFor="s2" className="text-xs">Produce Aire</Label></div>
                                </RadioGroup>
                            )}
                        </div>

                        <div className="space-y-4 border p-4 rounded bg-slate-50">
                            <div className="flex items-center space-x-2"><Checkbox checked={repIgReel} onCheckedChange={(v) => setRepIgReel(!!v)} /><Label className="font-bold">Publicación en IG Reels</Label></div>
                            {repIgReel && (
                                <RadioGroup value={repIgReelProducer} onValueChange={(v: any) => setRepIgReelProducer(v)} className="flex gap-4 ml-6">
                                    <div className="flex items-center space-x-2"><RadioGroupItem value="Envía Cte" id="r1" /><Label htmlFor="r1" className="text-xs">Envía Cliente</Label></div>
                                    <div className="flex items-center space-x-2"><RadioGroupItem value="Produce Aire" id="r2" /><Label htmlFor="r2" className="text-xs">Produce Aire</Label></div>
                                </RadioGroup>
                            )}
                        </div>
                    </div>

                    <div className="flex flex-wrap gap-6 pt-4 border-t">
                        <div className="flex items-center space-x-2"><Checkbox checked={repFacebook} onCheckedChange={(v) => setRepFacebook(!!v)} /><Label>Link a Facebook</Label></div>
                        <div className="flex items-center space-x-2"><Checkbox checked={repTwitter} onCheckedChange={(v) => setRepTwitter(!!v)} /><Label>Link a Twitter/X</Label></div>
                        <div className="flex items-center space-x-2"><Checkbox checked={collaborateReel} onCheckedChange={(v) => setCollaborateReel(!!v)} /><Label>Reel Colaborativo</Label></div>
                    </div>

                    <div className="space-y-2 border-t pt-4 w-full md:w-1/2">
                        <Label>Instagram del Cliente a Etiquetar</Label>
                        <Input value={clientIgHandle} onChange={e=>setClientIgHandle(e.target.value)} placeholder="@usuario" />
                    </div>
                </CardContent>
            </Card>

            <Card>
                <CardHeader><CardTitle>Materiales de Apoyo</CardTitle></CardHeader>
                <CardContent className="space-y-4">
                    <div className="space-y-2">
                        <Label>Link de Materiales (Drive / WeTransfer)</Label>
                        <Input value={materialUrl} onChange={e => setMaterialUrl(e.target.value)} placeholder="https://..." className="bg-white" />
                    </div>
                    <div className="space-y-2">
                        <Label>Observaciones adicionales (Opcional)</Label>
                        <Textarea value={observations} onChange={e=>setObservations(e.target.value)} />
                    </div>
                </CardContent>
            </Card>
            
            <div style={{ position: 'absolute', top: -9999, left: -9999 }}>
                <WebNotePdf ref={pdfRef} note={getPreviewData()} />
            </div>
        </div>
    );
}
