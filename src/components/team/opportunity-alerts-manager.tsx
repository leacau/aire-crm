
'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { getOpportunityAlertsConfig, updateOpportunityAlertsConfig } from '@/lib/firebase-service';
import type { OpportunityStage, OpportunityAlertsConfig } from '@/lib/types';
import { Spinner } from '../ui/spinner';
import { useAuth } from '@/hooks/use-auth';
import { hasManagementPrivileges } from '@/lib/role-utils';

const alertableStages: OpportunityStage[] = ['Nuevo', 'Propuesta', 'Negociación', 'Negociación a Aprobar'];

export function OpportunityAlertsManager() {
    const { userInfo } = useAuth();
    const [config, setConfig] = useState<OpportunityAlertsConfig>({});
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const { toast } = useToast();

    const canManageAlerts = hasManagementPrivileges(userInfo);

    useEffect(() => {
        setIsLoading(true);
        getOpportunityAlertsConfig()
            .then((data) => {
                if(data) setConfig(data);
            })
            .catch(() => {
                // The error is handled globally by the error emitter, so we just prevent the app from crashing.
                // We can show a toast for a better UX if needed.
                console.error('Permission denied to load alert configs. Showing defaults instead.');
            })
            .finally(() => setIsLoading(false));
    }, [toast]);

    const handleDaysChange = (stage: OpportunityStage, value: string) => {
        const days = Number(value);
        setConfig(prev => ({
            ...prev,
            [stage]: isNaN(days) || days < 0 ? 0 : days,
        }));
    };

    const handleProspectVisibilityChange = (value: string) => {
        const days = Number(value);
        setConfig(prev => ({
            ...prev,
            prospectVisibilityDays: isNaN(days) || days < 0 ? 0 : days,
        }));
    };

    const handleSave = async () => {
        if (!userInfo) return;
        if (!canManageAlerts) {
            toast({ title: 'No tenés permisos para actualizar las alertas. Contactá a un administrador.', variant: 'destructive' });
            return;
        }
        setIsSaving(true);
        try {
            await updateOpportunityAlertsConfig(config, userInfo.id, userInfo.name);
            toast({ title: "Configuración de alertas guardada" });
        } catch (error) {
            const isPermissionError = error instanceof Error && (error.message === 'permission-denied' || error.name === 'FirebasePermissionError');
            const message = isPermissionError
                ? 'No tenés permisos para actualizar las alertas. Contactá a un administrador.'
                : 'Error al guardar la configuración';

            toast({ title: message, variant: 'destructive' });
        } finally {
            setIsSaving(false);
        }
    };
    
    if (isLoading) {
        return <div className="flex justify-center items-center h-48"><Spinner /></div>;
    }

    return (
        <Card>
            <CardHeader>
                <CardTitle>Configuración de Alertas de Oportunidades</CardTitle>
                <CardDescription>
                    Define la cantidad máxima de días que una oportunidad puede permanecer en una etapa antes de que se muestre una alerta.
                </CardDescription>
            </CardHeader>
            <CardContent>
                {!canManageAlerts && (
                    <p className="text-sm text-muted-foreground mb-4">
                        No contás con permisos de edición para esta configuración. Podés revisar los valores actuales, pero cualquier cambio debe realizarlo un administrador o un perfil de gestión.
                    </p>
                )}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    {alertableStages.map(stage => (
                        <div key={stage} className="space-y-2">
                            <Label htmlFor={`alert-${stage}`}>{stage}</Label>
                            <Input
                                id={`alert-${stage}`}
                                type="number"
                                placeholder="Días"
                                value={config[stage] || ''}
                                onChange={(e) => handleDaysChange(stage, e.target.value)}
                                disabled={!canManageAlerts}
                            />
                        </div>
                    ))}
                </div>
                <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                        <Label htmlFor="prospect-visibility">Días de visibilidad de prospectos</Label>
                        <Input
                            id="prospect-visibility"
                            type="number"
                            placeholder="Días sin actividad"
                            value={config.prospectVisibilityDays ?? ''}
                            onChange={(e) => handleProspectVisibilityChange(e.target.value)}
                            disabled={!canManageAlerts}
                        />
                        <p className="text-xs text-muted-foreground">
                            Los prospectos sin actividad durante este período se ocultarán a sus dueños.
                        </p>
                    </div>
                </div>
                <div className="flex justify-end mt-6">
                    <Button onClick={handleSave} disabled={isSaving || !canManageAlerts}>
                        {isSaving ? <Spinner size="small" /> : 'Guardar Alertas'}
                    </Button>
                </div>
            </CardContent>
        </Card>
    );
}
