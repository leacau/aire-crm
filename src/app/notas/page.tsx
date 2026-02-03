'use client';

import React, { useState, useEffect, useRef } from 'react';
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
import type { Client, Program, CommercialNote, ScheduleItem } from '@/lib/types';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { CalendarIcon, Save, Plus, ExternalLink, Trash2 } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { Switch } from '@/components/ui/switch';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import { NotePdf } from '@/components/notas/note-pdf';
import { sendEmail } from '@/lib/google-gmail-service';

export default function NotaComercialPage() {
    const { userInfo, getGoogleAccessToken } = useAuth();
    const { toast } = useToast();
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const pdfRef = useRef<HTMLDivElement>(null);

    // Data
    const [clients, setClients] = useState<Client[]>([]);
    const [programs, setPrograms] = useState<Program[]>([]);

    // --- SECCIÓN 1: DATOS DE CLIENTE ---
    const [selectedClientId, setSelectedClientId] = useState<string>('');
    const [cuit, setCuit] = useState('');
    const [razonSocial, setRazonSocial] = useState('');
    const [rubro, setRubro] = useState('');

    // --- SECCIÓN 2: COMERCIAL ---
    const [saleValue, setSaleValue] = useState<string>('');
    const [financialObservations, setFinancialObservations] = useState('');

    // --- SECCIÓN 3: PRODUCCIÓN/PAUTADO ---
    const [selectedProgramIds, setSelectedProgramIds] = useState<string[]>([]);
    // Map programId -> ScheduleItem[]
    const [programSchedule, setProgramSchedule] = useState<Record<string, ScheduleItem[]>>({});
    const [replicateWeb, setReplicateWeb] = useState(false);
    const [replicateSocials, setReplicateSocials] = useState<string[]>([]);
    const [contactPhone, setContactPhone] = useState('');
    const [contactName, setContactName] = useState('');

    // --- SECCIÓN 4: NOTA ---
    const [title, setTitle] = useState('');
    const [location, setLocation] = useState<'Estudio' | 'Empresa' | 'Meet' | 'Llamada' | undefined>(undefined);
    const [callPhone, setCallPhone] = useState('');
    const [primaryGraf, setPrimaryGraf] = useState('');
    const [secondaryGraf, setSecondaryGraf] = useState('');
    const [questions, setQuestions] = useState<string[]>(['', '', '', '', '']);

    // Entrevistado
    const [intervieweeName, setIntervieweeName] = useState('');
    const [intervieweeRole, setIntervieweeRole] = useState('');
    const [intervieweeBio, setIntervieweeBio] = useState('');

    // Canales de Contacto
    const [instagramHandle, setInstagramHandle] = useState('');
    const [website, setWebsite] = useState('');
    const [noWeb, setNoWeb] = useState(false);
    const [whatsapp, setWhatsapp] = useState('');
    const [noWhatsapp, setNoWhatsapp] = useState(false);
    const [commercialPhone, setCommercialPhone] = useState('');
    const [noCommercialPhone, setNoCommercialPhone] = useState(false);

    // Otros Nota
    const [graphicSupport, setGraphicSupport] = useState(false);
    const [graphicLink, setGraphicLink] = useState('');
    const [noteObservations, setNoteObservations] = useState('');

    const [notifyOnSave, setNotifyOnSave] = useState(false);

    // Función auxiliar para capturar y generar PDF multipágina
    const generateMultiPagePdf = async (element: HTMLElement) => {
        const page1 = element.querySelector('#note-pdf-page-1') as HTMLElement;
        const page2 = element.querySelector('#note-pdf-page-2') as HTMLElement;

        if (!page1 || !page2) throw new Error("No se encontraron las páginas del PDF");

        const pdf = new jsPDF('p', 'mm', 'a4');
        const pdfWidth = pdf.internal.pageSize.getWidth();
        const pdfHeight = pdf.internal.pageSize.getHeight();

        // Página 1
        const canvas1 = await html2canvas(page1, { scale: 2, useCORS: true });
        const imgData1 = canvas1.toDataURL('image/jpeg', 0.8);
        pdf.addImage(imgData1, 'JPEG', 0, 0, pdfWidth, pdfHeight);

        // Página 2
        pdf.addPage();
        const canvas2 = await html2canvas(page2, { scale: 2, useCORS: true });
        const imgData2 = canvas2.toDataURL('image/jpeg', 0.8);
        pdf.addImage(imgData2, 'JPEG', 0, 0, pdfWidth, pdfHeight);

        return pdf;
    };

    const handleDownloadPdf = async () => {
        if (!pdfRef.current) return;
        try {
            const pdf = await generateMultiPagePdf(pdfRef.current);
            pdf.save(`Nota_${title.replace(/ /g, "_")}.pdf`);
        } catch (error) {
            console.error(error);
            toast({ title: "Error al generar PDF", variant: "destructive" });
        }
    };


    useEffect(() => {
        const loadData = async () => {
            try {
                const [fetchedClients, fetchedPrograms] = await Promise.all([
                    getClients(),
                    getPrograms()
                ]);

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
            setRubro(client.rubro || '');
            setCommercialPhone(client.phone || '');
        }
    };

    // --- Helpers ---
    const toggleProgram = (programId: string) => {
        setSelectedProgramIds(prev =>
            prev.includes(programId)
                ? prev.filter(id => id !== programId)
                : [...prev, programId]
        );
        if (!programSchedule[programId]) {
            setProgramSchedule(prev => ({ ...prev, [programId]: [] }));
        }
    };

    const handleDateSelect = (programId: string, dates: Date[] | undefined) => {
        if (!dates) return;

        setProgramSchedule(prev => {
            const currentItems = prev[programId] || [];
            // Preserve existing times for dates that persist
            const newItems = dates.map(d => {
                const isoDate = d.toISOString();
                const existing = currentItems.find(item => item.date.split('T')[0] === isoDate.split('T')[0]);
                return existing ? existing : { date: isoDate, time: '' };
            });
            return { ...prev, [programId]: newItems };
        });
    };

    const handleTimeChange = (programId: string, dateIndex: number, time: string) => {
        setProgramSchedule(prev => {
            const items = [...(prev[programId] || [])];
            if (items[dateIndex]) {
                items[dateIndex] = { ...items[dateIndex], time };
            }
            return { ...prev, [programId]: items };
        });
    };

    const toggleSocial = (social: string) => {
        setReplicateSocials(prev =>
            prev.includes(social) ? prev.filter(s => s !== social) : [...prev, social]
        );
    };

    const handleAddQuestion = () => setQuestions([...questions, '']);

    const handleQuestionChange = (index: number, value: string) => {
        const newQ = [...questions];
        newQ[index] = value;
        setQuestions(newQ);
    };

    const handleRemoveQuestion = (index: number) => {
        const newQ = questions.filter((_, i) => i !== index);
        setQuestions(newQ);
    };

    // --- Calculations ---
    const totalValue = selectedProgramIds.reduce((acc, pid) => {
        const prog = programs.find(p => p.id === pid);
        const datesCount = programSchedule[pid]?.length || 0;
        const rate = prog?.rates?.notaComercial || 0;
        return acc + (rate * datesCount);
    }, 0);

    const saleValueNum = parseFloat(saleValue) || 0;
    const mismatch = saleValueNum > 0 ? (totalValue - saleValueNum) : 0;

    // --- Save Logic ---
    const handleSave = async () => {
        if (!selectedClientId || !userInfo) {
            toast({ title: 'Datos incompletos', description: 'Seleccione un cliente.', variant: 'destructive' });
            return;
        }
        if (!cuit.trim() || !razonSocial.trim() || !rubro.trim()) {
            toast({ title: 'Datos incompletos', description: 'Complete todos los datos del cliente (CUIT, Razón Social, Rubro).', variant: 'destructive' });
            return;
        }
        if (!saleValue) {
            toast({ title: 'Datos incompletos', description: 'Debe ingresar el Valor de Venta.', variant: 'destructive' });
            return;
        }
        if (selectedProgramIds.length === 0) {
            toast({ title: 'Datos incompletos', description: 'Seleccione al menos un programa.', variant: 'destructive' });
            return;
        }
        const missingDates = selectedProgramIds.some(pid => !programSchedule[pid] || programSchedule[pid].length === 0);
        if (missingDates) {
            toast({ title: 'Datos incompletos', description: 'Debe seleccionar fechas para todos los programas elegidos.', variant: 'destructive' });
            return;
        }
        if (!contactPhone.trim() || !contactName.trim()) {
            toast({ title: 'Datos incompletos', description: 'Complete los datos de coordinación (Teléfono y Responsable).', variant: 'destructive' });
            return;
        }
        if (!title.trim()) {
            toast({ title: 'Datos incompletos', description: 'El título de la nota es obligatorio.', variant: 'destructive' });
            return;
        }
        if (!location) {
            toast({ title: 'Datos incompletos', description: 'Seleccione dónde se realizará la nota (Estudio, Empresa, etc.).', variant: 'destructive' });
            return;
        }
        if (location === 'Llamada' && !callPhone.trim()) {
            toast({ title: 'Datos incompletos', description: 'Debe ingresar un teléfono para la llamada.', variant: 'destructive' });
            return;
        }
        if (!primaryGraf.trim() || !secondaryGraf.trim()) {
            toast({ title: 'Datos incompletos', description: 'Los grafs primario y secundario son obligatorios.', variant: 'destructive' });
            return;
        }
        const first5Questions = questions.slice(0, 5);
        if (first5Questions.some(q => !q.trim())) {
            toast({ title: 'Datos incompletos', description: 'Las primeras 5 preguntas son obligatorias.', variant: 'destructive' });
            return;
        }
        if (!intervieweeName.trim() || !intervieweeRole.trim()) {
            toast({ title: 'Datos incompletos', description: 'El nombre y cargo del entrevistado son obligatorios.', variant: 'destructive' });
            return;
        }
        if (!noWeb && !website.trim()) {
            toast({ title: 'Datos incompletos', description: 'Complete la Web o marque "No informar".', variant: 'destructive' });
            return;
        }
        if (!noWhatsapp && !whatsapp.trim()) {
            toast({ title: 'Datos incompletos', description: 'Complete el WhatsApp o marque "No informar".', variant: 'destructive' });
            return;
        }
        if (!noCommercialPhone && !commercialPhone.trim()) {
            toast({ title: 'Datos incompletos', description: 'Complete el Teléfono Comercial o marque "No informar".', variant: 'destructive' });
            return;
        }
        if (graphicSupport && !graphicLink.trim()) {
            toast({ title: 'Datos incompletos', description: 'Si indica soporte gráfico, debe proveer un link.', variant: 'destructive' });
            return;
        }

        setSaving(true);
        try {
            const client = clients.find(c => c.id === selectedClientId);

            // 1. Update Client info
            const updates: any = {};
            if (client) {
                if (client.cuit !== cuit) updates.cuit = cuit;
                if (client.rubro !== rubro) updates.rubro = rubro;
                if (client.razonSocial !== razonSocial) updates.razonSocial = razonSocial;
                if (Object.keys(updates).length > 0) {
                    await updateClientTangoMapping(client.id, updates, userInfo.id, userInfo.name);
                }
            }

            // 2. Prepare Data Raw
            const noteDataRaw = {
                clientId: selectedClientId,
                clientName: client?.denominacion || 'Unknown',
                cuit,
                advisorId: userInfo.id,
                advisorName: userInfo.name,
                razonSocial,
                rubro,
                replicateWeb,
                replicateSocials,
                programIds: selectedProgramIds,
                schedule: programSchedule,
                contactPhone,
                contactName,
                title,
                location,
                callPhone: location === 'Llamada' ? callPhone : undefined,
                primaryGraf,
                secondaryGraf,
                questions: questions.filter(q => q.trim() !== ''),
                intervieweeName,
                intervieweeRole,
                intervieweeBio: intervieweeBio || undefined,
                instagram: instagramHandle ? instagramHandle : undefined,
                website: noWeb ? undefined : website,
                noWeb,
                whatsapp: noWhatsapp ? undefined : whatsapp,
                noWhatsapp,
                phone: noCommercialPhone ? undefined : commercialPhone,
                noCommercialPhone,
                graphicSupport,
                graphicSupportLink: graphicSupport ? graphicLink : undefined,
                totalValue,
                saleValue: saleValueNum,
                mismatch,
                financialObservations: financialObservations || undefined,
                noteObservations: noteObservations || undefined,
            };

            const noteData = Object.keys(noteDataRaw).reduce((acc, key) => {
                const value = (noteDataRaw as any)[key];
                if (value !== undefined) {
                    (acc as any)[key] = value;
                }
                return acc;
            }, {} as Omit<CommercialNote, 'id' | 'createdAt'>);

            // 3. Save to DB
            await saveCommercialNote(noteData, userInfo.id, userInfo.name);

            // 4. Handle Notification
            if (notifyOnSave && pdfRef.current) {
                // Usamos la función destructurada del hook
                const accessToken = await getGoogleAccessToken();
                if (accessToken) {
                    try {
                        const pdf = await generateMultiPagePdf(pdfRef.current);
                        const pdfBase64 = pdf.output('datauristring').split(',')[1];

                        // Preparar datos para el cuerpo del mail
                        const baseUrl = window.location.origin;
                        const detailLink = `${baseUrl}/clients/${selectedClientId}?tab=notes`;
                        
                        // Extraer info de cronograma para el mail
                        let scheduleSummary = '';
                        Object.entries(programSchedule).forEach(([progId, items]) => {
                            const progName = programs.find(p => p.id === progId)?.name || 'Programa';
                            items.forEach(item => {
                                scheduleSummary += `<li><strong>${progName}</strong>: ${format(new Date(item.date), 'dd/MM/yyyy')} ${item.time}hs</li>`;
                            });
                        });

                        const emailBody = `
                            <div style="font-family: Arial, sans-serif; color: #333;">
                                <h2 style="color: #cc0000;">Nueva Nota Comercial Registrada</h2>
                                <p>El asesor <strong>${userInfo.name}</strong> ha cargado una nueva nota.</p>
                                
                                <div style="background-color: #f5f5f5; padding: 15px; border-left: 4px solid #cc0000; margin: 20px 0;">
                                    <p><strong>Cliente:</strong> ${client?.denominacion || 'Desconocido'}</p>
                                    <p><strong>Título:</strong> ${title}</p>
                                    <p><strong>Cronograma:</strong></p>
                                    <ul>${scheduleSummary || '<li>Sin fecha definida</li>'}</ul>
                                </div>

                                <p>Puede ver el detalle completo y descargar el PDF ingresando al siguiente enlace:</p>
                                <p>
                                    <a href="${detailLink}" style="background-color: #cc0000; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; font-weight: bold;">
                                        Ver Detalle de la Nota
                                    </a>
                                </p>
                                <p style="font-size: 12px; color: #666; margin-top: 20px;">O ingrese manualmente a: <a href="${detailLink}">${detailLink}</a></p>
                            </div>
                        `;

                        // Enviar a la API
                        await sendEmail({
                            accessToken,
                            to: 'lchena@airedesantafe.com.ar', 
                            subject: `Nueva Nota Comercial: ${title} - ${client?.denominacion}`,
                            body: emailBody,
                            attachments: [{
                                filename: `Nota_${title.replace(/ /g, "_")}.pdf`,
                                content: pdfBase64,
                                encoding: 'base64'
                            }]
                        });
                        toast({ title: 'Nota guardada y notificada por correo.' });
                    } catch (emailError) {
                        console.error("Error sending email/generating PDF", emailError);
                        toast({ title: 'Nota guardada, pero falló el envío del correo.', description: "Verifique el tamaño del adjunto o intente nuevamente.", variant: 'default' });
                    }
                } else {
                    toast({ title: 'Sin Token', description: "No se pudo obtener acceso a Google para enviar el correo.", variant: 'destructive' });
                }
            } else {
                toast({ title: 'Nota guardada correctamente.' });
            }

            // Reset
            setSelectedProgramIds([]);
            setProgramSchedule({});
            setSaleValue('');
            setFinancialObservations('');
            setNoteObservations('');
            setTitle('');
            setQuestions(['', '', '', '', '']);
            setPrimaryGraf('');
            setSecondaryGraf('');
            setLocation(undefined);
            setIntervieweeName('');
            setIntervieweeRole('');
            setIntervieweeBio('');
            setInstagramHandle('');
            setWebsite('');
            setWhatsapp('');
            setCommercialPhone('');

        } catch (error) {
            console.error(error);
            toast({ title: 'Error al guardar', description: 'Por favor revise los datos e intente nuevamente.', variant: 'destructive' });
        } finally {
            setSaving(false);
        }
    }; 

    if (loading) return <div className="flex h-full items-center justify-center"><Spinner size="large" /></div>;

    return (
        <div className="flex flex-col h-full overflow-hidden">
            <Header title="Nueva Nota Comercial">
                <div className="flex items-center gap-4">
                    <div className="flex items-center space-x-2">
                        <Button variant="outline" onClick={handleDownloadPdf} disabled={!selectedClientId || !title}>
                            <ExternalLink className="mr-2 h-4 w-4" />
                            Exportar PDF
                        </Button>
                    </div>
                    <div className="flex items-center space-x-2">
                        <Switch id="notify" checked={notifyOnSave} onCheckedChange={setNotifyOnSave} />
                        <Label htmlFor="notify">Notificar al guardar</Label>
                    </div>
                    <Button onClick={handleSave} disabled={saving}>
                        {saving ? <Spinner size="small" className="mr-2" /> : <Save className="mr-2 h-4 w-4" />}
                        Guardar Nota
                    </Button>
                </div>
            </Header>
            <main className="flex-1 overflow-auto p-4 md:p-6 space-y-6">

                {/* --- SECCIÓN 1: DATOS DE CLIENTE --- */}
                <Card>
                    <CardHeader><CardTitle>Datos de Cliente</CardTitle></CardHeader>
                    <CardContent className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                        <div className="space-y-2">
                            <Label>Cliente <span className="text-red-500">*</span></Label>
                            <Select value={selectedClientId} onValueChange={handleClientSelect}>
                                <SelectTrigger><SelectValue placeholder="Seleccionar..." /></SelectTrigger>
                                <SelectContent>
                                    {clients.map(c => <SelectItem key={c.id} value={c.id}>{c.denominacion}</SelectItem>)}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-2">
                            <Label>CUIT <span className="text-red-500">*</span></Label>
                            <Input value={cuit} onChange={e => setCuit(e.target.value)} placeholder="00-00000000-0" />
                        </div>
                        <div className="space-y-2">
                            <Label>Razón Social <span className="text-red-500">*</span></Label>
                            <Input value={razonSocial} onChange={e => setRazonSocial(e.target.value)} />
                        </div>
                        <div className="space-y-2">
                            <Label>Rubro <span className="text-red-500">*</span></Label>
                            <Input value={rubro} onChange={e => setRubro(e.target.value)} />
                        </div>
                    </CardContent>
                </Card>

                {/* --- SECCIÓN 2: COMERCIAL --- */}
                <Card>
                    <CardHeader><CardTitle>Comercial</CardTitle></CardHeader>
                    <CardContent className="grid gap-6 md:grid-cols-2">
                        <div className="space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label>Valor Total (Tarifario)</Label>
                                    <Input value={`$ ${totalValue.toLocaleString()}`} disabled className="font-bold bg-muted" />
                                </div>
                                <div className="space-y-2">
                                    <Label>Valor de Venta <span className="text-red-500">*</span></Label>
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
                        </div>
                        <div className="space-y-2">
                            <Label>Observaciones Generales</Label>
                            <Textarea
                                value={financialObservations}
                                onChange={e => setFinancialObservations(e.target.value)}
                                placeholder="Indicaciones sobre el cierre comercial..."
                                className="min-h-[100px]"
                            />
                        </div>
                    </CardContent>
                </Card>

                {/* --- SECCIÓN 3: PRODUCCIÓN/PAUTADO --- */}
                <Card>
                    <CardHeader><CardTitle>Producción / Pautado</CardTitle></CardHeader>
                    <CardContent className="space-y-6">
                        {/* Programación */}
                        <div className="space-y-4 border p-4 rounded-md">
                            <Label className="text-base font-semibold">Programación <span className="text-red-500">*</span></Label>
                            <div className="flex flex-wrap gap-2">
                                {programs.map(prog => (
                                    <div key={prog.id} className="flex items-center space-x-2 border p-2 rounded-md hover:bg-muted/50 cursor-pointer" onClick={() => toggleProgram(prog.id)}>
                                        <Checkbox checked={selectedProgramIds.includes(prog.id)} onCheckedChange={() => toggleProgram(prog.id)} />
                                        <span className="text-sm font-medium">{prog.name}</span>
                                    </div>
                                ))}
                            </div>

                            {selectedProgramIds.length > 0 && (
                                <div className="grid gap-4 md:grid-cols-2 mt-4">
                                    {selectedProgramIds.map(pid => {
                                        const prog = programs.find(p => p.id === pid);
                                        const items = programSchedule[pid] || [];
                                        return (
                                            <div key={pid} className="border p-3 rounded-md space-y-3">
                                                <div className="flex items-center justify-between">
                                                    <span className="font-medium">{prog?.name}</span>
                                                    <Popover>
                                                        <PopoverTrigger asChild>
                                                            <Button variant={"outline"} size="sm">
                                                                <CalendarIcon className="mr-2 h-4 w-4" />
                                                                Elegir Fechas
                                                            </Button>
                                                        </PopoverTrigger>
                                                        <PopoverContent className="w-auto p-0" align="start">
                                                            <Calendar
                                                                mode="multiple"
                                                                selected={items.map(i => new Date(i.date))}
                                                                onSelect={(dates) => handleDateSelect(pid, dates)}
                                                                initialFocus
                                                                locale={es}
                                                            />
                                                        </PopoverContent>
                                                    </Popover>
                                                </div>
                                                {items.length > 0 && (
                                                    <div className="space-y-2 max-h-40 overflow-y-auto pr-2">
                                                        {items.map((item, idx) => (
                                                            <div key={item.date} className="flex items-center gap-2 text-sm">
                                                                <span className="w-24 text-muted-foreground">{format(new Date(item.date), 'dd/MM/yyyy')}</span>
                                                                <Input
                                                                    type="time"
                                                                    className="h-8"
                                                                    value={item.time || ''}
                                                                    onChange={(e) => handleTimeChange(pid, idx, e.target.value)}
                                                                />
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>

                        <div className="grid gap-6 md:grid-cols-2">
                            <div className="space-y-4">
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
                            </div>
                            <div className="space-y-4">
                                <div className="space-y-2">
                                    <Label>Teléfono para coordinar <span className="text-red-500">*</span></Label>
                                    <Input value={contactPhone} onChange={e => setContactPhone(e.target.value)} placeholder="0342-..." />
                                </div>
                                <div className="space-y-2">
                                    <Label>Responsable de la coordinación (cliente) <span className="text-red-500">*</span></Label>
                                    <Input value={contactName} onChange={e => setContactName(e.target.value)} placeholder="Nombre del contacto..." />
                                </div>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                {/* --- SECCIÓN 4: NOTA --- */}
                <Card>
                    <CardHeader><CardTitle>Nota</CardTitle></CardHeader>
                    <CardContent className="space-y-6">
                        {/* Detalles */}
                        <div className="grid gap-4 md:grid-cols-2">
                            <div className="space-y-2">
                                <Label>Título de la Nota <span className="text-red-500">*</span></Label>
                                <Input
                                    value={title}
                                    onChange={e => setTitle(e.target.value)}
                                    placeholder="Ej: Lanzamiento de temporada..."
                                />
                            </div>
                            <div className="space-y-3">
                                <Label>Nota en: <span className="text-red-500">*</span></Label>
                                <RadioGroup
                                    value={location}
                                    onValueChange={(val: any) => setLocation(val)}
                                    className="flex flex-wrap gap-4"
                                >
                                    <div className="flex items-center space-x-2">
                                        <RadioGroupItem value="Estudio" id="loc-estudio" />
                                        <Label htmlFor="loc-estudio">Estudio</Label>
                                    </div>
                                    <div className="flex items-center space-x-2">
                                        <RadioGroupItem value="Empresa" id="loc-empresa" />
                                        <Label htmlFor="loc-empresa">Empresa</Label>
                                    </div>
                                    <div className="flex items-center space-x-2">
                                        <RadioGroupItem value="Meet" id="loc-meet" />
                                        <Label htmlFor="loc-meet">Meet</Label>
                                    </div>
                                    <div className="flex items-center space-x-2">
                                        <RadioGroupItem value="Llamada" id="loc-llamada" />
                                        <Label htmlFor="loc-llamada">Llamada</Label>
                                    </div>
                                </RadioGroup>
                                {location === 'Llamada' && (
                                    <div className="pt-2">
                                        <Label className="text-xs text-muted-foreground">Teléfono para la llamada <span className="text-red-500">*</span></Label>
                                        <Input
                                            value={callPhone}
                                            onChange={e => setCallPhone(e.target.value)}
                                            placeholder="Ingrese el número..."
                                            className="mt-1"
                                        />
                                    </div>
                                )}
                            </div>
                        </div>

                        <div className="grid gap-4 md:grid-cols-2">
                            <div className="space-y-2">
                                <div className="flex justify-between">
                                    <Label>Graf Primario <span className="text-red-500">*</span></Label>
                                    <span className="text-xs text-muted-foreground">{primaryGraf.length}/80</span>
                                </div>
                                <Input
                                    value={primaryGraf}
                                    onChange={e => setPrimaryGraf(e.target.value)}
                                    placeholder="Texto principal en pantalla..."
                                    maxLength={80}
                                />
                            </div>
                            <div className="space-y-2">
                                <div className="flex justify-between">
                                    <Label>Graf Secundario <span className="text-red-500">*</span></Label>
                                    <span className="text-xs text-muted-foreground">{secondaryGraf.length}/80</span>
                                </div>
                                <Input
                                    value={secondaryGraf}
                                    onChange={e => setSecondaryGraf(e.target.value)}
                                    placeholder="Bajada o detalle..."
                                    maxLength={80}
                                />
                            </div>
                        </div>

                        {/* Preguntas */}
                        <div className="space-y-3 border p-4 rounded-md">
                            <div className="flex items-center justify-between">
                                <Label>Preguntas sugeridas (min 5) <span className="text-red-500">*</span></Label>
                                <Button variant="ghost" size="sm" onClick={handleAddQuestion}>
                                    <Plus className="mr-2 h-4 w-4" /> Agregar Pregunta
                                </Button>
                            </div>
                            <div className="space-y-2">
                                {questions.map((q, idx) => (
                                    <div key={idx} className="flex gap-2">
                                        <Input
                                            value={q}
                                            onChange={e => handleQuestionChange(idx, e.target.value)}
                                            placeholder={`Pregunta ${idx + 1}`}
                                        />
                                        {questions.length > 5 && (
                                            <Button size="icon" variant="ghost" onClick={() => handleRemoveQuestion(idx)}>
                                                <Trash2 className="h-4 w-4 text-muted-foreground hover:text-destructive" />
                                            </Button>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Entrevistado */}
                        <div className="grid gap-4 md:grid-cols-2">
                            <div className="space-y-2">
                                <Label>Nombre de entrevistado <span className="text-red-500">*</span></Label>
                                <Input value={intervieweeName} onChange={e => setIntervieweeName(e.target.value)} />
                            </div>
                            <div className="space-y-2">
                                <Label>Cargo/Título del entrevistado <span className="text-red-500">*</span></Label>
                                <Input value={intervieweeRole} onChange={e => setIntervieweeRole(e.target.value)} />
                            </div>
                            <div className="md:col-span-2 space-y-2">
                                <Label>Bio de entrevistado (opcional)</Label>
                                <Textarea value={intervieweeBio} onChange={e => setIntervieweeBio(e.target.value)} className="min-h-[80px]" />
                            </div>
                        </div>

                        {/* Canales de Contacto */}
                        <div className="grid gap-4 md:grid-cols-2">
                            <div className="space-y-2">
                                <Label>Instagram</Label>
                                <div className="flex items-center gap-2">
                                    <Input
                                        value={instagramHandle}
                                        onChange={e => setInstagramHandle(e.target.value)}
                                        placeholder="@usuario"
                                    />
                                    {instagramHandle && (
                                        <Button
                                            size="icon"
                                            variant="ghost"
                                            onClick={() => window.open(`https://instagram.com/${instagramHandle.replace('@', '').replace('https://instagram.com/', '')}`, '_blank')}
                                        >
                                            <ExternalLink className="h-4 w-4" />
                                        </Button>
                                    )}
                                </div>
                            </div>
                            <div className="space-y-2">
                                <div className="flex items-center justify-between">
                                    <Label className={cn(noWeb && "text-muted-foreground")}>Web del Cliente <span className="text-red-500">*</span></Label>
                                    <div className="flex items-center space-x-2">
                                        <Checkbox id="noWeb" checked={noWeb} onCheckedChange={(c) => setNoWeb(!!c)} />
                                        <Label htmlFor="noWeb" className="text-xs font-normal">No informar</Label>
                                    </div>
                                </div>
                                <Input
                                    value={website}
                                    onChange={e => setWebsite(e.target.value)}
                                    disabled={noWeb}
                                    placeholder="www.sitio.com"
                                />
                                {website && (
                                        <Button
                                            size="icon"
                                            variant="ghost"
                                            onClick={() => window.open(website, '_blank')}
                                        >
                                            <ExternalLink className="h-4 w-4" />
                                        </Button>
                                    )}
                            </div>
                            <div className="space-y-2">
                                <div className="flex items-center justify-between">
                                    <Label className={cn(noWhatsapp && "text-muted-foreground")}>WhatsApp <span className="text-red-500">*</span></Label>
                                    <div className="flex items-center space-x-2">
                                        <Checkbox id="noWhatsapp" checked={noWhatsapp} onCheckedChange={(c) => setNoWhatsapp(!!c)} />
                                        <Label htmlFor="noWhatsapp" className="text-xs font-normal">No informar</Label>
                                    </div>
                                </div>
                                <Input
                                    value={whatsapp}
                                    onChange={e => setWhatsapp(e.target.value)}
                                    disabled={noWhatsapp}
                                    placeholder="0342-..."
                                />
                            </div>
                            <div className="space-y-2">
                                <div className="flex items-center justify-between">
                                    <Label className={cn(noCommercialPhone && "text-muted-foreground")}>Teléfono Comercial <span className="text-red-500">*</span></Label>
                                    <div className="flex items-center space-x-2">
                                        <Checkbox id="noCommercialPhone" checked={noCommercialPhone} onCheckedChange={(c) => setNoCommercialPhone(!!c)} />
                                        <Label htmlFor="noCommercialPhone" className="text-xs font-normal">No informar</Label>
                                    </div>
                                </div>
                                <Input
                                    value={commercialPhone}
                                    onChange={e => setCommercialPhone(e.target.value)}
                                    disabled={noCommercialPhone}
                                    placeholder="0342-..."
                                />
                            </div>
                        </div>

                        {/* Extra */}
                        <div className="space-y-4 border-t pt-4">
                            <div className="flex items-center space-x-2">
                                <Switch checked={graphicSupport} onCheckedChange={setGraphicSupport} />
                                <Label>Agrega Soporte Gráfico</Label>
                            </div>
                            {graphicSupport && (
                                <Input
                                    value={graphicLink}
                                    onChange={e => setGraphicLink(e.target.value)}
                                    placeholder="Pegar link de Google Drive aquí..."
                                />
                            )}
                            <div className="space-y-2">
                                <Label>Observaciones generales</Label>
                                <Textarea
                                    value={noteObservations}
                                    onChange={e => setNoteObservations(e.target.value)}
                                    placeholder="Indicaciones para producción..."
                                    className="min-h-[100px]"
                                />
                            </div>
                        </div>
                    </CardContent>
                </Card>

            </main>

            {/* Hidden PDF Component */}
            <div style={{ position: 'absolute', top: -9999, left: -9999 }}>
                <NotePdf
                    ref={pdfRef}
                    programs={programs}
                    note={{
                        clientName: clients.find(c => c.id === selectedClientId)?.denominacion,
                        cuit,
                        advisorName: userInfo?.name,
                        razonSocial,
                        rubro,
                        replicateWeb,
                        replicateSocials,
                        schedule: programSchedule,
                        contactPhone,
                        contactName,
                        title,
                        location,
                        callPhone: location === 'Llamada' ? callPhone : undefined,
                        primaryGraf,
                        secondaryGraf,
                        questions: questions.filter(q => q.trim() !== ''),
                        intervieweeName,
                        intervieweeRole,
                        intervieweeBio,
                        instagram: instagramHandle ? instagramHandle : undefined,
                        website: noWeb ? undefined : website,
                        whatsapp: noWhatsapp ? undefined : whatsapp,
                        phone: noCommercialPhone ? undefined : commercialPhone,
                        noWeb, noWhatsapp, noCommercialPhone,
                        graphicSupport,
                        graphicSupportLink: graphicSupport ? graphicLink : undefined,
                        noteObservations
                    }}
                />
            </div>
        </div>
    );
}
