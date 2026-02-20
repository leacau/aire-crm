'use client';

import React, { useState, useEffect } from 'react';
import { Header } from '@/components/layout/header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/hooks/use-auth';
import { Spinner } from '@/components/ui/spinner';
import { getAllCommercialNotes, getClients } from '@/lib/firebase-service'; // <-- Cambiamos la importación
import type { CommercialNote } from '@/lib/types';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { Plus, Search, Eye } from 'lucide-react';
import Link from 'next/link';
import { hasManagementPrivileges } from '@/lib/role-utils';
import { Card, CardContent } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

export default function CommercialNotesListPage() {
    const { userInfo, loading: authLoading } = useAuth();
    const [notes, setNotes] = useState<CommercialNote[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');

    useEffect(() => {
        const fetchNotes = async () => {
            if (!userInfo) return;
            setLoading(true);
            try {
                // 1. Obtenemos TODAS las notas (evita el error de índices faltantes en Firebase)
                const allNotes = await getAllCommercialNotes();
                
                // 2. Filtramos según los permisos
                if (hasManagementPrivileges(userInfo) || userInfo.role === 'Administracion') {
                    setNotes(allNotes);
                } else {
                    // Para los asesores: buscamos cuáles son SUS clientes
                    const allClients = await getClients();
                    const myClientIds = new Set(
                        allClients.filter(c => c.ownerId === userInfo.id).map(c => c.id)
                    );
                    
                    // Mostramos la nota si el asesor la creó ÉL MISMO, o si es de UNO DE SUS CLIENTES
                    const myNotes = allNotes.filter(note => 
                        note.advisorId === userInfo.id || myClientIds.has(note.clientId)
                    );
                    setNotes(myNotes);
                }
            } catch (error) {
                console.error("Error fetching notes:", error);
            } finally {
                setLoading(false);
            }
        };

        if (!authLoading) fetchNotes();
    }, [userInfo, authLoading]);

    const filteredNotes = notes.filter(note => {
        const term = searchTerm.toLowerCase();
        return (
            (note.title && note.title.toLowerCase().includes(term)) ||
            (note.clientName && note.clientName.toLowerCase().includes(term)) ||
            (note.razonSocial && note.razonSocial.toLowerCase().includes(term))
        );
    });

    if (authLoading || loading) return <div className="flex h-full items-center justify-center"><Spinner size="large" /></div>;

    return (
        <div className="flex flex-col h-full overflow-hidden">
            <Header title="Notas Comerciales">
                <Button asChild>
                    <Link href="/notas/new">
                        <Plus className="mr-2 h-4 w-4" /> Nueva Nota
                    </Link>
                </Button>
            </Header>
            <main className="flex-1 overflow-auto p-4 md:p-6 space-y-6">
                <div className="flex items-center space-x-2">
                    <div className="relative w-full md:w-1/3">
                        <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                        <Input 
                            placeholder="Buscar por título o cliente..." 
                            className="pl-8" 
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>
                </div>

                <Card>
                    <CardContent className="p-0">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Fecha</TableHead>
                                    <TableHead>Título</TableHead>
                                    <TableHead>Cliente</TableHead>
                                    <TableHead>Asesor</TableHead>
                                    <TableHead className="w-[100px]"></TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {filteredNotes.length > 0 ? (
                                    filteredNotes.map((note) => (
                                        <TableRow key={note.id}>
                                            <TableCell className="font-medium">
                                                {format(new Date(note.createdAt), 'dd/MM/yyyy', { locale: es })}
                                            </TableCell>
                                            <TableCell>{note.title}</TableCell>
                                            <TableCell>{note.clientName}</TableCell>
                                            <TableCell>{note.advisorName}</TableCell>
                                            <TableCell>
                                                <Button variant="ghost" size="sm" asChild>
                                                    <Link href={`/notas/${note.id}`}>
                                                        <Eye className="h-4 w-4" />
                                                    </Link>
                                                </Button>
                                            </TableCell>
                                        </TableRow>
                                    ))
                                ) : (
                                    <TableRow>
                                        <TableCell colSpan={5} className="h-24 text-center">
                                            No se encontraron notas comerciales.
                                        </TableCell>
                                    </TableRow>
                                )}
                            </TableBody>
                        </Table>
                    </CardContent>
                </Card>
            </main>
        </div>
    );
}
