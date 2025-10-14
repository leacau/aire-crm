
'use client';

import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import type { Opportunity, OrdenPautado, User } from '@/lib/types';
import { useToast } from '@/hooks/use-toast';
import { Spinner } from '../ui/spinner';
import { getClient, getUserProfile } from '@/lib/firebase-service';

interface OrdenPautadoFormDialogProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  opportunity: Opportunity;
  client: { id: string, name: string };
  userInfo: User;
}

export function OrdenPautadoFormDialog({ isOpen, onOpenChange, opportunity, client, userInfo }: OrdenPautadoFormDialogProps) {
  const [formData, setFormData] = useState<Partial<OrdenPautado>>({});
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    const fetchInitialData = async () => {
        setLoading(true);
        const fullClient = await getClient(client.id);
        const owner = fullClient ? await getUserProfile(fullClient.ownerId) : null;
        
        setFormData({
            fecha: new Date().toISOString().split('T')[0],
            cuit: fullClient?.cuit,
            razonSocial: fullClient?.razonSocial,
            denominacionComercial: fullClient?.denominacion,
            rubro: fullClient?.rubro,
            vendedor: owner?.name,
            total: opportunity.value,
        });
        setLoading(false);
    }
    if (isOpen) {
        fetchInitialData();
    }
  }, [isOpen, client.id, opportunity.value]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value, type } = e.target;
    if (type === 'checkbox') {
        const { checked } = e.target as HTMLInputElement;
        setFormData(prev => ({...prev, [name]: checked}));
    } else {
        setFormData(prev => ({...prev, [name]: value}));
    }
  }

  const handleSave = () => {
    // TODO: Implement save logic
    toast({ title: "Funcionalidad en desarrollo", description: "El guardado de la orden de pautado aún no está implementado." });
    onOpenChange(false);
  };
  
  if (loading) {
    return (
      <Dialog open={isOpen} onOpenChange={onOpenChange}>
        <DialogContent>
          <div className="flex justify-center items-center h-48">
            <Spinner size="large" />
          </div>
        </DialogContent>
      </Dialog>
    )
  }

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>Orden de Publicidad Multipauta</DialogTitle>
          <DialogDescription>
            Complete los datos de la orden de pautado para la oportunidad "{opportunity.title}".
          </DialogDescription>
        </DialogHeader>
        <div className="max-h-[70vh] overflow-y-auto pr-4 -mr-4 grid gap-4 py-4">
            {/* Header Section */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 border-b pb-4">
                <div className="space-y-2">
                    <Label>Fecha</Label>
                    <Input type="date" name="fecha" value={formData.fecha || ''} onChange={handleChange} />
                </div>
                 <div className="space-y-2">
                    <Label>Nº de OM</Label>
                    <Input name="numeroOM" value={formData.numeroOM || ''} onChange={handleChange} />
                </div>
                 <div className="flex items-center gap-4 pt-6">
                    <div className="flex items-center space-x-2">
                        <Checkbox id="ajustaPorInflacion" name="ajustaPorInflacion" checked={formData.ajustaPorInflacion} onCheckedChange={(checked) => setFormData(p => ({...p, ajustaPorInflacion: !!checked}))} />
                        <Label htmlFor="ajustaPorInflacion" className="font-normal">Ajusta por inflación</Label>
                    </div>
                     <Input name="tipoAjuste" placeholder="Tipo de ajuste" value={formData.tipoAjuste || ''} onChange={handleChange} className="flex-1" />
                </div>
            </div>

            {/* Client and Seller Section */}
             <div className="grid grid-cols-1 md:grid-cols-2 gap-4 border-b pb-4">
                 <div className="space-y-4">
                     <div className="grid grid-cols-2 gap-2">
                        <Input name="cuit" placeholder="CUIT" value={formData.cuit || ''} onChange={handleChange} />
                        <Input name="denominacionComercial" placeholder="Denominación comercial" value={formData.denominacionComercial || ''} onChange={handleChange} />
                    </div>
                    <Input name="razonSocial" placeholder="Apellido y Nombre o Razón Social" value={formData.razonSocial || ''} onChange={handleChange} />
                 </div>
                  <div className="space-y-4">
                     <div className="grid grid-cols-2 gap-2">
                        <Input name="vendedor" placeholder="Nombre del vendedor" value={formData.vendedor || ''} onChange={handleChange} />
                        <Input name="rubro" placeholder="Rubro/Sector" value={formData.rubro || ''} onChange={handleChange} />
                    </div>
                     <div className="flex items-center gap-2 p-2 bg-muted rounded-md">
                        <Label className="font-bold">TOTAL</Label>
                        <Input name="total" type="number" placeholder="Total" value={formData.total?.toString() || ''} onChange={handleChange} className="text-right font-bold"/>
                    </div>
                 </div>
             </div>

            {/* AIRE SRL Section */}
            <div className="space-y-4 border-b pb-4">
                <h3 className="font-bold text-lg">AIRE SRL</h3>
                 <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4">
                    <Input name="srl_inicio" type="date" placeholder="Inicio" />
                    <Input name="srl_fin" type="date" placeholder="Fin" />
                    <Input name="srl_dias" type="number" placeholder="Días" />
                     <div className="flex items-center space-x-2">
                        <Checkbox id="srl_enviaMaterial" />
                        <Label htmlFor="srl_enviaMaterial" className="font-normal">Envía material</Label>
                    </div>
                     <div className="flex items-center space-x-2">
                        <Checkbox id="srl_solicitaCertificacion" />
                        <Label htmlFor="srl_solicitaCertificacion" className="font-normal">Solicita certificación</Label>
                    </div>
                 </div>
                 <Textarea placeholder="Observaciones Generales (objetivo del cliente, indicaciones, etc.)" />
                 <Textarea placeholder="Grilla de Programa, Tipo de Aviso, etc." rows={6} />
            </div>

            {/* AIRE SAS Section */}
            <div className="space-y-4">
                 <h3 className="font-bold text-lg">AIRE SAS</h3>
                 <Textarea placeholder="Grilla de Formato, Tipo, Detalle, etc." rows={6} />
                 <div className="flex justify-end">
                    <div className="w-full md:w-1/2 lg:w-1/3 space-y-2">
                         <div className="flex items-center gap-2">
                            <Label className="w-24">SUBTOTAL</Label>
                            <Input type="number" className="text-right" />
                        </div>
                        <div className="flex items-center gap-2">
                            <Label className="w-24">BON. GRAL</Label>
                            <Input type="number" className="text-right" />
                        </div>
                         <div className="flex items-center gap-2">
                            <Label className="w-24">TOTAL</Label>
                            <Input type="number" className="text-right font-bold" />
                        </div>
                        <div className="flex items-center gap-2">
                            <Label className="w-24">IVA (5%)</Label>
                            <Input type="number" className="text-right" />
                        </div>
                         <div className="flex items-center gap-2">
                            <Label className="w-24 font-bold">IMP. A</Label>
                            <Input type="number" className="text-right font-bold" />
                        </div>
                    </div>
                 </div>
            </div>

        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleSave}>Guardar Orden</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
