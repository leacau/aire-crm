'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useParams } from 'next/navigation';
import { getCommercialNote, getPrograms } from '@/lib/firebase-service';
import type { CommercialNote, Program } from '@/lib/types';
import { Spinner } from '@/components/ui/spinner';
import { Button } from '@/components/ui/button';
import { FileDown, Copy, Check } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import { useToast } from '@/hooks/use-toast';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';

// Reutilizamos el componente NotePdf (que ya fue modificado para ocultar los botones al imprimir)
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
                <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
                    <h2 className="text-xl font-bold text-slate-800 border-b pb-2 mb-4">1. Textos y Zócalos (Clic para copiar)</h2>
                    
                    <div className="space-y-4">
                        {pGrafs.map((g, i) => (
                            <div key={`p-${i}`} className="p-4 border rounded-md bg-blue-50/50 hover:bg-blue-50 transition-colors flex justify-between items-center group cursor-pointer" onClick={() => handleCopy(g, `p-${i}`)}>
                                <div>
                                    <p className="text-xs font-bold text-gray-500 uppercase mb-1">TITULAR.Text</p>
                                    <p className="text-lg font-bold text-slate-800 uppercase">{g}</p>
                                </div>
                                <Button variant="ghost" size="icon" className="text-blue-600 group-hover:bg-white shrink-0">
                                    {copiedIndex === `p-${i}` ? <Check className="w-5 h-5 text-green-600" /> : <Copy className="w-5 h-5" />}
                                </Button>
                            </div>
                        ))}

                        {sGrafs.map((g, i) => (
                            <div key={`s-${i}`} className="p-4 border rounded-md bg-green-50/50 hover:bg-green-50 transition-colors flex justify-between items-center group cursor-pointer" onClick={() => handleCopy(g, `s-${i}`)}>
                                <div>
                                    <p className="text-xs font-bold text-gray-500 uppercase mb-1">NOMBRE/FUNCION.Text</p>
                                    <p className="text-lg font-bold text-slate-800 uppercase">{g}</p>
                                </div>
                                <Button variant="ghost" size="icon" className="text-green-600 group-hover:bg-white shrink-0">
                                    {copiedIndex === `s-${i}` ? <Check className="w-5 h-5 text-green-600" /> : <Copy className="w-5 h-5" />}
                                </Button>
                            </div>
                        ))}
                    </div>

                    <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="p-3 bg-gray-50 rounded border cursor-pointer hover:bg-gray-100 flex justify-between items-center" onClick={() => handleCopy(note.intervieweeName || '', 'name')}>
                            <div>
                                <span className="text-xs text-gray-500 block">Nombre Entrevistado</span>
                                <span className="font-bold">{note.intervieweeName || '-'}</span>
                            </div>
                            <Copy className="w-4 h-4 text-gray-400" />
                        </div>
                        <div className="p-3 bg-gray-50 rounded border cursor-pointer hover:bg-gray-100 flex justify-between items-center" onClick={() => handleCopy(note.intervieweeRole || '', 'role')}>
                            <div>
                                <span className="text-xs text-gray-500 block">Cargo/Función</span>
                                <span className="font-bold">{note.intervieweeRole || '-'}</span>
                            </div>
                            <Copy className="w-4 h-4 text-gray-400" />
                        </div>
                    </div>
                </div>

                <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
                    <h2 className="text-xl font-bold text-slate-800 border-b pb-2 mb-4">2. Contenido y Preguntas</h2>
                    <ul className="list-decimal list-inside space-y-3">
                        {note.questions?.map((q, i) => (
                            <li key={i} className="p-2 hover:bg-gray-50 rounded cursor-pointer group flex justify-between" onClick={() => handleCopy(q, `q-${i}`)}>
                                <span className="text-slate-700">{q}</span>
                                <Copy className="w-4 h-4 text-gray-400 opacity-0 group-hover:opacity-100" />
                            </li>
                        ))}
                    </ul>

                    {note.topicsToAvoid && note.topicsToAvoid.length > 0 && (
                        <div className="mt-6 p-4 bg-red-50 border border-red-200 rounded-md">
                            <h3 className="font-bold text-red-800 mb-2">⚠️ TEMAS A EVITAR:</h3>
                            <ul className="list-disc list-inside text-red-900 space-y-1">
                                {note.topicsToAvoid.map((t, i) => <li key={i}>{t}</li>)}
                            </ul>
                        </div>
                    )}
                </div>

                {note.graphicSupport && (
                    <div className="bg-yellow-50 p-6 rounded-lg shadow-sm border border-yellow-200">
                        <h2 className="text-xl font-bold text-yellow-900 border-b border-yellow-200 pb-2 mb-4">3. Material de Apoyo Gráfico</h2>
                        <div className="flex flex-col gap-3">
                            {note.graphicSupportLinks && note.graphicSupportLinks.length > 0 ? (
                                note.graphicSupportLinks.map((link, idx) => (
                                    <a key={idx} href={link.startsWith('http') ? link : `https://${link}`} target="_blank" rel="noopener noreferrer" className="bg-white p-4 border border-yellow-300 rounded font-bold text-blue-700 text-center shadow-sm hover:shadow transition-shadow">
                                        👉 ABRIR ENLACE DE MATERIAL {idx + 1} 👈
                                    </a>
                                ))
                            ) : note.graphicSupportLink ? (
                                <a href={note.graphicSupportLink.startsWith('http') ? note.graphicSupportLink : `https://${note.graphicSupportLink}`} target="_blank" rel="noopener noreferrer" className="bg-white p-4 border border-yellow-300 rounded font-bold text-blue-700 text-center shadow-sm hover:shadow transition-shadow">
                                    👉 ABRIR ENLACE DE MATERIAL 👈
                                </a>
                            ) : null}
                        </div>
                    </div>
                )}
            </main>

            {/* CONTENEDOR OCULTO PARA EXPORTAR EL PDF CON EL FORMATO OFICIAL */}
            <div style={{ position: 'fixed', top: '-10000px', left: '-10000px', zIndex: -1 }}>
                <NotePdf ref={pdfRef} programs={programs} note={note} />
            </div>
        </div>
    );
}
