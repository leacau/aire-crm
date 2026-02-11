"use client";

import { useFieldArray, UseFormReturn } from "react-hook-form";
import { Plus, Trash2 } from "lucide-react";
import { useEffect } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { FormControl, FormField, FormItem } from "@/components/ui/form";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { sasFormats, AdvertisingOrderFormValues } from "@/lib/validators/advertising";

interface SasSectionProps {
  form: UseFormReturn<AdvertisingOrderFormValues>;
}

export function SasSection({ form }: SasSectionProps) {
  const { fields, append, remove, update } = useFieldArray({
    control: form.control,
    name: "sasItems",
  });

  const items = form.watch("sasItems");

  // Totales SAS
  const subtotal = items.reduce((acc, item) => {
    let net = 0;
    if (item.format === "Banner") {
        net = (item.cpm || 0) * (item.unitRate || 0);
    } else {
        net = (item.unitRate || 0);
    }
    return acc + net;
  }, 0);

  const adjustment = form.watch("adjustmentSas") || 0;
  const taxableBase = subtotal - adjustment;
  const ivaAmount = taxableBase * 0.05; // 5% IVA
  const totalToInvoice = taxableBase + ivaAmount;
  
  const agencyCommissionPct = form.watch("commissionSrl") || 0; // Se usa la misma comisión definida arriba? Asumo que sí o hereda.
  const agencyAmount = form.watch("agencySale") ? (totalToInvoice * (agencyCommissionPct / 100)) : 0;
  const netAction = totalToInvoice - agencyAmount;

  // Lógica de Opciones Dinámicas
  const getTypeOptions = (format: string) => {
    switch (format) {
        case "Banner": return ["Display_tradicional", "RichMedia"];
        case "Nota_Web": return ["Nota_Patrocinada_en_web", "Nota_patrocinada_en_web_con_video", "Gacetilla_de_prensa_enviada_por_la_empresa"];
        case "Redes": return ["Reel", "Historia", "Carrusel"];
        default: return [];
    }
  };

  const getDetailOptions = (format: string, type: string) => {
      if (format === "Banner" && type === "Display_tradicional") return ["Banner 300 x 250", "Banner 300 x 600", "Banner 728 x 90", "Banner 970 x 200", "TopsiteBanner 300 x 600"];
      if (format === "Banner" && type === "RichMedia") return ["Anuncio Previo (ITT)", "Zocalo", "Banner shopping (300*250)", "Banner shopping (300*600)", "Banner Full screen video"];
      if (format === "Redes" && type === "Reel") return ["creador AIRE", "creador Cliente"];
      return [];
  };

  return (
    <div className="space-y-4">
        <div className="flex justify-end">
            <Button 
                type="button" 
                variant="secondary" 
                onClick={() => append({ format: "Banner", unitRate: 0, desktop: false, mobile: false, home: false, interiores: false })}
            >
                <Plus className="mr-2 h-4 w-4" /> Agregar Formato
            </Button>
        </div>

        <div className="rounded-md border overflow-x-auto">
            <Table className="min-w-[1200px]">
                <TableHeader>
                    <TableRow className="bg-slate-100">
                        <TableHead className="w-[120px]">Formato</TableHead>
                        <TableHead className="w-[150px]">Tipo</TableHead>
                        <TableHead className="w-[180px]">Detalle</TableHead>
                        <TableHead className="w-[200px]">Observaciones</TableHead>
                        <TableHead className="w-[40px] text-center" title="Desktop">D</TableHead>
                        <TableHead className="w-[40px] text-center" title="Mobile">M</TableHead>
                        <TableHead className="w-[40px] text-center" title="Home">H</TableHead>
                        <TableHead className="w-[40px] text-center" title="Interiores">I</TableHead>
                        <TableHead className="w-[100px] text-right">CPM</TableHead>
                        <TableHead className="w-[150px]">URL</TableHead>
                        <TableHead className="w-[100px] text-right">Tarifa Un.</TableHead>
                        <TableHead className="w-[100px] text-right font-bold">Neto</TableHead>
                        <TableHead className="w-[50px]"></TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {fields.map((field, index) => {
                        const item = items[index];
                        const typeOptions = getTypeOptions(item.format);
                        const detailOptions = getDetailOptions(item.format, item.type || "");
                        
                        // Importe Neto calculation for display
                        let rowNet = 0;
                        if (item.format === "Banner") {
                            rowNet = (item.cpm || 0) * (item.unitRate || 0);
                        } else {
                            rowNet = (item.unitRate || 0);
                        }

                        return (
                            <TableRow key={field.id}>
                                <TableCell>
                                    <FormField
                                        control={form.control}
                                        name={`sasItems.${index}.format`}
                                        render={({ field }) => (
                                            <Select onValueChange={(val) => {
                                                field.onChange(val);
                                                // Reset dependent fields
                                                form.setValue(`sasItems.${index}.type`, undefined);
                                                form.setValue(`sasItems.${index}.detail`, undefined);
                                            }} value={field.value}>
                                                <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                                                <SelectContent>
                                                    {sasFormats.map(f => <SelectItem key={f} value={f}>{f}</SelectItem>)}
                                                </SelectContent>
                                            </Select>
                                        )}
                                    />
                                </TableCell>
                                <TableCell>
                                    <FormField
                                        control={form.control}
                                        name={`sasItems.${index}.type`}
                                        render={({ field }) => (
                                            <Select 
                                                onValueChange={(val) => {
                                                     field.onChange(val);
                                                     form.setValue(`sasItems.${index}.detail`, undefined);
                                                }} 
                                                value={field.value} 
                                                disabled={typeOptions.length === 0}
                                            >
                                                <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                                                <SelectContent>
                                                    {typeOptions.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                                                </SelectContent>
                                            </Select>
                                        )}
                                    />
                                </TableCell>
                                <TableCell>
                                    <FormField
                                        control={form.control}
                                        name={`sasItems.${index}.detail`}
                                        render={({ field }) => (
                                             <Select onValueChange={field.onChange} value={field.value} disabled={detailOptions.length === 0}>
                                                <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                                                <SelectContent>
                                                    {detailOptions.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                                                </SelectContent>
                                            </Select>
                                        )}
                                    />
                                </TableCell>
                                <TableCell>
                                    <FormField
                                        control={form.control}
                                        name={`sasItems.${index}.observations`}
                                        render={({ field }) => (
                                            <Textarea {...field} className="h-8 min-h-[32px] p-1 text-xs" />
                                        )}
                                    />
                                </TableCell>
                                {/* Checkboxes */}
                                <TableCell className="text-center"><FormField control={form.control} name={`sasItems.${index}.desktop`} render={({field}) => <Checkbox checked={field.value} onCheckedChange={field.onChange} />}/></TableCell>
                                <TableCell className="text-center"><FormField control={form.control} name={`sasItems.${index}.mobile`} render={({field}) => <Checkbox checked={field.value} onCheckedChange={field.onChange} />}/></TableCell>
                                <TableCell className="text-center"><FormField control={form.control} name={`sasItems.${index}.home`} render={({field}) => <Checkbox checked={field.value} onCheckedChange={field.onChange} />}/></TableCell>
                                <TableCell className="text-center"><FormField control={form.control} name={`sasItems.${index}.interiores`} render={({field}) => <Checkbox checked={field.value} onCheckedChange={field.onChange} />}/></TableCell>
                                
                                <TableCell>
                                    <FormField
                                        control={form.control}
                                        name={`sasItems.${index}.cpm`}
                                        render={({ field }) => (
                                            <Input 
                                                type="number" 
                                                className="h-8 text-right" 
                                                disabled={item.format !== "Banner"}
                                                {...field}
                                                onChange={e => field.onChange(parseFloat(e.target.value) || 0)}
                                            />
                                        )}
                                    />
                                </TableCell>
                                <TableCell>
                                    <FormField
                                        control={form.control}
                                        name={`sasItems.${index}.url`}
                                        render={({ field }) => (
                                            <Input className="h-8" placeholder="https://..." {...field} />
                                        )}
                                    />
                                </TableCell>
                                <TableCell>
                                    <FormField
                                        control={form.control}
                                        name={`sasItems.${index}.unitRate`}
                                        render={({ field }) => (
                                            <Input 
                                                type="number" 
                                                className="h-8 text-right" 
                                                {...field}
                                                onChange={e => field.onChange(parseFloat(e.target.value) || 0)}
                                            />
                                        )}
                                    />
                                </TableCell>
                                <TableCell className="text-right font-bold text-slate-700">
                                    ${rowNet.toLocaleString("es-AR")}
                                </TableCell>
                                <TableCell>
                                    <Button type="button" variant="ghost" size="icon" className="h-8 w-8 text-red-500 hover:text-red-700" onClick={() => remove(index)}>
                                        <Trash2 className="h-4 w-4" />
                                    </Button>
                                </TableCell>
                            </TableRow>
                        );
                    })}
                </TableBody>
            </Table>
        </div>

        {/* FOOTER TOTALES SAS */}
        <div className="flex justify-end mt-4">
            <div className="w-full max-w-2xl bg-slate-50 p-4 rounded-lg border grid grid-cols-2 gap-x-8 gap-y-2">
                <div className="flex justify-between items-center text-sm">
                    <span className="font-bold">Subtotal:</span>
                    <span className="bg-red-600 text-white px-2 py-1 rounded font-mono font-bold">
                        ${subtotal.toLocaleString("es-AR")}
                    </span>
                </div>
                <div className="flex justify-between items-center text-sm">
                    <span className="font-bold">Desajuste:</span>
                    <div className="w-32">
                         <FormField
                            control={form.control}
                            name="adjustmentSas"
                            render={({ field }) => (
                                <Input 
                                    type="number" 
                                    className="h-8 text-right"
                                    {...field} 
                                    onChange={e => field.onChange(parseFloat(e.target.value) || 0)}
                                />
                            )}
                        />
                    </div>
                </div>
                <div className="flex justify-between items-center text-sm text-muted-foreground">
                    <span>IVA 5%:</span>
                    <span>${ivaAmount.toLocaleString("es-AR")}</span>
                </div>
                <div className="flex justify-between items-center text-sm col-span-2 border-t pt-2 mt-2">
                    <span className="font-bold">Total a Facturar:</span>
                    <span className="bg-yellow-400 text-black px-2 py-1 rounded font-mono font-bold text-lg">
                        ${totalToInvoice.toLocaleString("es-AR")}
                    </span>
                </div>
                 <div className="flex justify-between items-center text-sm text-muted-foreground">
                    <span>Agencia ({agencyCommissionPct}%):</span>
                    <span>${agencyAmount.toLocaleString("es-AR")}</span>
                </div>
                <div className="flex justify-between items-center text-sm">
                    <span className="font-bold">Neto de Acción:</span>
                    <span className="bg-green-600 text-white px-2 py-1 rounded font-mono font-bold">
                        ${netAction.toLocaleString("es-AR")}
                    </span>
                </div>
            </div>
        </div>
    </div>
  );
}
