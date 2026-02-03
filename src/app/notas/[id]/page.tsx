'use client';

import React, { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { getCommercialNote, getPrograms } from '@/lib/firebase-service';
import type { CommercialNote, Program } from '@/lib/types';
import { Spinner } from '@/components/ui/spinner';
import { Header } from '@/components/layout/header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { ExternalLink } from 'lucide-react';

export default function NoteDetailPage() {
    const { id } = useParams();
    const [note, setNote] = useState<CommercialNote | null>(null);
    const [programs, setPrograms] = useState<Program[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const load = async () => {
            if (typeof id === 'string') {
                const [n, p] = await Promise.all([
                    getCommercialNote(id),
                    getPrograms()
                ]);
                setNote(n);
                setPrograms(p);
            }
            setLoading(false);
        };
        load();
    }, [id]);

    if (loading) return <div className="flex h-full items-center justify-center"><Spinner size="large" /></div>;
    if (!note) return <div className="p-8 text-center">Nota no encontrada</div>;

    const Section = ({ title, children }: { title: string, children: React.ReactNode }) => (
        <div className="space-y-3 mb-6">
            <h3 className="text-lg font-bold text-primary border-b pb-2">{title}</h3>
            {children}
        </div>
    );

    const Field = ({ label, value }: { label: string, value: any }) => (
        <div className="grid grid-cols-3 gap-2 py-1">
            <span className="font-semibold text-muted-foreground text-sm">{label}:</span>
            <span className="col-span-2 text-sm break-words">{value || '-'}</span>
        </div>
    );

    return (
        <div className="flex flex-col h-full overflow-hidden bg-gray-50/50">
            <Header title={`Detalle de Nota: ${note.title}`} />
            <main className="flex-1 overflow-auto p-4 md:p-8 max-w-5xl mx-auto w-full">
                <div className="grid gap-6 md:grid-cols-3">
                    
                    {/* Columna Principal (Datos Operativos) */}
                    <div className="md:col-span-2 space-y-6">
                        <Card>
                            <CardHeader><CardTitle>Detalles Operativos</CardTitle></CardHeader>
                            <CardContent>
                                <Section title="1. Datos Generales">
                                    <Field label="Cliente" value={note.clientName} />
                                    <Field label="Razón Social" value={note.razonSocial} />
                                    <Field label="Asesor" value={note.advisorName} />
                                    <Field label="Fecha Carga" value={format(new Date(note.createdAt), "PPP p", { locale: es })} />
                                </Section>

                                <Section title="2. Nota">
                                    <Field label="Título" value={note.title} />
                                    <Field label="Ubicación" value={note.location} />
                                    {note.location === 'Móvil' && <Field label="Dirección" value={note.mobileAddress} />}
                                    {note.location === 'Llamada' && <Field label="Teléfono" value={note.callPhone} />}
                                    
                                    <div className="my-4 space-y-2">
                                        <div className="p-3 bg-muted rounded border">
                                            <span className="text-xs font-bold uppercase text-muted-foreground">Graf Primario</span>
                                            <p>{note.primaryGraf}</p>
                                        </div>
                                        <div className="p-3 bg-muted rounded border">
                                            <span className="text-xs font-bold uppercase text-muted-foreground">Graf Secundario</span>
                                            <p>{note.secondaryGraf}</p>
                                        </div>
                                    </div>

                                    {note.graphicSupport && (
                                        <div className="p-3 bg-yellow-100 border border-yellow-300 rounded text-yellow-900 font-medium flex items-center gap-2">
                                            <span>⚠️ Requiere Soporte Gráfico</span>
                                            {note.graphicSupportLink && (
                                                <a href={note.graphicSupportLink} target="_blank" rel="noreferrer" className="text-blue-600 underline text-sm flex items-center">
                                                    Ver Drive <ExternalLink className="h-3 w-3 ml-1" />
                                                </a>
                                            )}
                                        </div>
                                    )}
                                </Section>

                                <Section title="3. Contenido">
                                    <div className="mb-4">
                                        <h4 className="font-semibold mb-2 text-sm">Preguntas Sugeridas:</h4>
                                        <ul className="list-decimal list-inside text-sm space-y-1">
                                            {note.questions?.map((q, i) => <li key={i}>{q}</li>)}
                                        </ul>
                                    </div>
                                    {note.topicsToAvoid && note.topicsToAvoid.length > 0 && (
                                        <div className="p-3 bg-red-50 border border-red-200 rounded">
                                            <h4 className="font-bold text-red-700 text-sm mb-2">TEMAS A EVITAR:</h4>
                                            <ul className="list-disc list-inside text-sm text-red-900">
                                                {note.topicsToAvoid.map((t, i) => <li key={i}>{t}</li>)}
                                            </ul>
                                        </div>
                                    )}
                                </Section>

                                <Section title="4. Entrevistado & Contacto">
                                    <Field label="Nombre" value={note.intervieweeName} />
                                    <Field label="Cargo" value={note.intervieweeRole} />
                                    {note.intervieweeBio && <div className="mt-2 text-sm italic text-muted-foreground bg-muted p-2 rounded">{note.intervieweeBio}</div>}
                                    <Separator className="my-3" />
                                    <div className="grid grid-cols-2 gap-4">
                                        <div><span className="font-bold text-xs">Web:</span> {note.noWeb ? 'No' : note.website}</div>
                                        <div><span className="font-bold text-xs">IG:</span> {note.instagram || '-'}</div>
                                        <div><span className="font-bold text-xs">WhatsApp:</span> {note.noWhatsapp ? 'No' : note.whatsapp}</div>
                                        <div><span className="font-bold text-xs">Tel. Com.:</span> {note.noCommercialPhone ? 'No' : note.phone}</div>
                                    </div>
                                    {note.commercialAddresses && note.commercialAddresses.length > 0 && !note.noCommercialAddress && (
                                        <div className="mt-2">
                                            <span className="font-bold text-xs">Domicilios:</span>
                                            <ul className="list-disc list-inside text-xs mt-1">
                                                {note.commercialAddresses.map((a, i) => <li key={i}>{a}</li>)}
                                            </ul>
                                        </div>
                                    )}
                                </Section>
                            </CardContent>
                        </Card>
                    </div>

                    {/* Columna Lateral (Comercial y Pautado) */}
                    <div className="space-y-6">
                        <Card className="border-l-4 border-l-blue-500">
                            <CardHeader><CardTitle>Datos Comerciales</CardTitle></CardHeader>
                            <CardContent className="space-y-4">
                                <div className="flex justify-between items-center">
                                    <span className="text-sm text-muted-foreground">Valor Tarifario</span>
                                    <span className="font-medium">${note.totalValue?.toLocaleString()}</span>
                                </div>
                                <div className="flex justify-between items-center text-lg font-bold">
                                    <span>Valor Venta</span>
                                    <span className="text-green-600">${note.saleValue?.toLocaleString()}</span>
                                </div>
                                {note.mismatch !== 0 && (
                                    <div className="p-2 bg-orange-50 text-orange-800 text-xs rounded border border-orange-200">
                                        Diferencia: ${note.mismatch?.toLocaleString()}
                                    </div>
                                )}
                                {note.financialObservations && (
                                    <div className="pt-2 border-t">
                                        <span className="text-xs font-bold block mb-1">Observaciones:</span>
                                        <p className="text-sm text-muted-foreground">{note.financialObservations}</p>
                                    </div>
                                )}
                            </CardContent>
                        </Card>

                        <Card>
                            <CardHeader><CardTitle>Pautado</CardTitle></CardHeader>
                            <CardContent className="space-y-4">
                                <div>
                                    <span className="text-xs font-bold block mb-2">Cronograma:</span>
                                    {Object.entries(note.schedule || {}).map(([progId, items]) => {
                                        const progName = programs.find(p => p.id === progId)?.name || 'Programa';
                                        return (
                                            <div key={progId} className="mb-2 last:mb-0">
                                                <Badge variant="outline" className="mb-1">{progName}</Badge>
                                                {/* @ts-ignore */}
                                                {items.map((it, i) => (
                                                    <div key={i} className="text-xs pl-2 border-l-2 border-gray-200">
                                                        {format(new Date(it.date), 'dd/MM/yyyy')} - {it.time}hs
                                                    </div>
                                                ))}
                                            </div>
                                        )
                                    })}
                                </div>
                                <Separator />
                                <div className="space-y-2 text-sm">
                                    <div className="flex justify-between">
                                        <span>Replica Web</span>
                                        <span className="font-bold">{note.replicateWeb ? 'SÍ' : 'NO'}</span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span>Redes</span>
                                        <span className="font-bold">{note.replicateSocials?.join(', ') || '-'}</span>
                                    </div>
                                    {note.collaboration && (
                                        <div className="bg-blue-50 p-2 rounded text-xs">
                                            <span className="font-bold block">Colaboración:</span> {note.collaborationHandle}
                                            <span className="font-bold block mt-1">CTA:</span> {note.ctaText} -&gt; {note.ctaDestination}
                                        </div>
                                    )}
                                </div>
                            </CardContent>
                        </Card>
                        
                        <Card>
                            <CardHeader><CardTitle>Observaciones Producción</CardTitle></CardHeader>
                            <CardContent>
                                <p className="text-sm text-muted-foreground whitespace-pre-wrap">{note.noteObservations || 'Sin observaciones.'}</p>
                            </CardContent>
                        </Card>
                    </div>
                </div>
            </main>
        </div>
    );
}
