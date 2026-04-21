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
import { getClients, getPrograms, updateClientTangoMapping, saveCommercialNote, getCommercialNote, updateCommercialNote, getAllUsers } from '@/lib/firebase-service'; 
import type { Client, Program, CommercialNote, ScheduleItem, User } from '@/lib/types';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { CalendarIcon, Save, Plus, ExternalLink, Trash2, MapPin, Minus, ArrowLeft } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { Switch } from '@/components/ui/switch';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import { NotePdf } from '@/components/notas/note-pdf';
import { sendEmail } from '@/lib/google-gmail-service';
import { hasManagementPrivileges } from '@/lib/role-utils';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';

export default function NewCommercialNotePage() {
    const { userInfo, getGoogleAccessToken } = useAuth();
    const { toast } = useToast();
    const router = useRouter();
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const pdfRef = useRef<HTMLDivElement>(null);
    
    const [clients, setClients] = useState<Client[]>([]);
    const [programs, setPrograms] = useState<Program[]>([]);
    const [users, setUsers] = useState<User[]>([]); 
    
    const [selectedClientId, setSelectedClientId] = useState<string>('');
    const [cuit, setCuit] = useState('');
    const [razonSocial, setRazonSocial] = useState('');
    const [rubro, setRubro] = useState('');
    
    const [advisorId, setAdvisorId] = useState('');
    const [advisorName, setAdvisorName] = useState('');
    
    const [saleValue, setSaleValue] = useState<string>('');
    const [financialObservations, setFinancialObservations] = useState('');
    
    const [selectedProgramIds, setSelectedProgramIds] = useState<string[]>([]);
    const [programSchedule, setProgramSchedule] = useState<Record<string, ScheduleItem[]>>({});
    const [replicateWeb, setReplicateWeb] = useState(false);
    const [replicateSocials, setReplicateSocials] = useState<string[]>([]);
    
    const [collaboration, setCollaboration] = useState(false);
    const [collaborationHandle, setCollaborationHandle] = useState('');
    const [ctaText, setCtaText] = useState('');
    const [ctaDestination, setCtaDestination] = useState('');

    const [contactPhone, setContactPhone] = useState('');
    const [contactName, setContactName] = useState('');

    const [title, setTitle] = useState('');
    const [location, setLocation] = useState<'Estudio' | 'Móvil' | 'Meet' | 'Llamada' | undefined>(undefined);
    const [callPhone, setCallPhone] = useState('');
    const [mobileAddress, setMobileAddress] = useState(''); 
    
    const [primaryGrafs, setPrimaryGrafs] = useState<string[]>(['']);
    const [secondaryGrafs, setSecondaryGrafs] = useState<string[]>(['']);
    
    const [questions, setQuestions] = useState<string[]>(['', '', '', '', '']);
    const [topicsToAvoid, setTopicsToAvoid] = useState<string[]>(['']);

    const [intervieweeName, setIntervieweeName] = useState('');
    const [intervieweeRole, setIntervieweeRole] = useState('');
    const [intervieweeBio, setIntervieweeBio] = useState('');

    const [instagramHandle, setInstagramHandle] = useState('');
    const [noInstagram, setNoInstagram] = useState(false);
    const [website, setWebsite] = useState('');
    const [noWeb, setNoWeb] = useState(false);
    const [whatsapp, setWhatsapp] = useState('');
    const [noWhatsapp, setNoWhatsapp] = useState(false);
    const [commercialPhone, setCommercialPhone] = useState('');
    const [noCommercialPhone, setNoCommercialPhone] = useState(false);
    const [commercialAddresses, setCommercialAddresses] = useState<string[]>(['']);
    const [noCommercialAddress, setNoCommercialAddress] = useState(false);

    const [graphicSupport, setGraphicSupport] = useState(false);
    const [graphicLinks, setGraphicLinks] = useState<string[]>(['']);
    const [noteObservations, setNoteObservations] = useState('');

    const [notifyOnSave, setNotifyOnSave] = useState(true);
    const [isRestored, setIsRestored] = useState(false);
    const [draftLoaded, setDraftLoaded] = useState(false); 

    const [editModeId, setEditModeId] = useState<string | null>(null);

    const primaryGrafError = primaryGrafs.some(g => g.length > 84);
    const secondaryGrafError = secondaryGrafs.some(g => g.length > 55);
    const hasGrafErrors = primaryGrafError || secondaryGrafError;

    const canReassign = userInfo && (hasManagementPrivileges(userInfo) || userInfo.role === 'Administracion' || userInfo.role === 'Admin');

    const generateMultiPagePdf = async (element: HTMLElement) => {
        const page1 = element.querySelector('#note-pdf-page-1') as HTMLElement;
        const page2 = element.querySelector('#note-pdf-page-2') as HTMLElement;
        if (!page1 || !page2) throw new Error("No se encontraron las páginas del PDF");

        const pdf = new jsPDF('p', 'mm', 'a4');
        const pdfWidth = pdf.internal.pageSize.getWidth();
        const pdfHeight = pdf.internal.pageSize.getHeight();

        const processPage = async (pageElement: HTMLElement, pageNum: number) => {
            const canvas = await html2canvas(pageElement, { scale: 2, useCORS: true });
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
        if (hasGrafErrors) {
            toast({ title: "Corrija los errores en los Grafs antes de exportar.", variant: "destructive" });
            return;
        }
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
        const search = window.location.search;
        const params = new URLSearchParams(search);
        const cloneId = params.get('cloneId');
        const editId = params.get('editId'); 

        const idToFetch = cloneId || editId;

        if (idToFetch) {
            if (editId) {
                setEditModeId(editId);
                setNotifyOnSave(true); 
            }

            getCommercialNote(idToFetch).then(note => {
                if (note) {
                    setSelectedClientId(note.clientId);
                    setCuit(note.cuit || '');
                    setRazonSocial(note.razonSocial || '');
                    setRubro(note.rubro || '');
                    setSaleValue(note.saleValue?.toString() || '');
                    setFinancialObservations(note.financialObservations || '');
                    setSelectedProgramIds(note.programIds || []);
                    setProgramSchedule(note.schedule || {});
                    setReplicateWeb(note.replicateWeb || false);
                    setReplicateSocials(note.replicateSocials || []);
                    setCollaboration(note.collaboration || false);
                    setCollaborationHandle(note.collaborationHandle || '');
                    setCtaText(note.ctaText || '');
                    setCtaDestination(note.ctaDestination || '');
                    setContactPhone(note.contactPhone || '');
                    setContactName(note.contactName || '');
                    
                    setTitle(note.title ? (cloneId ? `${note.title} (Copia)` : note.title) : ''); 
                    
                    setLocation(note.location);
                    setCallPhone(note.callPhone || '');
                    setMobileAddress(note.mobileAddress || '');
                    setPrimaryGrafs(note.primaryGrafs?.length ? note.primaryGrafs : ['']);
                    setSecondaryGrafs(note.secondaryGrafs?.length ? note.secondaryGrafs : ['']);
                    setQuestions(note.questions?.length ? note.questions : ['', '', '', '', '']);
                    setTopicsToAvoid(note.topicsToAvoid?.length ? note.topicsToAvoid : ['']);
                    setIntervieweeName(note.intervieweeName || '');
                    setIntervieweeRole(note.intervieweeRole || '');
                    setIntervieweeBio(note.intervieweeBio || '');
                    setInstagramHandle(note.instagram || '');
                    setNoInstagram(!!note.noInstagram);
                    setWebsite(note.website || '');
                    setNoWeb(!!note.noWeb);
                    setWhatsapp(note.whatsapp || '');
                    setNoWhatsapp(!!note.noWhatsapp);
                    setCommercialPhone(note.phone || '');
                    setNoCommercialPhone(!!note.noCommercialPhone);
                    setCommercialAddresses(note.commercialAddresses?.length ? note.commercialAddresses : ['']);
                    setNoCommercialAddress(!!note.noCommercialAddress);
                    setGraphicSupport(!!note.graphicSupport);
                    setGraphicLinks(note.graphicSupportLinks?.length ? note.graphicSupportLinks : (note.graphicSupportLink ? [note.graphicSupportLink] : ['']));
                    setNoteObservations(note.noteObservations || '');

                    setAdvisorId(note.advisorId || userInfo?.id || '');
                    setAdvisorName(note.advisorName || userInfo?.name || '');
                }
                setIsRestored(true);
            });
        } else {
            const draft = localStorage.getItem('commercial_note_draft');
            if (draft) {
                try {
                    const parsed = JSON.parse(draft);
                    setSelectedClientId(parsed.selectedClientId || '');
                    setCuit(parsed.cuit || '');
                    setRazonSocial(parsed.razonSocial || '');
                    setRubro(parsed.rubro || '');
                    setSaleValue(parsed.saleValue || '');
                    setFinancialObservations(parsed.financialObservations || '');
                    setSelectedProgramIds(parsed.selectedProgramIds || []);
                    setProgramSchedule(parsed.programSchedule || {});
                    setReplicateWeb(parsed.replicateWeb || false);
                    setReplicateSocials(parsed.replicateSocials || []);
                    setCollaboration(parsed.collaboration || false);
                    setCollaborationHandle(parsed.collaborationHandle || '');
                    setCtaText(parsed.ctaText || '');
                    setCtaDestination(parsed.ctaDestination || '');
                    setContactPhone(parsed.contactPhone || '');
                    setContactName(parsed.contactName || '');
                    setTitle(parsed.title || '');
                    setLocation(parsed.location);
                    setCallPhone(parsed.callPhone || '');
                    setMobileAddress(parsed.mobileAddress || '');
                    setPrimaryGrafs(parsed.primaryGrafs || ['']);
                    setSecondaryGrafs(parsed.secondaryGrafs || ['']);
                    setQuestions(parsed.questions || ['', '', '', '', '']);
                    setTopicsToAvoid(parsed.topicsToAvoid || ['']);
                    setIntervieweeName(parsed.intervieweeName || '');
                    setIntervieweeRole(parsed.intervieweeRole || '');
                    setIntervieweeBio(parsed.intervieweeBio || '');
                    setInstagramHandle(parsed.instagramHandle || '');
                    setNoInstagram(parsed.noInstagram || false);
                    setWebsite(parsed.website || '');
                    setNoWeb(parsed.noWeb || false);
                    setWhatsapp(parsed.whatsapp || '');
                    setNoWhatsapp(parsed.noWhatsapp || false);
                    setCommercialPhone(parsed.commercialPhone || '');
                    setNoCommercialPhone(parsed.noCommercialPhone || false);
                    setCommercialAddresses(parsed.commercialAddresses || ['']);
                    setNoCommercialAddress(parsed.noCommercialAddress || false);
                    setGraphicSupport(parsed.graphicSupport || false);
                    setGraphicLinks(parsed.graphicLinks || ['']);
                    setNoteObservations(parsed.noteObservations || '');
                    
                    if (parsed.advisorId) setAdvisorId(parsed.advisorId);
                    if (parsed.advisorName) setAdvisorName(parsed.advisorName);

                    if (parsed.selectedClientId || parsed.title) {
                        setDraftLoaded(true);
                        toast({ title: "Borrador recuperado", description: "Se han restaurado los datos que estabas cargando." });
                    }
                } catch (e) {
                    console.error("Error recuperando el borrador", e);
                }
            } else {
                setAdvisorId(userInfo?.id || '');
                setAdvisorName(userInfo?.name || '');
            }
            setIsRestored(true);
        }
    }, [toast, userInfo]);

    useEffect(() => {
        if (!isRestored || editModeId) return; 
        const draftData = {
            selectedClientId, cuit, razonSocial, rubro, saleValue, financialObservations,
            selectedProgramIds, programSchedule, replicateWeb, replicateSocials,
            collaboration, collaborationHandle, ctaText, ctaDestination,
            contactPhone, contactName, title, location, callPhone, mobileAddress,
            primaryGrafs, secondaryGrafs, questions, topicsToAvoid,
            intervieweeName, intervieweeRole, intervieweeBio,
            instagramHandle, noInstagram, website, noWeb, whatsapp, noWhatsapp,
            commercialPhone, noCommercialPhone, commercialAddresses, noCommercialAddress,
            graphicSupport, graphicLinks, noteObservations, advisorId, advisorName
        };
        localStorage.setItem('commercial_note_draft', JSON.stringify(draftData));
    }, [isRestored, editModeId, selectedClientId, cuit, razonSocial, rubro, saleValue, financialObservations, selectedProgramIds, programSchedule, replicateWeb, replicateSocials, collaboration, collaborationHandle, ctaText, ctaDestination, contactPhone, contactName, title, location, callPhone, mobileAddress, primaryGrafs, secondaryGrafs, questions, topicsToAvoid, intervieweeName, intervieweeRole, intervieweeBio, instagramHandle, noInstagram, website, noWeb, whatsapp, noWhatsapp, commercialPhone, noCommercialPhone, commercialAddresses, noCommercialAddress, graphicSupport, graphicLinks, noteObservations, advisorId, advisorName]);

    useEffect(() => {
        const loadData = async () => {
            try {
                const [fetchedClients, fetchedPrograms] = await Promise.all([
                    getClients(),
                    getPrograms()
                ]);

                if (userInfo) {
                    if (canReassign) {
                        setClients(fetchedClients);
                        const allUsers = await getAllUsers();
                        setUsers(allUsers);
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
    }, [userInfo, toast, canReassign]);

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

    const toggleProgram = (programId: string) => {
        setSelectedProgramIds(prev => prev.includes(programId) ? prev.filter(id => id !== programId) : [...prev, programId]);
        if (!programSchedule[programId]) setProgramSchedule(prev => ({ ...prev, [programId]: [] }));
    };

    const handleDateSelect = (programId: string, dates: Date[] | undefined) => {
        if (!dates) return;
        setProgramSchedule(prev => {
            const currentItems = prev[programId] || [];
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
            if (items[dateIndex]) items[dateIndex] = { ...items[dateIndex], time };
            return { ...prev, [programId]: items };
        });
    };

    const handleRemoveDate = (programId: string, dateIndex: number) => {
        setProgramSchedule(prev => {
            const items = [...(prev[programId] || [])];
            items.splice(dateIndex, 1);
            return { ...prev, [programId]: items };
        });
    };

    const handleClearDraft = () => {
        if (!window.confirm("¿Estás seguro de que quieres limpiar todos los datos y empezar una nueva nota?")) return;
        localStorage.removeItem('commercial_note_draft');
        setSelectedClientId('');
        setCuit('');
        setRazonSocial('');
        setRubro('');
        setSaleValue('');
        setFinancialObservations('');
        setSelectedProgramIds([]);
        setProgramSchedule({});
        setReplicateWeb(false);
        setReplicateSocials([]);
        setCollaboration(false);
        setCollaborationHandle('');
        setCtaText('');
        setCtaDestination('');
        setContactPhone('');
        setContactName('');
        setTitle('');
        setLocation(undefined);
        setCallPhone('');
        setMobileAddress('');
        setPrimaryGrafs(['']);
        setSecondaryGrafs(['']);
        setQuestions(['', '', '', '', '']);
        setTopicsToAvoid(['']);
        setIntervieweeName('');
        setIntervieweeRole('');
        setIntervieweeBio('');
        setInstagramHandle('');
        setNoInstagram(false);
        setWebsite('');
        setNoWeb(false);
        setWhatsapp('');
        setNoWhatsapp(false);
        setCommercialPhone('');
        setNoCommercialPhone(false);
        setCommercialAddresses(['']);
        setNoCommercialAddress(false);
        setGraphicSupport(false);
        setGraphicLinks(['']);
        setNoteObservations('');
        setAdvisorId(userInfo?.id || '');
        setAdvisorName(userInfo?.name || '');
        setDraftLoaded(false);
        toast({ title: "Borrador limpiado", description: "Puedes comenzar una nueva nota desde cero." });
    };
    
    const toggleSocial = (social: string) => setReplicateSocials(prev => prev.includes(social) ? prev.filter(s => s !== social) : [...prev, social]);
    const handleAddQuestion = () => setQuestions([...questions, '']);
    const handleQuestionChange = (index: number, value: string) => { const newQ = [...questions]; newQ[index] = value; setQuestions(newQ); };
    const handleRemoveQuestion = (index: number) => { const newQ = questions.filter((_, i) => i !== index); setQuestions(newQ); };
    const handleAddTopic = () => setTopicsToAvoid([...topicsToAvoid, '']);
    const handleTopicChange = (index: number, value: string) => { const newT = [...topicsToAvoid]; newT[index] = value; setTopicsToAvoid(newT); };
    const handleRemoveTopic = (index: number) => { const newT = topicsToAvoid.filter((_, i) => i !== index); setTopicsToAvoid(newT.length ? newT : ['']); };
    const handleAddAddress = () => setCommercialAddresses([...commercialAddresses, '']);
    const handleAddressChange = (index: number, value: string) => { const newAddr = [...commercialAddresses]; newAddr[index] = value; setCommercialAddresses(newAddr); };
    const handleRemoveAddress = (index: number) => { const newAddr = commercialAddresses.filter((_, i) => i !== index); setCommercialAddresses(newAddr.length ? newAddr : ['']); };

    const handleAddPrimary = () => setPrimaryGrafs([...primaryGrafs, '']);
    const handlePrimaryChange = (index: number, value: string) => { const n = [...primaryGrafs]; n[index] = value; setPrimaryGrafs(n); };
    const handleRemovePrimary = (index: number) => { const n = primaryGrafs.filter((_, i) => i !== index); setPrimaryGrafs(n.length ? n : ['']); };

    const handleAddSecondary = () => setSecondaryGrafs([...secondaryGrafs, '']);
    const handleSecondaryChange = (index: number, value: string) => { const n = [...secondaryGrafs]; n[index] = value; setSecondaryGrafs(n); };
    const handleRemoveSecondary = (index: number) => { const n = secondaryGrafs.filter((_, i) => i !== index); setSecondaryGrafs(n.length ? n : ['']); };

    const handleAddGraphicLink = () => setGraphicLinks([...graphicLinks, '']);
    const handleGraphicLinkChange = (index: number, value: string) => { const n = [...graphicLinks]; n[index] = value; setGraphicLinks(n); };
    const handleRemoveGraphicLink = (index: number) => { const n = graphicLinks.filter((_, i) => i !== index); setGraphicLinks(n.length ? n : ['']); };

    const totalValue = selectedProgramIds.reduce((acc, pid) => {
        const prog = programs.find(p => p.id === pid);
        const datesCount = programSchedule[pid]?.length || 0;
        const rate = prog?.rates?.notaComercial || 0;
        return acc + (rate * datesCount);
    }, 0);
    const saleValueNum = parseFloat(saleValue) || 0;
    const mismatch = saleValueNum > 0 ? (totalValue - saleValueNum) : 0;

    const handleSave = async () => {
        if (!selectedClientId || !userInfo) { toast({ title: 'Datos incompletos', description: 'Seleccione un cliente.', variant: 'destructive' }); return; }
        if (!title.trim()) { toast({ title: 'Falta título', variant: 'destructive' }); return; }
        if (!location) { toast({ title: 'Seleccione ubicación', variant: 'destructive' }); return; }
        if (location === 'Móvil' && !mobileAddress.trim()) { toast({ title: 'Falta dirección del móvil', variant: 'destructive' }); return; }
        
        if (primaryGrafs.filter(g => g.trim() !== '').length === 0) { toast({ title: 'Falta TITULAR.Text', variant: 'destructive' }); return; }
        if (secondaryGrafs.filter(g => g.trim() !== '').length === 0) { toast({ title: 'Falta NOMBRE/FUNCION.Text', variant: 'destructive' }); return; }
        if (hasGrafErrors) { toast({ title: 'Error en Grafs', description: 'El texto excede el límite permitido.', variant: 'destructive' }); return; }

        setSaving(true);
        try {
            const client = clients.find(c => c.id === selectedClientId);
            const updates: any = {};
            if (client) {
                if (client.cuit !== cuit) updates.cuit = cuit;
                if (client.rubro !== rubro) updates.rubro = rubro;
                if (client.razonSocial !== razonSocial) updates.razonSocial = razonSocial;
                if (Object.keys(updates).length > 0) {
                    await updateClientTangoMapping(client.id, updates, userInfo!.id, userInfo!.name);
                }
            }

             const noteDataRaw: any = {
                clientId: selectedClientId,
                clientName: client?.denominacion || 'Unknown',
                cuit,
                advisorId: advisorId || userInfo!.id,
                advisorName: advisorName || userInfo!.name,
                razonSocial,
                rubro,
                replicateWeb,
                replicateSocials,
                collaboration,
                collaborationHandle: collaboration ? collaborationHandle : undefined,
                ctaText,
                ctaDestination,
                programIds: selectedProgramIds,
                schedule: programSchedule,
                contactPhone,
                contactName,
                title,
                location,
                callPhone: location === 'Llamada' ? callPhone : undefined,
                mobileAddress: location === 'Móvil' ? mobileAddress : undefined,
                
                primaryGrafs: primaryGrafs.filter(g => g.trim()).map(g => g.toUpperCase()),
                secondaryGrafs: secondaryGrafs.filter(g => g.trim()).map(g => g.toUpperCase()),
                
                primaryGraf: primaryGrafs[0]?.toUpperCase() || '', 
                secondaryGraf: secondaryGrafs[0]?.toUpperCase() || '',

                questions: questions.filter(q => q.trim() !== ''),
                topicsToAvoid: topicsToAvoid.filter(t => t.trim() !== ''),
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
                commercialAddresses: noCommercialAddress ? [] : commercialAddresses.filter(a => a.trim() !== ''),
                noCommercialAddress,
                graphicSupport,
                graphicSupportLink: graphicSupport ? graphicLinks[0] : undefined, 
                graphicSupportLinks: graphicSupport ? graphicLinks.filter(l => l.trim() !== '') : undefined, 
                totalValue,
                saleValue: saleValueNum,
                mismatch,
                financialObservations: financialObservations || undefined,
                noteObservations: noteObservations || undefined,
            };

            const noteData = Object.keys(noteDataRaw).reduce((acc, key) => {
                const value = noteDataRaw[key];
                if (value !== undefined) (acc as any)[key] = value;
                return acc;
            }, {} as Omit<CommercialNote, 'id' | 'createdAt'>);

            let newNoteId = editModeId;

            if (editModeId) {
                await updateCommercialNote(editModeId, noteData, userInfo!.id, userInfo!.name);
            } else {
                newNoteId = await saveCommercialNote(noteData, userInfo!.id, userInfo!.name);
            }

            if (notifyOnSave && pdfRef.current && newNoteId) {
                const accessToken = await getGoogleAccessToken();
                if (accessToken) {
                    try {
                        const pdf = await generateMultiPagePdf(pdfRef.current);
                        const pdfBase64 = pdf.output('datauristring').split(',')[1];
                        const baseUrl = window.location.origin;
                        
                        // 🟢 LINK PARA EL CORREO: LLEVA A LA RUTA PÚBLICA
                        const publicLink = `${baseUrl}/public/notas/${newNoteId}`;
                        const detailLink = `${baseUrl}/notas/${newNoteId}`;
                        
                        let scheduleSummary = '';
                        Object.entries(programSchedule).forEach(([progId, items]) => {
                            const progName = programs.find(p => p.id === progId)?.name || 'Programa';
                            items.forEach(item => {
                                scheduleSummary += `<li><strong>${progName}</strong>: ${format(new Date(item.date), 'dd/MM/yyyy')} ${item.time}hs</li>`;
                            });
                        });

                        // 🟢 CORREO MODIFICADO CON BOTÓN GIGANTE
                        const emailBody = `
                            <div style="font-family: Arial, sans-serif; color: #333;">
                                <h2 style="color: #cc0000;">Nota Comercial Registrada / Editada</h2>
                                <p>El usuario <strong>${userInfo!.name}</strong> ha cargado o actualizado una nota a nombre de <strong>${advisorName}</strong>.</p>
                                <div style="background-color: #f5f5f5; padding: 15px; border-left: 4px solid #cc0000; margin: 20px 0;">
                                    <p><strong>Cliente:</strong> ${client?.denominacion || 'Desconocido'}</p>
                                    <p><strong>Título:</strong> ${title}</p>
                                    <p><strong>Cronograma:</strong></p>
                                    <ul>${scheduleSummary || '<li>Sin fecha definida</li>'}</ul>
                                </div>
                                <div style="margin-top: 20px; padding: 20px; background-color: #eff6ff; border: 1px solid #bfdbfe; border-radius: 8px; text-align: center;">
                                    <h3 style="color: #1d4ed8; margin-top: 0;">🎥 Acceso para Producción</h3>
                                    <p style="margin-bottom: 15px;">Para ver los detalles completos, copiar los Zócalos/Grafs y exportar el PDF, ingresa al siguiente enlace (no requiere contraseña):</p>
                                    <a href="${publicLink}" style="display: inline-block; padding: 12px 24px; background-color: #1d4ed8; color: #ffffff; text-decoration: none; border-radius: 5px; font-weight: bold; font-size: 16px;">ABRIR DETALLE DE LA NOTA</a>
                                </div>
                                <p style="margin-top: 30px; font-size: 12px; color: #666;">Enlace interno administrativo: <a href="${detailLink}">${detailLink}</a></p>
                            </div>
                        `;

                        await sendEmail({
                            accessToken,
                            to: ['lchena@airedesantafe.com.ar', 'alucca@airedesantafe.com.ar', 'materiales@airedesantafe.com.ar', userInfo.email], 
                            subject: `Nota Comercial: ${title} - ${client?.denominacion}`,
                            body: emailBody,
                            attachments: [{
                                filename: `Nota_${title.replace(/ /g, "_")}.pdf`,
                                content: pdfBase64,
                                encoding: 'base64'
                            }]
                        });
                        toast({ title: 'Nota guardada y notificada a Producción.' });
                    } catch (emailError) {
                        console.error("Error sending email", emailError);
                        toast({ title: 'Nota guardada, pero falló el envío del correo.', variant: 'default' });
                    }
                }
            } else {
                toast({ title: 'Nota guardada correctamente.' });
            }
            
            localStorage.removeItem('commercial_note_draft');
            router.push('/notas');

        } catch (error) {
            console.error(error);
            toast({ title: 'Error al guardar', variant: 'destructive' });
        } finally {
            setSaving(false);
        }
    }; 

    if (loading) return <div className="flex h-full items-center justify-center"><Spinner size="large" /></div>;

    const ActionButtons = () => (
        <div className="flex flex-wrap items-center justify-between w-full gap-4">
            <div className="flex items-center gap-4">
                 <Button variant="ghost" onClick={() => router.back()}>
                    <ArrowLeft className="mr-2 h-4 w-4" /> Volver
                </Button>
                
                {draftLoaded && !editModeId && (
                    <Button variant="outline" className="text-red-500 border-red-200 hover:bg-red-50" onClick={handleClearDraft}>
                        Limpiar Borrador
                    </Button>
                )}
            </div>
            
            <div className="flex flex-wrap items-center gap-4">
                <Button variant="outline" onClick={handleDownloadPdf} disabled={!selectedClientId || !title || hasGrafErrors}>
                    <ExternalLink className="mr-2 h-4 w-4" /> Exportar PDF
                </Button>
                <div className="flex items-center space-x-2 border rounded-md px-3 py-2 bg-white">
                    <Switch id="notify" checked={notifyOnSave} onCheckedChange={setNotifyOnSave} />
                    <Label htmlFor="notify" className="cursor-pointer text-sm">Notificar por email</Label>
                </div>
                <Button onClick={handleSave} disabled={saving || hasGrafErrors}>
                    {saving ? <Spinner size="small" /> : <Save className="mr-2 h-4 w-4" />} Guardar
                </Button>
            </div>
        </div>
    );

    return (
        <div className="flex flex-col h-full overflow-hidden bg-gray-50/50">
            <Header title={editModeId ? "Editar Nota Comercial" : "Nueva Nota Comercial"}>
                <div className="w-full"></div>
            </Header>
            <main className="flex-1 overflow-auto p-4 md:p-6 space-y-6">
                
                <div className="bg-white p-4 border rounded-md shadow-sm">
                    <ActionButtons />
                </div>

                <Card>
                    <CardHeader><CardTitle>Datos de Cliente</CardTitle></CardHeader>
                    <CardContent className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
                        <div className="space-y-2">
                            <Label>Cliente <span className="text-red-500">*</span></Label>
                            <Select value={selectedClientId} onValueChange={handleClientSelect}>
                                <SelectTrigger><SelectValue placeholder="Seleccionar..." /></SelectTrigger>
                                <SelectContent>{clients.map(c => <SelectItem key={c.id} value={c.id}>{c.denominacion}</SelectItem>)}</SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-2"><Label>CUIT</Label><Input value={cuit} onChange={e => setCuit(e.target.value)} /></div>
                        <div className="space-y-2"><Label>Razón Social</Label><Input value={razonSocial} onChange={e => setRazonSocial(e.target.value)} /></div>
                        <div className="space-y-2"><Label>Rubro</Label><Input value={rubro} onChange={e => setRubro(e.target.value)} /></div>
                        
                        <div className="space-y-2">
                            <Label>Asesor / Ejecutivo</Label>
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
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader><CardTitle>Comercial</CardTitle></CardHeader>
                    <CardContent className="grid gap-6 md:grid-cols-2">
                        <div className="space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2"><Label>Valor Total</Label><Input value={`$ ${totalValue.toLocaleString()}`} disabled className="bg-muted" /></div>
                                <div className="space-y-2"><Label>Valor Venta</Label><Input type="number" value={saleValue} onChange={e => setSaleValue(e.target.value)} /></div>
                            </div>
                            {mismatch !== 0 && <div className="p-3 bg-yellow-50 text-sm border-yellow-200">Desajuste: ${mismatch.toLocaleString()}</div>}
                        </div>
                        <div className="space-y-2"><Label>Obs. Comerciales</Label><Textarea value={financialObservations} onChange={e => setFinancialObservations(e.target.value)} className="min-h-[100px]"/></div>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader><CardTitle>Producción / Pautado</CardTitle></CardHeader>
                    <CardContent className="space-y-6">
                        <div className="space-y-4 border p-4 rounded-md">
                            <Label>Programación</Label>
                            <div className="flex flex-wrap gap-2">
                                {programs.map(p => (
                                    <div key={p.id} className="flex items-center space-x-2 border p-2 rounded-md hover:bg-muted/50 cursor-pointer" onClick={() => toggleProgram(p.id)}>
                                        <Checkbox checked={selectedProgramIds.includes(p.id)} onCheckedChange={() => toggleProgram(p.id)} /><span>{p.name}</span>
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
                                                <div className="flex justify-between items-center"><span className="font-medium">{prog?.name}</span><Popover><PopoverTrigger asChild><Button variant="outline" size="sm"><CalendarIcon className="mr-2 h-4 w-4"/>Fechas</Button></PopoverTrigger><PopoverContent className="w-auto p-0"><Calendar mode="multiple" selected={items.map(i => new Date(i.date))} onSelect={(d) => handleDateSelect(pid, d)} initialFocus locale={es}/></PopoverContent></Popover></div>
                                                
                                                {items.length > 0 && (
                                                    <div className="max-h-40 overflow-y-auto space-y-2">
                                                        {items.map((it, idx) => (
                                                            <div key={it.date} className="flex gap-2 text-sm items-center">
                                                                <span className="w-24">{format(new Date(it.date), 'dd/MM/yyyy')}</span>
                                                                <Input type="time" className="h-8" value={it.time||''} onChange={(e) => handleTimeChange(pid, idx, e.target.value)} />
                                                                <Button type="button" size="icon" variant="ghost" className="h-8 w-8 text-red-500 hover:text-red-700 hover:bg-red-50" onClick={() => handleRemoveDate(pid, idx)}>
                                                                    <Trash2 className="h-4 w-4"/>
                                                                </Button>
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
                                <div className="flex items-center space-x-2"><Switch checked={replicateWeb} onCheckedChange={setReplicateWeb} /><Label>Replica Nota Web</Label></div>
                                <div className="space-y-2 border p-3 rounded-md">
                                    <Label>Redes Sociales</Label>
                                    <div className="flex gap-4 mt-2">{['Facebook', 'Instagram', 'X'].map(s => (<div key={s} className="flex items-center space-x-2"><Checkbox checked={replicateSocials.includes(s)} onCheckedChange={() => toggleSocial(s)} /><span>{s}</span></div>))}</div>
                                    {replicateSocials.length > 0 && (
                                        <div className="mt-4 pt-4 border-t space-y-3">
                                            <div className="flex items-center space-x-2"><Checkbox checked={collaboration} onCheckedChange={(c) => setCollaboration(!!c)} /><Label>¿Colaboración?</Label></div>
                                            {collaboration && <Input placeholder="@usuario" value={collaborationHandle} onChange={e => setCollaborationHandle(e.target.value)} />}
                                            <div className="grid grid-cols-2 gap-2"><div><Label className="text-xs">Texto CTA</Label><Input value={ctaText} onChange={e => setCtaText(e.target.value)} /></div><div><Label className="text-xs">Destino CTA</Label><Input value={ctaDestination} onChange={e => setCtaDestination(e.target.value)} /></div></div>
                                        </div>
                                    )}
                                </div>
                            </div>
                            <div className="space-y-4"><div className="space-y-2"><Label>Tel. Coordinar</Label><Input value={contactPhone} onChange={e => setContactPhone(e.target.value)} /></div><div className="space-y-2"><Label>Resp. Coordinación</Label><Input value={contactName} onChange={e => setContactName(e.target.value)} /></div></div>
                        </div>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader><CardTitle>Nota</CardTitle></CardHeader>
                    <CardContent className="space-y-6">
                        <div className="grid gap-4 md:grid-cols-2">
                            <div className="space-y-2"><Label>Título</Label><Input value={title} onChange={e => setTitle(e.target.value)} /></div>
                            <div className="space-y-3"><Label>Ubicación</Label><RadioGroup value={location} onValueChange={(v:any) => setLocation(v)} className="flex flex-wrap gap-4"><div className="flex items-center space-x-2"><RadioGroupItem value="Estudio" id="re" /><Label htmlFor="re">Estudio</Label></div><div className="flex items-center space-x-2"><RadioGroupItem value="Móvil" id="rm" /><Label htmlFor="rm">Móvil</Label></div><div className="flex items-center space-x-2"><RadioGroupItem value="Meet" id="mt" /><Label htmlFor="mt">Meet</Label></div><div className="flex items-center space-x-2"><RadioGroupItem value="Llamada" id="rl" /><Label htmlFor="rl">Llamada</Label></div></RadioGroup>{location === 'Llamada' && <Input className="mt-2" value={callPhone} onChange={e => setCallPhone(e.target.value)} placeholder="Teléfono..." />}{location === 'Móvil' && <Input className="mt-2" value={mobileAddress} onChange={e => setMobileAddress(e.target.value)} placeholder="Dirección del móvil..." />}</div>
                        </div>

                        <div className="grid gap-4 md:grid-cols-2">
                            <div className="space-y-2 border p-3 rounded-md">
                                <div className="flex justify-between mb-2"><Label className={primaryGrafError ? "text-destructive" : ""}>TITULAR.Text (Max 84) - Principal</Label><Button type="button" size="icon" variant="ghost" className="h-6 w-6" onClick={handleAddPrimary}><Plus className="h-4 w-4"/></Button></div>
                                {primaryGrafs.map((g, idx) => (
                                    <div key={idx} className="space-y-1 mb-2">
                                        <div className="flex gap-2">
                                            <Input value={g} onChange={e => handlePrimaryChange(idx, e.target.value)} className={g.length > 84 ? "border-destructive" : ""} placeholder={`Titular ${idx+1}`} />
                                            {primaryGrafs.length > 1 && <Button type="button" size="icon" variant="ghost" onClick={() => handleRemovePrimary(idx)}><Trash2 className="h-4 w-4"/></Button>}
                                        </div>
                                        {g.length > 84 && <span className="text-xs text-destructive">{g.length}/84 caracteres</span>}
                                    </div>
                                ))}
                            </div>
                            
                            <div className="space-y-2 border p-3 rounded-md">
                                <div className="flex justify-between mb-2"><Label className={secondaryGrafError ? "text-destructive" : ""}>NOMBRE/FUNCION.Text (Max 55) - Secundario</Label><Button type="button" size="icon" variant="ghost" className="h-6 w-6" onClick={handleAddSecondary}><Plus className="h-4 w-4"/></Button></div>
                                {secondaryGrafs.map((g, idx) => (
                                    <div key={idx} className="space-y-1 mb-2">
                                        <div className="flex gap-2">
                                            <Input value={g} onChange={e => handleSecondaryChange(idx, e.target.value)} className={g.length > 55 ? "border-destructive" : ""} placeholder={`Nombre/Función ${idx+1}`} />
                                            {secondaryGrafs.length > 1 && <Button type="button" size="icon" variant="ghost" onClick={() => handleRemoveSecondary(idx)}><Trash2 className="h-4 w-4"/></Button>}
                                        </div>
                                        {g.length > 55 && <span className="text-xs text-destructive">{g.length}/55 caracteres</span>}
                                    </div>
                                ))}
                            </div>
                        </div>

                        <div className="grid md:grid-cols-2 gap-6">
                            <div className="space-y-3 border p-4 rounded-md"><div className="flex justify-between"><Label>Preguntas (min 5)</Label><Button type="button" variant="ghost" size="sm" onClick={handleAddQuestion}><Plus className="h-4 w-4"/></Button></div>{questions.map((q, idx) => (<div key={idx} className="flex gap-2"><Input value={q} onChange={e => handleQuestionChange(idx, e.target.value)} placeholder={`P ${idx+1}`} />{questions.length > 5 && <Button type="button" size="icon" variant="ghost" onClick={() => handleRemoveQuestion(idx)}><Trash2 className="h-4 w-4"/></Button>}</div>))}</div>
                            <div className="space-y-3 border p-4 rounded-md bg-red-50/50"><div className="flex justify-between"><Label>Temas a EVITAR</Label><Button type="button" variant="ghost" size="sm" onClick={handleAddTopic}><Plus className="h-4 w-4"/></Button></div>{topicsToAvoid.map((t, idx) => (<div key={idx} className="flex gap-2"><Input value={t} onChange={e => handleTopicChange(idx, e.target.value)} placeholder={`Tema ${idx+1}`} />{topicsToAvoid.length > 1 && <Button type="button" size="icon" variant="ghost" onClick={() => handleRemoveTopic(idx)}><Trash2 className="h-4 w-4"/></Button>}</div>))}</div>
                        </div>

                        <div className="grid gap-4 md:grid-cols-2">
                            <div className="space-y-2"><Label>Nombre Entrevistado</Label><Input value={intervieweeName} onChange={e => setIntervieweeName(e.target.value)} /></div>
                            <div className="space-y-2"><Label>Cargo/Título</Label><Input value={intervieweeRole} onChange={e => setIntervieweeRole(e.target.value)} /></div>
                            <div className="md:col-span-2 space-y-2"><Label>Bio</Label><Textarea value={intervieweeBio} onChange={e => setIntervieweeBio(e.target.value)} className="min-h-[80px]" /></div>
                        </div>

                         <div className="grid gap-4 md:grid-cols-2">
                            <div className="space-y-2">
                                <div className="flex justify-between"><Label className={noInstagram ? "text-muted-foreground" : ""}>Instagram</Label><div className="flex items-center space-x-2"><Checkbox checked={noInstagram} onCheckedChange={(c) => setNoInstagram(!!c)} /><Label className="text-xs">No informar</Label></div></div>
                                <div className="flex gap-2"><Input value={instagramHandle} onChange={e => setInstagramHandle(e.target.value)} disabled={noInstagram} /> {instagramHandle && (
                                        <Button type="button" size="icon" variant="ghost" onClick={() => window.open(`https://instagram.com/${instagramHandle.replace('@', '').replace('https://instagram.com/', '')}`, '_blank')}>
                                            <ExternalLink className="h-4 w-4" />
                                        </Button>)}
                                </div>
                            </div>
                            <div className="space-y-2">
                                <div className="flex justify-between"><Label className={noWeb ? "text-muted-foreground" : ""}>Web</Label><div className="flex items-center space-x-2"><Checkbox checked={noWeb} onCheckedChange={(c) => setNoWeb(!!c)} /><Label className="text-xs">No informar</Label></div></div>
                                <div className="flex gap-2"><Input value={website} onChange={e => setWebsite(e.target.value)} disabled={noWeb} />{website && !noWeb && <Button type="button" size="icon" variant="ghost" onClick={() => window.open(website.startsWith('http') ? website : `https://${website}`, '_blank')}><ExternalLink className="h-4 w-4" /></Button>}</div>
                            </div>
                            <div className="space-y-2">
                                <div className="flex justify-between"><Label className={noWhatsapp ? "text-muted-foreground" : ""}>Whatsapp</Label><div className="flex items-center space-x-2"><Checkbox checked={noWhatsapp} onCheckedChange={(c) => setNoWhatsapp(!!c)} /><Label className="text-xs">No informar</Label></div></div>
                                <div className="flex gap-2"><Input value={whatsapp} onChange={e => setWhatsapp(e.target.value)} disabled={noWhatsapp} /></div>
                            </div>
                            <div className="space-y-2">
                                <div className="flex justify-between"><Label className={noCommercialPhone ? "text-muted-foreground" : ""}>Teléfono Comercial</Label><div className="flex items-center space-x-2"><Checkbox checked={noCommercialPhone} onCheckedChange={(c) => setNoCommercialPhone(!!c)} /><Label className="text-xs">No informar</Label></div></div>
                                <div className="flex gap-2"><Input value={commercialPhone} onChange={e => setCommercialPhone(e.target.value)} disabled={noCommercialPhone} /></div>
                            </div>
                            <div className="space-y-2 md:col-span-2 border-t pt-4">
                                <div className="flex justify-between mb-2"><Label className={noCommercialAddress ? "text-muted-foreground" : ""}>Domicilio Comercial</Label><div className="flex items-center space-x-2"><Checkbox checked={noCommercialAddress} onCheckedChange={(c) => setNoCommercialAddress(!!c)} /><Label className="text-xs">No informar</Label></div></div>
                                {!noCommercialAddress && commercialAddresses.map((addr, idx) => (
                                    <div key={idx} className="flex gap-2 mb-2"><Input value={addr} onChange={e => handleAddressChange(idx, e.target.value)} placeholder="Dirección..." /><div className="flex">{commercialAddresses.length > 1 && <Button type="button" size="icon" variant="ghost" onClick={() => handleRemoveAddress(idx)}><Minus className="h-4 w-4" /></Button>}{idx === commercialAddresses.length - 1 && <Button type="button" size="icon" variant="outline" onClick={handleAddAddress}><Plus className="h-4 w-4" /></Button>}</div></div>
                                ))}
                            </div>
                        </div>

                        <div className="space-y-4 border-t pt-4">
                             <div className="flex items-center space-x-2"><Switch checked={graphicSupport} onCheckedChange={setGraphicSupport} /><Label>Agrega Soporte Gráfico</Label></div>
                             
                             {graphicSupport && (
                                 <div className="space-y-2 border p-3 rounded-md bg-slate-50">
                                     <div className="flex justify-between mb-2">
                                         <Label>Links al material (Drive/URL)</Label>
                                         <Button type="button" size="icon" variant="ghost" className="h-6 w-6" onClick={handleAddGraphicLink}>
                                             <Plus className="h-4 w-4"/>
                                         </Button>
                                     </div>
                                     {graphicLinks.map((link, idx) => (
                                         <div key={idx} className="flex gap-2">
                                             <Input value={link} onChange={e => handleGraphicLinkChange(idx, e.target.value)} placeholder="https://..." />
                                             {graphicLinks.length > 1 && (
                                                 <Button type="button" size="icon" variant="ghost" onClick={() => handleRemoveGraphicLink(idx)}>
                                                     <Trash2 className="h-4 w-4"/>
                                                 </Button>
                                             )}
                                         </div>
                                     ))}
                                 </div>
                             )}

                             <div className="space-y-2"><Label>Observaciones Generales</Label><Textarea value={noteObservations} onChange={e => setNoteObservations(e.target.value)} /></div>
                        </div>
                    </CardContent>
                </Card>
                
                <div className="bg-white p-4 border rounded-md shadow-sm mt-6">
                    <ActionButtons />
                </div>
            </main>

            <div style={{ position: 'absolute', top: -9999, left: -9999 }}>
                <NotePdf
                    ref={pdfRef}
                    programs={programs}
                    note={{
                        clientName: clients.find(c => c.id === selectedClientId)?.denominacion,
                        cuit, 
                        advisorName: advisorName || userInfo?.name, 
                        razonSocial, rubro, replicateWeb, replicateSocials, collaboration, collaborationHandle, ctaText, ctaDestination, schedule: programSchedule, contactPhone, contactName, title, location, callPhone: location === 'Llamada' ? callPhone : undefined, mobileAddress: location === 'Móvil' ? mobileAddress : undefined,
                        primaryGrafs: primaryGrafs.filter(g => g.trim()).map(g => g.toUpperCase()),
                        secondaryGrafs: secondaryGrafs.filter(g => g.trim()).map(g => g.toUpperCase()),
                        primaryGraf: primaryGrafs[0]?.toUpperCase() || '', 
                        secondaryGraf: secondaryGrafs[0]?.toUpperCase() || '',
                        questions: questions.filter(q => q.trim()), topicsToAvoid: topicsToAvoid.filter(t => t.trim()), intervieweeName, intervieweeRole, intervieweeBio, instagram: instagramHandle, website, whatsapp, phone: commercialPhone, noWeb, noWhatsapp, noCommercialPhone, commercialAddresses: noCommercialAddress ? [] : commercialAddresses.filter(a => a.trim()), noCommercialAddress, graphicSupport, 
                        graphicSupportLinks: graphicSupport ? graphicLinks.filter(l => l.trim() !== '') : undefined,
                        noteObservations
                    }}
                />
            </div>
        </div>
    );
}
