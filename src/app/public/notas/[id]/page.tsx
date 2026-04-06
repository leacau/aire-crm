'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useParams } from 'next/navigation';
import { getCommercialNote, getPrograms } from '@/lib/firebase-service';
import type { CommercialNote, Program } from '@/lib/types';
import { Spinner } from '@/components/ui/spinner';
import { Button } from '@/components/ui/button';
import { FileDown, Copy, Check, ExternalLink } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { useToast } from '@/hooks/use-toast';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';

// Reutilizamos el componente NotePdf para la exportación a PDF
import { NotePdf } from '@/components/notas/note-pdf';

export default function PublicNoteView() {
    const { id } = useParams();
    const { toast } = useToast();
    const pdfRef = useRef<HTMLDivElement>(null);
    
    const [note, setNote] = useState<CommercialNote | null>(null);
    const [programs, setPrograms] = useState<Program[]>([]);
    const [loading, setLoading] = useState(true);
    const [copiedIndex, setCopiedIndex] = useState<string | null>(null);

    useEffect(() => {
        if (typeof id === 'string') {
            Promise.all([
                getCommercialNote(id),
                getPrograms()
            ]).then(([noteData, programsData]) => {
                setNote(noteData);
                setPrograms(programsData);
                setLoading(false);
            });
        }
    }, [id]);

    const handleCopy = (text: string, indexId: string) => {
        navigator.clipboard.writeText(text);
        setCopiedIndex(indexId);
        toast({ title: "Copiado al portapapeles", duration: 2000 });
        setTimeout(() => setCopiedIndex(null), 2000);
    };

    const handleDownloadPdf = async () => {
        if (!pdfRef.current || !note) return;
        try {
            const page1 = pdfRef.current.querySelector('#note-pdf-page-1') as HTMLElement;
            const page2 = pdfRef.current.querySelector('#note-pdf-page-2') as HTMLElement;
            if (!page1 || !page2) throw new Error("No se encontraron las páginas del PDF");

            const pdf = new jsPDF('p', 'mm', 'a4');
            const pdfWidth = pdf.internal.pageSize.getWidth();
            const pdfHeight = pdf.internal.pageSize.getHeight();

            const processPage = async (pageElement: HTMLElement, pageNum: number) => {
                const canvas = await html2canvas(pageElement, { scale: 2, useCORS: true });
                const imgData = canvas.toDataURL('image/jpeg', 0.8);
                if (pageNum > 1) pdf.addPage();
                pdf.addImage(imgData, 'JPEG', 0, 0, pdfWidth, pdfHeight);
            };

            await processPage(page1, 1);
            await processPage(page2, 2);
            pdf.save(`Nota_${note.title?.replace(/ /g, "_")}.pdf`);
        } catch (error) {
            console.error(error);
            toast({ title: "Error al generar PDF", variant: "destructive" });
        }
    };

    if (loading) return <div className="flex h-screen items-center justify-center"><Spinner size="large" /></div>;
    if (!note) return <div className="flex h-screen items-center justify-center font-bold text-xl text-gray-500">Nota no encontrada o eliminada.</div>;

    const pGrafs = note.primaryGrafs && note.primaryGrafs.length > 0 ? note.primaryGrafs : (note.primaryGraf ? [note.primaryGraf] : []);
    const sGrafs = note.secondaryGrafs && note.secondaryGrafs.length > 0 ? note.secondaryGrafs : (note.secondaryGraf ? [note.secondaryGraf] : []);

    // 🟢 Componente reutilizable para campos copiables
    const CopyableField = ({ label, value, id, fullWidth = false }: { label: string, value?: string | null, id: string, fullWidth?: boolean }) => {
        if (!value) return null;
        return (
            <div 
                className={`p-3 bg-gray-50 rounded-md border border-gray-200 cursor-pointer hover:bg-blue-50 hover:border-blue-200 transition-colors flex justify-between items-start group ${fullWidth ? 'col-span-1 md:col-span-2' : ''}`} 
                onClick={() => handleCopy(value, id)}
            >
                <div className="pr-4">
                    <span className="text-xs text-gray-500 block uppercase font-bold mb-1">{label}</span>
                    <span className="text-sm font-medium whitespace-pre-wrap break-words block text-slate-800">{value}</span>
                </div>
                <Button variant="ghost" size="icon" className="shrink-0 h-8 w-8 text-gray-400 group-hover:text-blue-600 group-hover:bg-white shadow-sm transition-all opacity-50 group-hover:opacity-100">
                    {copiedIndex === id ? <Check className="w-4 h-4 text-green-600" /> : <Copy className="w-4 h-4" />}
                </Button>
            </div>
        );
    };

    // Construir string de cronograma para poder copiarlo completo
    let scheduleString = '';
    Object.entries(note.schedule || {}).forEach(([progId, items]) => {
        const progName = programs.find(p => p.id === progId)?.name || 'Programa';
        const typedItems = Array.isArray(items) ? items : [];
        if (typedItems.length > 0) {
            scheduleString += `${progName}:\n`;
            typedItems.forEach(i => {
                scheduleString += `- ${format(new Date(i.date), 'dd/MM/yyyy')} a las ${i.time ? i.time : '??:??'}hs\n`;
            });
            scheduleString += '\n';
        }
    });

    return (
        <div className="min-h-screen bg-slate-100 flex flex-col font-sans">
            <header className="bg-red-600 text-white p-4 shadow-md sticky top-0 z-10 flex justify-between items-center">
                <div>
                    <h1 className="font-bold text-lg md:text-xl">NOTA PARA PRODUCCIÓN</h1>
                    <p className="text-xs text-red-100">{note.clientName} - {note.title}</p>
                </div>
                <Button variant="secondary" onClick={handleDownloadPdf} className="shrink-0 shadow-sm">
                    <FileDown className="h-4 w-4 md:mr-2" />
                    <span className="hidden md:inline">Descargar PDF</span>
                </Button>
            </header>

            <main className="flex-1 p-4 md:p-8 max-w-4xl mx-auto w-full space-y-6">
                
                {/* 1. DETALLES DE LA NOTA & ZÓCALOS */}
                <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200 space-y-4">
                    <h2 className="text-xl font-bold text-slate-800 border-b pb-2 mb-4">1. Detalles de la Nota y Zócalos</h2>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <CopyableField label="Título" value={note.title} id="title" fullWidth />
                        <CopyableField label="Ubicación" value={note.location} id="location" />
                        {note.location === 'Llamada' && <CopyableField label="Teléfono Llamada" value={note.callPhone} id="callPhone" />}
                        {note.location === 'Móvil' && <CopyableField label="Dirección Móvil" value={note.mobileAddress} id="mobileAddress" />}
                    </div>

                    <div className="pt-4 space-y-3 border-t mt-4">
                        {pGrafs.map((g, i) => (
                            <div key={`p-${i}`} className="p-4 border-2 border-blue-100 rounded-md bg-blue-50/50 hover:bg-blue-50 transition-colors flex justify-between items-center group cursor-pointer" onClick={() => handleCopy(g, `p-${i}`)}>
                                <div>
                                    <p className="text-xs font-bold text-blue-600 uppercase mb-1">TITULAR.Text (Max 84)</p>
                                    <p className="text-lg font-bold text-slate-800 uppercase">{g}</p>
                                </div>
                                <Button variant="ghost" size="icon" className="text-blue-600 bg-white border shadow-sm shrink-0 hover:bg-blue-100">
                                    {copiedIndex === `p-${i}` ? <Check className="w-5 h-5 text-green-600" /> : <Copy className="w-5 h-5" />}
                                </Button>
                            </div>
                        ))}

                        {sGrafs.map((g, i) => (
                            <div key={`s-${i}`} className="p-4 border-2 border-green-100 rounded-md bg-green-50/50 hover:bg-green-50 transition-colors flex justify-between items-center group cursor-pointer" onClick={() => handleCopy(g, `s-${i}`)}>
                                <div>
                                    <p className="text-xs font-bold text-green-600 uppercase mb-1">NOMBRE/FUNCION.Text (Max 55)</p>
                                    <p className="text-lg font-bold text-slate-800 uppercase">{g}</p>
                                </div>
                                <Button variant="ghost" size="icon" className="text-green-600 bg-white border shadow-sm shrink-0 hover:bg-green-100">
                                    {copiedIndex === `s-${i}` ? <Check className="w-5 h-5 text-green-600" /> : <Copy className="w-5 h-5" />}
                                </Button>
                            </div>
                        ))}
                    </div>

                    {note.graphicSupport && (
                        <div className="mt-4 p-4 bg-yellow-50 border border-yellow-300 rounded-md">
                            <p className="text-yellow-900 font-bold text-center mb-3">⚠️ REQUIERE SOPORTE GRÁFICO</p>
                            <div className="flex flex-col gap-2">
                                {note.graphicSupportLinks && note.graphicSupportLinks.length > 0 ? (
                                    note.graphicSupportLinks.map((link, idx) => (
                                        <div key={idx} className="flex gap-2">
                                            <a href={link.startsWith('http') ? link : `https://${link}`} target="_blank" rel="noopener noreferrer" className="flex-1 bg-white p-3 border border-yellow-300 rounded font-bold text-blue-700 text-center shadow-sm hover:shadow transition-shadow">
                                                👉 ABRIR ENLACE DE MATERIAL {idx + 1} 👈
                                            </a>
                                            <Button variant="outline" className="h-auto bg-white" onClick={() => handleCopy(link, `link-${idx}`)} title="Copiar link">
                                                {copiedIndex === `link-${idx}` ? <Check className="w-5 h-5 text-green-600" /> : <Copy className="w-5 h-5" />}
                                            </Button>
                                        </div>
                                    ))
                                ) : note.graphicSupportLink ? (
                                    <div className="flex gap-2">
                                        <a href={note.graphicSupportLink.startsWith('http') ? note.graphicSupportLink : `https://${note.graphicSupportLink}`} target="_blank" rel="noopener noreferrer" className="flex-1 bg-white p-3 border border-yellow-300 rounded font-bold text-blue-700 text-center shadow-sm hover:shadow transition-shadow">
                                            👉 ABRIR ENLACE DE MATERIAL 👈
                                        </a>
                                        <Button variant="outline" className="h-auto bg-white" onClick={() => handleCopy(note.graphicSupportLink || '', 'link-0')} title="Copiar link">
                                            {copiedIndex === 'link-0' ? <Check className="w-5 h-5 text-green-600" /> : <Copy className="w-5 h-5" />}
                                        </Button>
                                    </div>
                                ) : null}
                            </div>
                        </div>
                    )}
                </div>

                {/* 2. DATOS DEL CLIENTE */}
                <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
                    <h2 className="text-xl font-bold text-slate-800 border-b pb-2 mb-4">2. Datos del Cliente</h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <CopyableField label="Cliente" value={note.clientName} id="clientName" />
                        <CopyableField label="Razón Social" value={note.razonSocial} id="razonSocial" />
                        <CopyableField label="CUIT" value={note.cuit} id="cuit" />
                        <CopyableField label="Rubro" value={note.rubro} id="rubro" />
                    </div>
                </div>

                {/* 3. PRODUCCIÓN Y PAUTADO */}
                <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
                    <h2 className="text-xl font-bold text-slate-800 border-b pb-2 mb-4">3. Producción y Pautado</h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
                        <CopyableField label="Coordinación (Cliente)" value={note.contactName} id="contactName" />
                        <CopyableField label="Teléfono Coord." value={note.contactPhone} id="contactPhone" />
                    </div>

                    {scheduleString && (
                        <div className="mb-4">
                            <CopyableField label="Cronograma / Salidas" value={scheduleString.trim()} id="schedule" fullWidth />
                        </div>
                    )}

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 border-t pt-4 mt-2">
                        <CopyableField label="Replica Web" value={note.replicateWeb ? 'SÍ' : 'NO'} id="repWeb" />
                        <CopyableField label="Replica Redes" value={note.replicateSocials && note.replicateSocials.length > 0 ? note.replicateSocials.join(', ') : 'Ninguna'} id="repSocials" />
                    </div>

                    {note.replicateSocials && note.replicateSocials.length > 0 && (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3">
                            <CopyableField label="Colaboración" value={note.collaboration ? `SÍ (${note.collaborationHandle})` : 'NO'} id="collab" />
                            <CopyableField label="Call To Action (CTA)" value={`${note.ctaText || '-'} -> ${note.ctaDestination || '-'}`} id="cta" />
                        </div>
                    )}
                </div>

                {/* 4. ENTREVISTADO */}
                <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
                    <h2 className="text-xl font-bold text-slate-800 border-b pb-2 mb-4">4. Entrevistado</h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <CopyableField label="Nombre" value={note.intervieweeName} id="intervieweeName" />
                        <CopyableField label="Cargo" value={note.intervieweeRole} id="intervieweeRole" />
                        {note.intervieweeBio && (
                            <CopyableField label="Bio / Info Adicional" value={note.intervieweeBio} id="intervieweeBio" fullWidth />
                        )}
                    </div>
                </div>

                {/* 5. CANALES DE CONTACTO */}
                <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
                    <h2 className="text-xl font-bold text-slate-800 border-b pb-2 mb-4">5. Canales de Contacto (A mostrar)</h2>
                    
                    {(note.noWeb && note.noWhatsapp && note.noCommercialPhone && !note.instagram && note.noCommercialAddress) ? (
                        <p className="text-sm text-gray-500 italic">No se mostrarán canales de contacto.</p>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            {!note.noWeb && note.website && <CopyableField label="Web" value={note.website} id="website" />}
                            {!note.noWhatsapp && note.whatsapp && <CopyableField label="WhatsApp" value={note.whatsapp} id="whatsapp" />}
                            {!note.noCommercialPhone && note.phone && <CopyableField label="Tel. Comercial" value={note.phone} id="commPhone" />}
                            {note.instagram && <CopyableField label="Instagram" value={note.instagram} id="instagram" />}
                            
                            {!note.noCommercialAddress && note.commercialAddresses && note.commercialAddresses.length > 0 && (
                                <CopyableField 
                                    label="Domicilio(s) Comercial(es)" 
                                    value={note.commercialAddresses.join('\n')} 
                                    id="commAddress" 
                                    fullWidth 
                                />
                            )}
                        </div>
                    )}
                </div>

                {/* 6. CONTENIDO */}
                <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
                    <h2 className="text-xl font-bold text-slate-800 border-b pb-2 mb-4">6. Contenido</h2>
                    
                    <div className="mb-6">
                        <span className="font-bold text-sm block mb-3 text-slate-700">Preguntas Sugeridas:</span>
                        <ul className="space-y-2">
                            {note.questions?.map((q, i) => (
                                <li key={i} className="p-3 bg-gray-50 border rounded-md hover:bg-blue-50 hover:border-blue-200 cursor-pointer flex justify-between items-center group transition-colors" onClick={() => handleCopy(q, `q-${i}`)}>
                                    <span className="text-sm text-slate-800">{i + 1}. {q}</span>
                                    <Button variant="ghost" size="icon" className="shrink-0 h-8 w-8 text-gray-400 group-hover:text-blue-600 group-hover:bg-white shadow-sm opacity-50 group-hover:opacity-100">
                                        {copiedIndex === `q-${i}` ? <Check className="w-4 h-4 text-green-600" /> : <Copy className="w-4 h-4" />}
                                    </Button>
                                </li>
                            ))}
                        </ul>
                    </div>

                    {note.topicsToAvoid && note.topicsToAvoid.length > 0 && (
                        <div className="p-4 bg-red-50 border border-red-200 rounded-md">
                            <h3 className="font-bold text-red-800 mb-3">⚠️ TEMAS A EVITAR:</h3>
                            <ul className="space-y-2">
                                {note.topicsToAvoid.map((t, i) => (
                                    <li key={i} className="p-3 bg-white border border-red-100 rounded-md hover:bg-red-100 cursor-pointer flex justify-between items-center group transition-colors" onClick={() => handleCopy(t, `t-${i}`)}>
                                        <span className="text-sm text-red-900">{t}</span>
                                        <Button variant="ghost" size="icon" className="shrink-0 h-8 w-8 text-red-400 group-hover:text-red-700 group-hover:bg-white shadow-sm opacity-50 group-hover:opacity-100">
                                            {copiedIndex === `t-${i}` ? <Check className="w-4 h-4 text-green-600" /> : <Copy className="w-4 h-4" />}
                                        </Button>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}
                </div>

                {/* 7. OBSERVACIONES GENERALES */}
                <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
                    <h2 className="text-xl font-bold text-slate-800 border-b pb-2 mb-4">7. Observaciones Generales</h2>
                    <CopyableField 
                        label="Observaciones" 
                        value={note.noteObservations || 'Sin observaciones adicionales.'} 
                        id="obs" 
                        fullWidth 
                    />
                </div>

            </main>

            {/* CONTENEDOR OCULTO PARA EXPORTAR EL PDF CON EL FORMATO OFICIAL */}
            <div style={{ position: 'fixed', top: '-10000px', left: '-10000px', zIndex: -1 }}>
                <NotePdf ref={pdfRef} programs={programs} note={note} />
            </div>
        </div>
    );
}
