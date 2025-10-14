
'use client';

import React from 'react';
import type { Client, Person } from '@/lib/types';

interface ClientPdfProps {
  client: Client;
  contact: Person | null;
}

const TableRow = ({ label, value }: { label: string, value: string | undefined }) => (
    <tr>
        <td className="border border-black p-2 font-bold w-1/3">{label}</td>
        <td className="border border-black p-2">{value || ''}</td>
    </tr>
);

export const ClientPdf = React.forwardRef<HTMLDivElement, ClientPdfProps>(({ client, contact }, ref) => {
    return (
      <div ref={ref} className="bg-white p-12" style={{ width: '210mm', minHeight: '297mm', fontFamily: 'Arial, sans-serif' }}>
        <header className="flex justify-end mb-16">
            <div className="bg-[#ED6E73] text-white font-bold text-4xl p-6 px-12">
                AIRE
            </div>
        </header>

        <main>
            <div className="mb-8">
                <span className="border-l-4 border-black pl-4 text-3xl font-bold">ALTA DE CLIENTE</span>
            </div>

            <p className="mb-8 text-lg">
                1) Completar la siguiente ficha y enviar por mail a los indicados abajo.
            </p>

            <table className="w-full border-collapse border border-black text-lg">
                <tbody>
                    <TableRow label="Razón Social" value={client.razonSocial} />
                    <TableRow label="Cuit" value={client.cuit} />
                    <TableRow label="Dirección" value={`${client.localidad}, ${client.provincia}`} />
                    <TableRow label="Condición frente al IVA" value={client.condicionIVA} />
                    <TableRow label="Teléfono de contacto" value={contact?.phone || client.phone} />
                    <TableRow label="Correo de contacto" value={contact?.email || client.email} />
                </tbody>
            </table>
        </main>
      </div>
    );
});

ClientPdf.displayName = 'ClientPdf';
