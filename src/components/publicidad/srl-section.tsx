// src/components/publicidad/srl-section.tsx

"use client";

import { useFieldArray, UseFormReturn, useWatch } from "react-hook-form";
import { format, eachMonthOfInterval, endOfMonth, eachDayOfInterval, startOfMonth, getDay } from "date-fns";
import { es } from "date-fns/locale";
import { Plus, Trash2 } from "lucide-react";
import { useEffect } from "react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { FormControl, FormField } from "@/components/ui/form";
import { Checkbox } from "@/components/ui/checkbox";
import { srlAdTypes, AdvertisingOrderFormValues } from "@/lib/validators/advertising";

interface Program {
    id: string;
    name: string;
    schedules?: {
        daysOfWeek: number[]; 
        startTime: string;
        endTime: string;
    }[];
    rates?: {
        spotRadio?: number;
        spotTv?: number;
        pnt?: number;
        pntMasBarrida?: number;
        auspicio?: number;
        notaComercial?: number;
        [key: string]: number | undefined;
    }
}

interface SrlSectionProps {
  form: UseFormReturn<AdvertisingOrderFormValues>;
  startDate: Date;
  endDate: Date;
  programs: Program[]; 
}

export function SrlSection({ form, startDate, endDate, programs }: SrlSectionProps) {
  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "srlItems",
  });

  const items = useWatch({ control: form.control, name: "srlItems" });

  useEffect(() => {
     items?.forEach((item, index) => {
         if (!item.programId || !item.adType) return;
         if (item.programId === "Personalizado") return; // Si es personalizado, no forzamos tarifa automática
         
         const program = programs.find(p => p.id === item.programId);
         if (!program || !program.rates) return;

         let rate = 0;
         const hasTv = item.hasTv;

         if (item.adType === "Spot") rate = hasTv ? (program.rates.spotTv || 0) : (program.rates.spotRadio || 0);
         else if (item.adType === "PNT") rate = hasTv ? (program.rates.pntMasBarrida || 0) : (program.rates.pnt || 0);
         else {
             const keyMap: Record<string, string> = { "Auspicio": "auspicio", "Nota Comercial": "notaComercial" };
             const rateKey = keyMap[item.adType];
             if (rateKey) rate = program.rates[rateKey] || 0;
         }

         if (form.getValues(`srlItems.${index}.unitRate`) !== rate && rate > 0) {
             form.setValue(`srlItems.${index}.unitRate`, rate);
         }
     });
  }, [items, programs, form]);

  if (!startDate || !endDate) return null;

  const months = eachMonthOfInterval({ start: startDate, end: endDate });

  const subtotal = items?.reduce((acc, item) => {
    const dailySpots = item.dailySpots || {};
    const totalAds = Object.values(dailySpots).reduce((sum, val) => sum + (Number(val) || 0), 0);
    const multiplier = item.adType === "Spot" ? (item.seconds || 0) : 1;
    return acc + ((item.unitRate || 0) * totalAds * multiplier);
  }, 0) || 0;

  const adjustment = form.watch("adjustmentSrl") || 0;
  const totalToInvoice = subtotal - adjustment;
  const agencyCommissionPct = form.watch("commissionSrl") || 0;
  const agencyAmount = form.watch("agencySale") ? (totalToInvoice * (agencyCommissionPct / 100)) : 0;
  const netAction = totalToInvoice - agencyAmount;

  return (
    <div className="space-y-12">
      {months.map((monthDate) => {
        const monthKey = format(monthDate, "yyyy-MM");
        const monthStart = startOfMonth(monthDate);
        const monthEnd = endOfMonth(monthDate);
        const effectiveStart = monthStart < startDate ? startDate : monthStart;
        const effectiveEnd = monthEnd > endDate ? endDate : monthEnd;
        const days = eachDayOfInterval({ start: effectiveStart, end: effectiveEnd });

        return (
          <div key={monthKey} className="border rounded-md shadow-sm overflow-hidden bg-white mb-6">
            <div className="bg-slate-200 px-4 py-2 flex justify-between items-center">
                <span className="font-bold text-slate-700">{format(monthDate, "MMMM yyyy", { locale: es }).toUpperCase()}</span>
                <Button type="button" variant="outline" size="sm" onClick={() => append({ month: monthKey, programId: "", adType: "Spot", hasTv: false, unitRate: 0, seconds: 0, dailySpots: {} })}>
                    <Plus className="mr-2 h-4 w-4" /> Agregar Fila
                </Button>
            </div>
            <div className="overflow-x-auto">
              <Table className="min-w-[1200px] border-collapse">
                <TableHeader>
                  <TableRow className="bg-slate-100 border-b border-slate-300">
                    <TableHead className="w-[200px] border-r border-slate-300 font-bold text-slate-700">Programa</TableHead>
                    <TableHead className="w-[120px] border-r border-slate-300 font-bold text-slate-700">Tipo Aviso</TableHead>
                    <TableHead className="w-[50px] text-center border-r border-slate-300 font-bold text-slate-700" title="Lleva Barrida TV">TV</TableHead>
                    <TableHead className="w-[80px] border-r border-slate-300 font-bold text-slate-700"># Seg</TableHead>
                    {days.map(day => (
                      <TableHead key={day.toISOString()} className="w-[35px] p-0 text-center border-r border-slate-300 bg-slate-200">
                        <div className="flex flex-col items-center justify-center h-full py-1">
                             <span className="text-[11px] font-bold text-slate-800 leading-none">{format(day, "d")}</span>
                             <span className="text-[9px] text-slate-500 leading-none">{format(day, "EEEEE", { locale: es })}</span>
                        </div>
                      </TableHead>
                    ))}
                    <TableHead className="w-[60px] text-center font-bold text-xs border-r border-slate-300">Cant.</TableHead>
                    <TableHead className="w-[100px] text-right font-bold text-xs border-r border-slate-300">Tarifa</TableHead>
                    <TableHead className="w-[110px] text-right font-bold text-xs">Neto</TableHead>
                    <TableHead className="w-[40px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {fields.map((field, index) => {
                    const itemValues = items?.[index];
                    if (!itemValues || itemValues.month !== monthKey) return null;

                    // 🟢 NUEVO: Verificamos si el programa está seleccionado
                    const isProgramSelected = !!itemValues.programId && itemValues.programId !== "";
                    
                    const isCustom = itemValues.programId === "Personalizado";
                    const currentProgram = programs.find(p => p.id === itemValues.programId);
                    const validDays = new Set<number>();
                    if (currentProgram?.schedules) {
                        currentProgram.schedules.forEach(schedule => {
                            schedule.daysOfWeek.forEach(day => validDays.add(day));
                        });
                    }
                    
                    const hasRestrictions = !isCustom && validDays.size > 0;

                    const adType = itemValues.adType;
                    const enableTv = adType === "Spot" || adType === "PNT";
                    const currentDailySpots = itemValues.dailySpots || {};
                    const currentSeconds = itemValues.seconds || 0;
                    const currentUnitRate = itemValues.unitRate || 0;
                    const totalAdsGlobal = Object.values(currentDailySpots).reduce((sum, val) => sum + (Number(val) || 0), 0);
                    const totalSecondsGlobal = adType === "Spot" ? (totalAdsGlobal * currentSeconds) : 0;
                    const netAmountGlobal = currentUnitRate * totalAdsGlobal * (adType === "Spot" ? currentSeconds : 1);

                    return (
                      <TableRow key={field.id} className="border-b border-slate-300 hover:bg-slate-50">
                        <TableCell className="p-1 border-r border-slate-300">
                            <FormField control={form.control} name={`srlItems.${index}.programId`} render={({ field }) => (
                                <Select onValueChange={(val) => {
                                    field.onChange(val);
                                    if (val === "Personalizado") form.setValue(`srlItems.${index}.adType`, "Personalizado");
                                }} value={field.value || undefined}>
                                    <SelectTrigger className="h-8 text-xs border-0 shadow-none focus:ring-1"><SelectValue placeholder="Programa" /></SelectTrigger>
                                    <SelectContent>
                                        {programs.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                                        <SelectItem value="Personalizado" className="font-bold text-blue-600">Personalizado</SelectItem>
                                    </SelectContent>
                                </Select>
                            )} />
                        </TableCell>
                        <TableCell className="p-1 border-r border-slate-300">
                            {isCustom || itemValues.adType === "Personalizado" ? (
                                <FormField control={form.control} name={`srlItems.${index}.customType`} render={({ field }) => (
                                    <Input {...field} className="h-8 text-xs px-2" placeholder="Describir tipo..." />
                                )} />
                            ) : (
                                <FormField control={form.control} name={`srlItems.${index}.adType`} render={({ field }) => (
                                    <Select onValueChange={field.onChange} value={field.value}>
                                        <SelectTrigger className="h-8 text-xs border-0 shadow-none focus:ring-1"><SelectValue /></SelectTrigger>
                                        <SelectContent>{srlAdTypes.filter(t => t !== "Personalizado").map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                                    </Select>
                                )} />
                            )}
                        </TableCell>
                        <TableCell className="p-1 text-center border-r border-slate-300">
                            <FormField control={form.control} name={`srlItems.${index}.hasTv`} render={({ field }) => (<Checkbox checked={field.value} onCheckedChange={field.onChange} disabled={!enableTv && !isCustom} className="h-4 w-4 mx-auto" />)} />
                        </TableCell>
                        <TableCell className="p-1 border-r border-slate-300">
                            {(adType === "Spot" || isCustom) && (<FormField control={form.control} name={`srlItems.${index}.seconds`} render={({ field }) => (<Input type="number" className="h-8 w-full text-center px-1 text-xs border-0 shadow-none focus-visible:ring-1" {...field} onChange={e => field.onChange(parseFloat(e.target.value) || 0)} />)} />)}
                        </TableCell>
                        
                        {days.map(day => {
                            const dateKey = format(day, "yyyy-MM-dd");
                            const jsDay = getDay(day);
                            const isoDay = jsDay === 0 ? 7 : jsDay; 
                            
                            // 🟢 NUEVO: Si no hay programa, se bloquea. Si hay programa, respeta las restricciones de días.
                            const isBlocked = !isProgramSelected || (hasRestrictions && !validDays.has(isoDay));
                            
                            return (
                                <TableCell key={dateKey} className={cn("p-0 border-r border-slate-300", isBlocked ? "bg-slate-200" : "bg-white")}>
                                    <FormField control={form.control} name={`srlItems.${index}.dailySpots.${dateKey}`} render={({ field }) => (
                                            <Input 
                                                type="text" 
                                                disabled={isBlocked} 
                                                title={!isProgramSelected ? "Debes seleccionar un programa primero" : ""}
                                                className={cn(
                                                    "h-8 w-full px-0 text-center border-none focus-visible:ring-1 focus-visible:ring-inset text-xs rounded-none", 
                                                    field.value ? "bg-blue-100 font-bold text-blue-800" : "text-gray-400 hover:bg-slate-50", 
                                                    isBlocked && "cursor-not-allowed bg-transparent text-transparent hover:bg-transparent placeholder:text-transparent"
                                                )} 
                                                value={field.value || ""} 
                                                onChange={e => { const val = parseInt(e.target.value); field.onChange(isNaN(val) ? 0 : val); }} 
                                            />
                                    )} />
                                </TableCell>
                            );
                        })}

                        <TableCell className="text-center font-bold text-xs border-r border-slate-300 bg-slate-50">{totalAdsGlobal}</TableCell>
                        <TableCell className="p-1 border-r border-slate-300">
                            <FormField control={form.control} name={`srlItems.${index}.unitRate`} render={({ field }) => (
                                <Input type="number" className="h-8 text-right px-2 text-xs border-0 shadow-none bg-transparent" readOnly={!isCustom} {...field} onChange={e => field.onChange(parseFloat(e.target.value) || 0)} />
                            )} />
                        </TableCell>
                        <TableCell className="text-right font-bold text-slate-800 text-xs pr-2 bg-slate-50 border-r border-slate-300">${netAmountGlobal.toLocaleString("es-AR")}</TableCell>
                        <TableCell className="text-center">
                            <Button type="button" variant="ghost" size="icon" className="h-8 w-8 text-red-500 hover:text-red-700 hover:bg-red-50" onClick={() => remove(index)}><Trash2 className="h-4 w-4" /></Button>
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
      
      <div className="flex justify-end mt-4">
        <div className="w-full max-w-2xl bg-slate-50 p-4 rounded-lg border grid grid-cols-2 gap-x-8 gap-y-2 shadow-sm">
            <div className="flex justify-between items-center text-sm"><span className="font-bold text-slate-600">Subtotal:</span><span className="bg-slate-800 text-white px-2 py-1 rounded font-mono font-bold">${subtotal.toLocaleString("es-AR")}</span></div>
             <div className="flex justify-between items-center text-sm"><span className="font-bold text-slate-600">Desajuste:</span><div className="w-32"><FormField control={form.control} name="adjustmentSrl" render={({ field }) => (<Input type="number" className="h-8 text-right font-mono" {...field} onChange={e => field.onChange(parseFloat(e.target.value) || 0)} />)} /></div></div>
             <div className="flex justify-between items-center text-sm col-span-2 border-t border-slate-300 pt-2 mt-2"><span className="font-bold text-slate-800">Total a Facturar:</span><span className="bg-yellow-400 text-black px-2 py-1 rounded font-mono font-bold text-lg border border-yellow-500">${totalToInvoice.toLocaleString("es-AR")}</span></div>
             <div className="flex justify-between items-center text-sm text-slate-500"><span>Agencia ({agencyCommissionPct}%):</span><span className="font-mono">${agencyAmount.toLocaleString("es-AR")}</span></div>
             <div className="flex justify-between items-center text-sm"><span className="font-bold text-slate-800">Neto de Acción:</span><span className="bg-green-600 text-white px-2 py-1 rounded font-mono font-bold">${netAction.toLocaleString("es-AR")}</span></div>
        </div>
      </div>
    </div>
  );
}
