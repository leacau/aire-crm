"use client";

import { useFieldArray, UseFormReturn } from "react-hook-form";
import { format, eachMonthOfInterval, startOfMonth, endOfMonth, addMonths, isBefore } from "date-fns";
import { es } from "date-fns/locale";
import { Plus, Trash2, Copy } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { FormControl, FormField } from "@/components/ui/form";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { sasFormats, AdvertisingOrderFormValues } from "@/lib/validators/advertising";
import { useToast } from "@/hooks/use-toast";

interface SasSectionProps {
  form: UseFormReturn<AdvertisingOrderFormValues>;
  startDate: Date;
  endDate: Date;
}

export function SasSection({ form, startDate, endDate }: SasSectionProps) {
  const { toast } = useToast();
  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "sasItems",
  });

  const items = form.watch("sasItems");

  if (!startDate || !endDate) return null;

  const months = eachMonthOfInterval({ start: startDate, end: endDate });

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
  const ivaAmount = taxableBase * 0.05; 
  const totalToInvoice = taxableBase + ivaAmount;
  
  const agencyCommissionPct = form.watch("commissionSrl") || 0; 
  const agencyAmount = form.watch("agencySale") ? (totalToInvoice * (agencyCommissionPct / 100)) : 0;
  const netAction = totalToInvoice - agencyAmount;

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

  const handleDuplicateToNextMonth = (itemIndex: number) => {
      const sourceItem = form.getValues(`sasItems.${itemIndex}`);
      if (!sourceItem || !sourceItem.month) return;

      const [year, month] = sourceItem.month.split('-');
      const currentMonthDate = new Date(parseInt(year), parseInt(month) - 1, 1);
      const nextMonthDate = addMonths(currentMonthDate, 1);
      
      if (isBefore(endDate, startOfMonth(nextMonthDate))) {
          toast({
              title: "Fuera de vigencia",
              description: "La campaña termina antes del próximo mes.",
              variant: "destructive"
          });
          return;
      }

      const nextMonthKey = format(nextMonthDate, "yyyy-MM");

      append({
          ...sourceItem,
          month: nextMonthKey,
      });

      toast({
          title: "Duplicado exitoso",
          description: `Se copió la fila a ${format(nextMonthDate, "MMMM yyyy", { locale: es })}.`
      });
  };

  return (
    <div className="space-y-12">
        {months.map((monthDate) => {
            const monthKey = format(monthDate, "yyyy-MM");

            return (
                <div key={monthKey} className="border rounded-md shadow-sm overflow-hidden bg-white mb-6">
                    <div className="bg-slate-200 px-4 py-2 flex justify-between items-center">
                        <span className="font-bold text-slate-700">{format(monthDate, "MMMM yyyy", { locale: es }).toUpperCase()}</span>
                        <Button 
                            type="button" 
                            variant="outline" 
                            size="sm"
                            onClick={() => append({ month: monthKey, format: "Banner", unitRate: 0, desktop: false, mobile: false, home: false, interiores: false })}
                        >
                            <Plus className="mr-2 h-4 w-4" /> Agregar Formato
                        </Button>
                    </div>
                    <div className="overflow-x-auto">
                        <Table className="min-w-[1200px] border-collapse">
                            <TableHeader>
                                <TableRow className="bg-slate-100 border-b border-slate-300">
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
                                    <TableHead className="w-[80px]"></TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {fields.map((field, index) => {
                                    const item = items[index];
                                    if (!item || item.month !== monthKey) return null;

                                    const isCustom = item.format === "Personalizado";
                                    const typeOptions = getTypeOptions(item.format);
                                    const detailOptions = getDetailOptions(item.format, item.type || "");
                                    
                                    let rowNet = 0;
                                    if (item.format === "Banner") {
                                        rowNet = (item.cpm || 0) * (item.unitRate || 0);
                                    } else {
                                        rowNet = (item.unitRate || 0);
                                    }

                                    return (
                                        <TableRow key={field.id} className="border-b border-slate-300 hover:bg-slate-50">
                                            <TableCell className="p-1 border-r border-slate-300">
                                                <FormField
                                                    control={form.control}
                                                    name={`sasItems.${index}.format`}
                                                    render={({ field }) => (
                                                        <Select onValueChange={(val) => {
                                                            field.onChange(val);
                                                            form.setValue(`sasItems.${index}.type`, undefined);
                                                            form.setValue(`sasItems.${index}.detail`, undefined);
                                                        }} value={field.value}>
                                                            <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                                                            <SelectContent>
                                                                {sasFormats.map(f => <SelectItem key={f} value={f}>{f}</SelectItem>)}
                                                            </SelectContent>
                                                        </Select>
                                                    )}
                                                />
                                            </TableCell>
                                            <TableCell className="p-1 border-r border-slate-300">
                                                {isCustom ? (
                                                    <span className="text-xs text-muted-foreground block text-center">-</span>
                                                ) : (
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
                                                                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                                                                <SelectContent>
                                                                    {typeOptions.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                                                                </SelectContent>
                                                            </Select>
                                                        )}
                                                    />
                                                )}
                                            </TableCell>
                                            <TableCell className="p-1 border-r border-slate-300">
                                                {isCustom ? (
                                                    <FormField
                                                        control={form.control}
                                                        name={`sasItems.${index}.customDetail`}
                                                        render={({ field }) => (
                                                            <Input {...field} className="h-8 text-xs" placeholder="Escribir detalle..." />
                                                        )}
                                                    />
                                                ) : (
                                                    <FormField
                                                        control={form.control}
                                                        name={`sasItems.${index}.detail`}
                                                        render={({ field }) => (
                                                             <Select onValueChange={field.onChange} value={field.value} disabled={detailOptions.length === 0}>
                                                                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                                                                <SelectContent>
                                                                    {detailOptions.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                                                                </SelectContent>
                                                            </Select>
                                                        )}
                                                    />
                                                )}
                                            </TableCell>
                                            <TableCell className="p-1 border-r border-slate-300">
                                                <FormField control={form.control} name={`sasItems.${index}.observations`} render={({ field }) => (<Textarea {...field} className="h-8 min-h-[32px] p-1 text-xs" />)} />
                                            </TableCell>
                                            <TableCell className="p-1 text-center border-r border-slate-300"><FormField control={form.control} name={`sasItems.${index}.desktop`} render={({field}) => <Checkbox checked={field.value} onCheckedChange={field.onChange} />}/></TableCell>
                                            <TableCell className="p-1 text-center border-r border-slate-300"><FormField control={form.control} name={`sasItems.${index}.mobile`} render={({field}) => <Checkbox checked={field.value} onCheckedChange={field.onChange} />}/></TableCell>
                                            <TableCell className="p-1 text-center border-r border-slate-300"><FormField control={form.control} name={`sasItems.${index}.home`} render={({field}) => <Checkbox checked={field.value} onCheckedChange={field.onChange} />}/></TableCell>
                                            <TableCell className="p-1 text-center border-r border-slate-300"><FormField control={form.control} name={`sasItems.${index}.interiores`} render={({field}) => <Checkbox checked={field.value} onCheckedChange={field.onChange} />}/></TableCell>
                                            
                                            <TableCell className="p-1 border-r border-slate-300">
                                                <FormField
                                                    control={form.control}
                                                    name={`sasItems.${index}.cpm`}
                                                    render={({ field }) => (
                                                        <Input type="number" className="h-8 text-right text-xs" disabled={item.format !== "Banner"} {...field} onChange={e => field.onChange(parseFloat(e.target.value) || 0)} />
                                                    )}
                                                />
                                            </TableCell>
                                            <TableCell className="p-1 border-r border-slate-300">
                                                <FormField control={form.control} name={`sasItems.${index}.url`} render={({ field }) => (<Input className="h-8 text-xs" placeholder="https://..." {...field} />)} />
                                            </TableCell>
                                            <TableCell className="p-1 border-r border-slate-300">
                                                <FormField
                                                    control={form.control}
                                                    name={`sasItems.${index}.unitRate`}
                                                    render={({ field }) => (
                                                        <Input type="number" className="h-8 text-right text-xs" {...field} onChange={e => field.onChange(parseFloat(e.target.value) || 0)} />
                                                    )}
                                                />
                                            </TableCell>
                                            <TableCell className="text-right font-bold text-slate-700 text-xs pr-2 border-r border-slate-300">
                                                ${rowNet.toLocaleString("es-AR")}
                                            </TableCell>
                                            
                                            <TableCell className="text-center p-1">
                                                <div className="flex items-center justify-center gap-1">
                                                    <Button 
                                                        type="button" 
                                                        variant="ghost" 
                                                        size="icon" 
                                                        className="h-7 w-7 text-blue-600 hover:text-blue-800 hover:bg-blue-50" 
                                                        title="Copiar pautado al mes siguiente"
                                                        onClick={() => handleDuplicateToNextMonth(index)}
                                                    >
                                                        <Copy className="h-3 w-3" />
                                                    </Button>
                                                    <Button 
                                                        type="button" 
                                                        variant="ghost" 
                                                        size="icon" 
                                                        className="h-7 w-7 text-red-500 hover:text-red-700 hover:bg-red-50" 
                                                        onClick={() => remove(index)}
                                                    >
                                                        <Trash2 className="h-3 w-3" />
                                                    </Button>
                                                </div>
                                            </TableCell>
                                        </TableRow>
                                    );
                                })}
                            </TableBody>
                        </Table>
                    </div>
                </div>
            );
        })}

        {/* 🟢 TOTALES GLOBALES SAS AL FINAL (Solo si hay items cargados) */}
        {items.length > 0 && (
            <div className="flex justify-end mt-4">
                <div className="w-full max-w-2xl bg-slate-50 p-4 rounded-lg border grid grid-cols-2 gap-x-8 gap-y-2 shadow-sm">
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
                                    <Input type="number" className="h-8 text-right font-mono" {...field} onChange={e => field.onChange(parseFloat(e.target.value) || 0)} />
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
                        <span className="bg-yellow-400 text-black px-2 py-1 rounded font-mono font-bold text-lg border border-yellow-500">
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
        )}
    </div>
  );
}
