'use client';

import { useState, useEffect, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/use-auth';
import { getSocialMediaRequest } from '@/lib/firebase-service';
import type { SocialMediaRequest } from '@/lib/types';
import { Spinner } from '@/components/ui/spinner';
import { Header } from '@/components/layout/header';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Edit, Copy, FileDown } from 'lucide-react';
import { SocialMediaPdf } from '@/components/redes/social-media-pdf';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';

export default function RedesViewerPage() {
    const { id } = useParams();
    const router = useRouter();
    const { userInfo } = useAuth();
    const pdfRef = useRef<HTMLDivElement>(null);
    const [request, setRequest] = useState<SocialMediaRequest | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (typeof id === 'string') {
            getSocialMediaRequest(id).then(res => {
                setRequest(res);
                setLoading(false);
            });
        }
    }, [id]);

    const handleDownloadPdf = async () => {
        if (!pdfRef.current || !request) return;
        const pdf = new jsPDF('p', 'mm', 'a4');
        const canvas = await html2canvas(pdfRef.current, { scale: 1.5, useCORS: true });
        const imgData = canvas.toDataURL('image/jpeg', 0.8);
        const pdfWidth = pdf.internal.pageSize.getWidth();
        const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
        pdf.addImage(imgData, 'JPEG', 0, 0, pdfWidth, pdfHeight);
        pdf.save(`Redes_${request.clientName.replace(/ /g, "_")}.pdf`);
    };

    if (loading) return <div className="flex h-full items-center justify-center"><Spinner size="large" /></div>;
    if (!request) return <div className="p-8 text-center">Pedido no encontrado</div>;

    const canEdit = userInfo?.id === request.advisorId || userInfo?.role === 'Admin' || userInfo?.role === 'Administracion';

    return (
        <div className="flex flex-col h-full bg-gray-50/50">
            <Header title={`Detalle Pedido: ${request.clientName}`}>
                <div className="flex gap-2">
                    <Button variant="ghost" onClick={() => router.back()}><ArrowLeft className="mr-2 h-4 w-4" /> Volver</Button>
                    {canEdit && <Button variant="outline" onClick={() => router.push(`/redes/new?editId=${request.id}`)}><Edit className="mr-2 h-4 w-4 text-blue-600" /> Editar</Button>}
                    <Button variant="outline" onClick={() => router.push(`/redes/new?cloneId=${request.id}`)}><Copy className="mr-2 h-4 w-4" /> Duplicar</Button>
                    <Button onClick={handleDownloadPdf}><FileDown className="mr-2 h-4 w-4" /> Exportar PDF</Button>
                </div>
            </Header>
            <main className="flex-1 p-4 md:p-6 overflow-auto">
                <div className="max-w-4xl mx-auto border shadow-sm rounded-md overflow-hidden">
                    <SocialMediaPdf ref={pdfRef} request={request} />
                </div>
            </main>
        </div>
    );
}
