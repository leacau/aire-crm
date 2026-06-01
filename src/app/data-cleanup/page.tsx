'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { Header } from '@/components/layout/header';
import { useAuth } from '@/hooks/use-auth';
import { Spinner } from '@/components/ui/spinner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { getClients, mergeClients } from '@/lib/firebase-service';
import { Client } from '@/lib/types';
import { ArrowRight, AlertTriangle, ShieldAlert } from 'lucide-react';

export default function DataCleanupPage() {
    const { userInfo, isBoss } = useAuth();
    const { toast } = useToast();

    const [clients, setClients] = useState<Client[]>([]);
    const [loading, setLoading] = useState(true);
    const [merging, setMerging] = useState(false);

    const [searchTarget, setSearchTarget] = useState('');
    const [searchSource, setSearchSource] = useState('');

    const [targetClient, setTargetClient] = useState<Client | null>(null);
    const [sourceClient, setSourceClient] = useState<Client | null>(null);

    // Seguridad: Solo Jefes y Gerencia
    const canAccess = userInfo && (isBoss || userInfo.role === 'Gerencia' || userInfo.role === 'Jefe');

    useEffect(() => {
        if (canAccess) {
            getClients().then(data => {
                setClients(data);
                setLoading(false);
            });
        }
    }, [canAccess]);

    const filteredTargets = useMemo(() => {
        if (!searchTarget || searchTarget.length < 2) return [];
        return clients.filter(c => c.denominacion.toLowerCase().includes(searchTarget.toLowerCase()) && c.id !== sourceClient?.id).slice(0, 10);
    }, [searchTarget, clients, sourceClient]);

    const filteredSources = useMemo(() => {
        if (!searchSource || searchSource.length < 2) return [];
        return clients.filter(c => c.denominacion.toLowerCase().includes(searchSource.toLowerCase()) && c.id !== targetClient?.id).slice(0, 10);
    }, [searchSource, clients, targetClient]);

    const handleMerge = async () => {
        if (!targetClient || !sourceClient) return;
        
        const confirm1 = window.confirm(`ATENCIÓN: Vas a eliminar a "${sourceClient.denominacion}" y pasar todos sus datos a "${targetClient.denominacion}".`);
        if (!confirm1) return;
        
        const confirm2 = window.confirm(`¿Estás 100% seguro? Esta acción NO SE PUEDE DESHACER.`);
        if (!confirm2) return;

        setMerging(true);
        try {
            await mergeClients(targetClient.id, sourceClient.id, userInfo!.id, userInfo!.name);
            toast({ title: '¡Fusión Exitosa!', description: 'Todos los datos fueron migrados y el duplicado fue eliminado.' });
            
            // Refrescar clientes y resetear pantalla
            setTargetClient(null);
            setSourceClient(null);
            setSearchTarget('');
            setSearchSource('');
            const updatedClients = await getClients();
            setClients(updatedClients);
        } catch (error: any) {
            toast({ title: 'Error al fusionar', description: error.message, variant: 'destructive' });
        } finally {
            setMerging(false);
        }
    };

    if (!userInfo) return <Spinner />;
    if (!canAccess) return <div className="p-10 text-center text-red-500 font-bold text-xl">Acceso Denegado. Pantalla exclusiva de Gerencia.</div>;

    return (
        <div className="flex flex-col h-full bg-slate-50 relative">
            <Header title="Limpieza de Base de Datos (Fusión)" />

            <main className="flex-1 overflow-auto p-4 md:p-8 max-w-6xl mx-auto w-full">
                <div className="mb-6 bg-red-50 border-l-4 border-red-600 p-4 rounded shadow-sm flex items-start gap-4">
                    <ShieldAlert className="text-red-600 w-8 h-8 shrink-0 mt-1" />
                    <div>
                        <h2 className="text-red-900 font-bold text-lg">Zona de Peligro - Fusión de Duplicados</h2>
                        <p className="text-sm text-red-800 mt-1">
                            Esta herramienta transfiere absolutamente todo (Oportunidades, Facturas, Notas, Redes, Actividades) del <strong>Cliente Duplicado</strong> hacia el <strong>Cliente Principal</strong> y luego <strong>elimina al duplicado para siempre</strong>. Úselo con extrema precaución.
                        </p>
                    </div>
                </div>

                {loading ? <Spinner className="mx-auto mt-20" size="large" /> : (
                    <div className="grid md:grid-cols-[1fr_auto_1fr] gap-6 items-stretch mt-10">
                        
                        {/* PANEL IZQUIERDO: CLIENTE PRINCIPAL (EL QUE QUEDA) */}
                        <div className="bg-white border-2 border-green-200 rounded-lg p-6 shadow-sm relative">
                            <div className="absolute top-0 left-0 bg-green-500 text-white px-3 py-1 text-xs font-bold rounded-br-lg rounded-tl-md">
                                CLIENTE PRINCIPAL (SOBREVIVE)
                            </div>
                            <h3 className="font-bold text-lg mt-4 mb-4 text-slate-700">1. Buscar cliente a conservar:</h3>
                            <Input 
                                placeholder="Escribe para buscar..." 
                                value={searchTarget} 
                                onChange={e => setSearchTarget(e.target.value)} 
                                className="mb-2"
                            />
                            {searchTarget.length >= 2 && !targetClient && (
                                <div className="border rounded bg-slate-50 flex flex-col gap-1 p-1 max-h-40 overflow-y-auto">
                                    {filteredTargets.map(c => (
                                        <button key={c.id} className="text-left px-3 py-2 text-sm hover:bg-green-100 rounded" onClick={() => setTargetClient(c)}>
                                            <span className="font-bold">{c.denominacion}</span> <span className="text-slate-500 text-xs">({c.cuit || 'Sin CUIT'})</span>
                                        </button>
                                    ))}
                                    {filteredTargets.length === 0 && <span className="text-xs text-slate-400 p-2">Sin resultados...</span>}
                                </div>
                            )}

                            {targetClient && (
                                <div className="mt-4 p-4 bg-green-50 border border-green-200 rounded text-sm relative">
                                    <button onClick={() => {setTargetClient(null); setSearchTarget('');}} className="absolute top-2 right-2 text-xs text-red-500 hover:underline">Cambiar</button>
                                    <p className="font-bold text-green-900 text-lg mb-1">{targetClient.denominacion}</p>
                                    <p><strong>Razón Social:</strong> {targetClient.razonSocial || '-'}</p>
                                    <p><strong>CUIT:</strong> {targetClient.cuit || '-'}</p>
                                    <p><strong>Dueño:</strong> {targetClient.ownerName || '-'}</p>
                                </div>
                            )}
                        </div>

                        {/* FLECHA CENTRAL */}
                        <div className="flex items-center justify-center pt-10">
                            <div className="bg-slate-200 p-3 rounded-full hidden md:block">
                                <ArrowRight className="w-8 h-8 text-slate-500" />
                            </div>
                        </div>

                        {/* PANEL DERECHO: CLIENTE DUPLICADO (EL QUE SE BORRA) */}
                        <div className="bg-white border-2 border-red-200 rounded-lg p-6 shadow-sm relative">
                            <div className="absolute top-0 right-0 bg-red-500 text-white px-3 py-1 text-xs font-bold rounded-bl-lg rounded-tr-md">
                                CLIENTE DUPLICADO (SE ELIMINA)
                            </div>
                            <h3 className="font-bold text-lg mt-4 mb-4 text-slate-700">2. Buscar cliente a eliminar:</h3>
                            <Input 
                                placeholder="Escribe para buscar..." 
                                value={searchSource} 
                                onChange={e => setSearchSource(e.target.value)} 
                                className="mb-2"
                            />
                            {searchSource.length >= 2 && !sourceClient && (
                                <div className="border rounded bg-slate-50 flex flex-col gap-1 p-1 max-h-40 overflow-y-auto">
                                    {filteredSources.map(c => (
                                        <button key={c.id} className="text-left px-3 py-2 text-sm hover:bg-red-100 rounded" onClick={() => setSourceClient(c)}>
                                            <span className="font-bold">{c.denominacion}</span> <span className="text-slate-500 text-xs">({c.cuit || 'Sin CUIT'})</span>
                                        </button>
                                    ))}
                                    {filteredSources.length === 0 && <span className="text-xs text-slate-400 p-2">Sin resultados...</span>}
                                </div>
                            )}

                            {sourceClient && (
                                <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded text-sm relative">
                                    <button onClick={() => {setSourceClient(null); setSearchSource('');}} className="absolute top-2 right-2 text-xs text-red-500 hover:underline">Cambiar</button>
                                    <p className="font-bold text-red-900 text-lg mb-1">{sourceClient.denominacion}</p>
                                    <p><strong>Razón Social:</strong> {sourceClient.razonSocial || '-'}</p>
                                    <p><strong>CUIT:</strong> {sourceClient.cuit || '-'}</p>
                                    <p><strong>Dueño:</strong> {sourceClient.ownerName || '-'}</p>
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* BOTÓN DE EJECUCIÓN */}
                <div className="mt-10 flex justify-center">
                    <Button 
                        size="lg" 
                        className="bg-slate-900 hover:bg-slate-800 text-white font-bold px-12 py-6 text-lg"
                        disabled={!targetClient || !sourceClient || merging}
                        onClick={handleMerge}
                    >
                        {merging ? <Spinner className="mr-2" /> : <AlertTriangle className="mr-2 w-6 h-6 text-yellow-400" />}
                        {merging ? 'MIGRANDO DATOS...' : 'EJECUTAR FUSIÓN DE CLIENTES'}
                    </Button>
                </div>
            </main>
        </div>
    );
}
