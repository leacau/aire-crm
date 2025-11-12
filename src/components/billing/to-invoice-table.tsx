
'use client';

import React, { useState, useEffect } from 'react';
import type { Opportunity, Client } from '@/lib/types';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Save } from 'lucide-react';
import type { NewInvoiceData } from '@/app/billing/page';

interface ToInvoiceTableProps {
  items: Opportunity[];
  clientsMap: Record<string, Client>;
  onCreateInvoice: (virtualOppId: string, invoiceDetails: NewInvoiceData) => Promise<void>;
  onRowClick: (item: Opportunity) => void;
}

const ToInvoiceTableRow = ({ 
    item, 
    client,
    onRowClick,
    onSave 
}: { 
    item: Opportunity, 
    client: Client | undefined,
    onRowClick: (item: Opportunity) => void,
    onSave: (virtualOppId: string, invoiceDetails: NewInvoiceData) => Promise<void>
}) => {
    const [invoiceData, setInvoiceData] = useState<NewInvoiceData>({
        invoiceNumber: '',
        date: new Date().toISOString().split('T')[0],
        amount: item.periodicidad?.[0] ? item.value : item.value,
    });
    const [isSaving, setIsSaving] = useState(false);

    const handleDataChange = (field: keyof NewInvoiceData, value: string) => {
        setInvoiceData(prev => ({
            ...prev,
            [field]: field === 'amount' ? (value === '' ? '' : Number(value)) : value,
        }));
    };

    const handleSaveClick = async (e: React.MouseEvent) => {
        e.stopPropagation();
        setIsSaving(true);
        await onSave(item.id, invoiceData);
        setIsSaving(false);
    };

    const canSave = invoiceData.invoiceNumber && invoiceData.amount && Number(invoiceData.amount) > 0;

    return (
        <TableRow>
            <TableCell>
                <div 
                    className="font-medium text-primary hover:underline cursor-pointer"
                    onClick={() => onRowClick(item)}
                >
                    {item.title}
                </div>
            </TableCell>
            <TableCell>
                {client ? (
                    <div className="flex flex-col">
                        <Link href={`/clients/${client.id}`} className="text-primary hover:underline" onClick={(e) => e.stopPropagation()}>
                            {client.denominacion}
                        </Link>
                        <span className="text-xs text-muted-foreground">{client.ownerName}</span>
                    </div>
                ) : (
                    item.clientName
                )}
            </TableCell>
            <TableCell className="text-right">${Number(item.value).toLocaleString('es-AR')}</TableCell>
            <TableCell>
                <Input 
                    placeholder="Ej: 0001-00123456" 
                    className="min-w-[150px]" 
                    value={invoiceData.invoiceNumber} 
                    onChange={(e) => handleDataChange('invoiceNumber', e.target.value)} 
                    onClick={e => e.stopPropagation()} 
                />
            </TableCell>
            <TableCell>
                <Input 
                    type="date" 
                    className="min-w-[140px]" 
                    value={invoiceData.date} 
                    onChange={(e) => handleDataChange('date', e.target.value)} 
                    onClick={e => e.stopPropagation()} 
                />
            </TableCell>
            <TableCell>
                <Input 
                    type="number" 
                    placeholder="0.00" 
                    className="min-w-[120px]" 
                    value={invoiceData.amount} 
                    onChange={(e) => handleDataChange('amount', e.target.value)} 
                    onClick={e => e.stopPropagation()} 
                />
            </TableCell>
            <TableCell>
                <Button size="sm" disabled={!canSave || isSaving} onClick={handleSaveClick}>
                    {isSaving ? '...' : <Save className="h-4 w-4" />}
                </Button>
            </TableCell>
        </TableRow>
    );
};

export function ToInvoiceTable({ items, clientsMap, onCreateInvoice, onRowClick }: ToInvoiceTableProps) {
    
    const total = items.reduce((acc, item) => acc + Number(item.value || 0), 0);

    return (
        <div className="rounded-md border">
            <Table>
                <TableHeader>
                    <TableRow>
                        <TableHead>Oportunidad</TableHead>
                        <TableHead>Cliente</TableHead>
                        <TableHead className="text-right">Monto Oportunidad</TableHead>
                        <TableHead>Nº Factura</TableHead>
                        <TableHead>Fecha Factura</TableHead>
                        <TableHead>Monto Factura</TableHead>
                        <TableHead>Acción</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {items.length > 0 ? (
                        items.map(item => (
                            <ToInvoiceTableRow 
                                key={item.id}
                                item={item}
                                client={clientsMap[item.clientId]}
                                onRowClick={onRowClick}
                                onSave={onCreateInvoice}
                            />
                        ))
                    ) : (
                        <TableRow>
                            <TableCell colSpan={7} className="h-24 text-center">
                                No hay items para facturar en este período.
                            </TableCell>
                        </TableRow>
                    )}
                </TableBody>
                <TableFooter>
                    <TableRow>
                        <TableCell colSpan={2} className="font-bold">Total</TableCell>
                        <TableCell className="text-right font-bold">${total.toLocaleString('es-AR')}</TableCell>
                        <TableCell colSpan={4}></TableCell>
                    </TableRow>
                </TableFooter>
            </Table>
        </div>
    );
}
