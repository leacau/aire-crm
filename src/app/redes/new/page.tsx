'use client';

import { Header } from '@/components/layout/header';
import { SocialMediaForm } from '@/components/redes/social-media-form';
import { useSearchParams } from 'next/navigation';

export default function NewRedesPage() {
    const searchParams = useSearchParams();
    const editId = searchParams.get('editId') || undefined;
    const cloneId = searchParams.get('cloneId') || undefined;

    return (
        <div className="flex flex-col h-full bg-gray-50/50">
            <Header title={editId ? "Editar Pedido" : "Nuevo Pedido de Redes"} />
            <main className="flex-1 p-4 md:p-6 overflow-auto max-w-5xl mx-auto w-full">
                <SocialMediaForm editId={editId} cloneId={cloneId} />
            </main>
        </div>
    );
}
