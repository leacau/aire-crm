'use client';

import React, { useState, useEffect } from 'react';
import { Header } from '@/components/layout/header';
import { useAuth } from '@/hooks/use-auth';
import { Spinner } from '@/components/ui/spinner';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { getWorkflowAssignments, saveWorkflowAssignments, getAllUsers } from '@/lib/firebase-service';
import { User } from '@/lib/types';
import { Save, ShieldAlert, Award, FileText, Landmark, Loader2 } from 'lucide-react'; // 🟢 CORREGIDO: Loader2 agregado aquí

export default function WorkflowAssignmentsPage() {
    const { userInfo, isBoss } = useAuth();
    const { toast } = useToast();

    const [users, setUsers] = useState<User[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    const [approvers, setApprovers] = useState<string[]>([]);
    const [billingReceptors, setBillingReceptors] = useState<string[]>([]);
    const [tangoInvoicers, setTangoInvoicers] = useState<string[]>([]);

    const canAccess = userInfo && (isBoss || userInfo.email === 'lchena@airedesantafe.com.ar' || userInfo.role === 'Gerencia');

    useEffect(() => {
        if (canAccess) {
            Promise.all([getAllUsers(), getWorkflowAssignments()]).then(([allUsers, config]) => {
                setUsers(allUsers);
                setApprovers(config.approvers || []);
                setBillingReceptors(config.billingReceptors || []);
                setTangoInvoicers(config.tangoInvoicers || []);
                setLoading(false);
            }).catch(() => toast({ title: 'Error al cargar datos', variant: 'destructive' }));
        }
    }, [canAccess]);

    const togglePermission = (userId: string, type: 'approvers' | 'billingReceptors' | 'tangoInvoicers') => {
        if (type === 'approvers') {
            setApprovers(prev => prev.includes(userId) ? prev.filter(id => id !== userId) : [...prev, userId]);
        } else if (type === 'billingReceptors') {
            setBillingReceptors(prev => prev.includes(userId) ? prev.filter(id => id !== userId) : [...prev, userId]);
        } else if (type === 'tangoInvoicers') {
            setTangoInvoicers(prev => prev.includes(userId) ? prev.filter(id => id !== userId) : [...prev, userId]);
        }
    };

    const handleSave = async () => {
        setSaving(true);
        try {
            await saveWorkflowAssignments({ approvers, billingReceptors, tangoInvoicers });
            toast({ title: 'Configuración guardada', description: 'La matriz de responsabilidades ha sido actualizada con éxito.' });
        } catch {
            toast({ title: 'Error al guardar', variant: 'destructive' });
        } finally {
            setSaving(false);
        }
    };

    if (!userInfo) return <Spinner />;
    if (!canAccess) return <div className="p-10 text-center text-red-500 font-bold text-xl">Acceso Denegado. Pantalla exclusiva de la Dirección.</div>;

    return (
        <div className="flex flex-col h-full bg-slate-50">
            <Header title="Responsabilidades del Sistema">
                <Button onClick={handleSave} disabled={saving} className="bg-blue-600 hover:bg-blue-700 font-bold">
                    {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
                    {saving ? 'Guardando...' : 'Guardar Matriz'}
                </Button>
            </Header>

            <main className="flex-1 overflow-auto p-4 md:p-8 max-w-5xl mx-auto w-full">
                <div className="mb-6 bg-blue-50 border-l-4 border-blue-600 p-4 rounded shadow-sm flex items-start gap-4">
                    <ShieldAlert className="text-blue-600 w-6 h-6 shrink-0 mt-0.5" />
                    <p className="text-sm text-blue-900 font-medium">
                        Configura qué usuarios tienen permisos de Auditoría, quiénes reciben los pedidos de los asesores y qué correos de Administración contable recibirán las solicitudes automáticas de facturas Tango.
                    </p>
                </div>

                {loading ? <div className="py-20 flex justify-center"><Spinner size="large" /></div> : (
                    <div className="bg-white border rounded-md shadow-sm overflow-hidden">
                        <Table>
                            <TableHeader className="bg-slate-100">
                                <TableRow>
                                    <TableHead>Usuario / Nombre</TableHead>
                                    <TableHead className="text-center w-[200px] bg-purple-50/30"><div className="flex justify-center items-center gap-1 font-bold text-purple-900"><Award className="w-4 h-4" /> 1. Aprobador</div></TableHead>
                                    <TableHead className="text-center w-[200px] bg-amber-50/30"><div className="flex justify-center items-center gap-1 font-bold text-amber-900"><FileText className="w-4 h-4" /> 2. Receptor Pedidos</div></TableHead>
                                    <TableHead className="text-center w-[200px] bg-green-50/30"><div className="flex justify-center items-center gap-1 font-bold text-green-900"><Landmark className="w-4 h-4" /> 3. Facturación Tango</div></TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {users.map(u => (
                                    <TableRow key={u.id} className="hover:bg-slate-50/80">
                                        <TableCell>
                                            <div className="font-bold text-slate-800">{u.name}</div>
                                            <div className="text-xs text-slate-500 flex gap-2 mt-0.5">
                                                <span>{u.email}</span>
                                                <span>•</span>
                                                <Badge variant="outline" className="text-[9px] py-0">{u.role}</Badge>
                                            </div>
                                        </TableCell>
                                        <TableCell className="text-center bg-purple-50/10">
                                            <Switch checked={approvers.includes(u.id)} onCheckedChange={() => togglePermission(u.id, 'approvers')} />
                                        </TableCell>
                                        <TableCell className="text-center bg-amber-50/10">
                                            <Switch checked={billingReceptors.includes(u.id)} onCheckedChange={() => togglePermission(u.id, 'billingReceptors')} />
                                        </TableCell>
                                        <TableCell className="text-center bg-green-50/10">
                                            <Switch checked={tangoInvoicers.includes(u.id)} onCheckedChange={() => togglePermission(u.id, 'tangoInvoicers')} />
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </div>
                )}
            </main>
        </div>
    );
}
