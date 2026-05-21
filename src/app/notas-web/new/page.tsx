'use client';

import { Header } from '@/components/layout/header';
import { WebNoteForm } from '@/components/notas-web/web-note-form';
import { useSearchParams } from 'next/navigation';
import React, { Suspense } from 'react';
import { Spinner } from '@/components/ui/spinner';

function NewWebNotePageContent() {
    const searchParams = useSearchParams();
    const editId = searchParams.get('editId') || undefined;
    const cloneId = searchParams.get('cloneId') || undefined;
    const orderId = searchParams.get('orderId') || undefined;

    return (
        <div className="flex flex-col h-full bg-gray-50/50">
            <Header title={editId ? "Editar Nota Web / Gacetilla" : "Nueva Nota Web / Gacetilla"} />
            <main className="flex-1 p-4 md:p-6 overflow-auto max-w-5xl mx-auto w-full">
                <WebNoteForm editId={editId} cloneId={cloneId} orderId={orderId} />
            </main>
        </div>
    );
}

export default function NewWebNotePage() {
    return (
        <Suspense fallback={<div className="flex h-full items-center justify-center"><Spinner size="large" /></div>}>
            <NewWebNotePageContent />
        </Suspense>
    );
}
