

'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { getAreaPermissions, updateAreaPermissions } from '@/lib/firebase-service';
import type { AreaType, ScreenName, ScreenPermission } from '@/lib/types';
import { areaTypes } from '@/lib/types';
import { screenNames } from '@/lib/types';
import { Spinner } from '../ui/spinner';
import { invalidatePermissionsCache } from '@/lib/permissions';

type PermissionsState = Record<AreaType, Partial<Record<ScreenName, ScreenPermission>>>;

export function PermissionsManager() {
    const [permissions, setPermissions] = useState<PermissionsState | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const { toast } = useToast();

    useEffect(() => {
        setIsLoading(true);
        getAreaPermissions()
            .then(setPermissions)
            .catch(() => toast({ title: "Error al cargar permisos", variant: "destructive" }))
            .finally(() => setIsLoading(false));
    }, [toast]);

    const handlePermissionChange = (area: AreaType, screen: ScreenName, type: 'view' | 'edit', checked: boolean) => {
        setPermissions(prev => {
            if (!prev) return null;
            const newPerms = { ...prev };
            if (!newPerms[area]) newPerms[area] = {};
            if (!newPerms[area][screen]) newPerms[area][screen] = { view: false, edit: false };
            
            const currentScreenPerms = newPerms[area][screen]!;
            currentScreenPerms[type] = checked;

            // If edit is true, view must also be true
            if (type === 'edit' && checked) {
                currentScreenPerms.view = true;
            }
            // If view is false, edit must also be false
            if (type === 'view' && !checked) {
                currentScreenPerms.edit = false;
            }

            return newPerms;
        });
    };

    const handleSave = async () => {
        if (!permissions) return;
        setIsSaving(true);
        try {
            await updateAreaPermissions(permissions);
            invalidatePermissionsCache(); // Invalidate the cache to force a refetch on next permission check
            toast({ title: "Permisos guardados", description: "Los cambios se aplicarán en el próximo refresco de página de los usuarios." });
        } catch (error) {
            toast({ title: "Error al guardar los permisos", variant: "destructive" });
        } finally {
            setIsSaving(false);
        }
    };

    if (isLoading) {
        return <div className="flex justify-center items-center h-64"><Spinner size="large" /></div>;
    }

    if (!permissions) {
        return <p>No se pudieron cargar los permisos.</p>;
    }

    return (
        <Card>
            <CardHeader>
                <CardTitle>Gestor de Permisos por Área</CardTitle>
                <CardDescription>
                    Define qué pantallas puede ver y editar cada área funcional. Marcar "Editar" también habilita "Ver".
                </CardDescription>
            </CardHeader>
            <CardContent>
                <div className="rounded-md border">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead className="w-[180px] sticky left-0 bg-background z-10">Área / Pantalla</TableHead>
                                {screenNames.map(screen => (
                                    <TableHead key={screen} className="text-center min-w-[120px]">{screen}</TableHead>
                                ))}
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {areaTypes.map(area => (
                                <TableRow key={area}>
                                    <TableCell className="font-semibold sticky left-0 bg-background z-10">{area}</TableCell>
                                    {screenNames.map(screen => {
                                        const viewChecked = permissions[area]?.[screen]?.view || false;
                                        const editChecked = permissions[area]?.[screen]?.edit || false;
                                        return (
                                            <TableCell key={`${area}-${screen}`} className="text-center">
                                                <div className="flex justify-center items-center gap-3">
                                                    <div className="flex items-center gap-1">
                                                        <Checkbox 
                                                            id={`${area}-${screen}-view`} 
                                                            checked={viewChecked}
                                                            onCheckedChange={(checked) => handlePermissionChange(area, screen, 'view', !!checked)}
                                                        />
                                                        <label htmlFor={`${area}-${screen}-view`} className="text-xs text-muted-foreground">Ver</label>
                                                    </div>
                                                    <div className="flex items-center gap-1">
                                                        <Checkbox 
                                                           id={`${area}-${screen}-edit`} 
                                                           checked={editChecked}
                                                           onCheckedChange={(checked) => handlePermissionChange(area, screen, 'edit', !!checked)}
                                                        />
                                                        <label htmlFor={`${area}-${screen}-edit`} className="text-xs text-muted-foreground">Editar</label>
                                                    </div>
                                                </div>
                                            </TableCell>
                                        );
                                    })}
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </div>
                <div className="flex justify-end mt-6">
                    <Button onClick={handleSave} disabled={isSaving}>
                        {isSaving ? <Spinner size="small" /> : 'Guardar Permisos'}
                    </Button>
                </div>
            </CardContent>
        </Card>
    );
}
