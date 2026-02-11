"use client";

import { useFieldArray, UseFormReturn } from "react-hook-form";
import { format, eachMonthOfInterval, endOfMonth, eachDayOfInterval, startOfMonth, isSameMonth } from "date-fns";
import { es } from "date-fns/locale";
import { Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { FormControl, FormField, FormItem } from "@/components/ui/form";
import { srlAdTypes, AdvertisingOrderFormValues } from "@/lib/validators/advertising";

// Importar lista de programas desde tus datos (mock)
const PROGRAMS = [
  { id: "p1", name: "Ahora Vengo" },
  { id: "p2", name: "Creo" },
  { id: "p3", name: "Pasan Cosas" },
  { id: "p4", name: "Dale Tomá Aire" },
];

interface SrlSectionProps {
  form: UseFormReturn<AdvertisingOrderFormValues>;
  startDate: Date;
  endDate: Date;
}

export function SrlSection({ form, startDate, endDate }: SrlSectionProps) {
  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "srlItems",
  });

  const months = eachMonthOfInterval({ start: startDate, end: endDate });

  // Cálculos de Totales
  const items = form.watch("srlItems");
  const subtotal = items.reduce((acc, item) => {
    // Calculo Neto por item
    // Spot: unitRate * totalAds * seconds
    // Otro: unitRate * totalAds
    const dailySpots = item.dailySpots || {};
    const totalAds = Object.values(dailySpots).reduce((sum, val) => sum + (val || 0), 0);
    const multiplier = item.adType === "Spot" ? (item.seconds || 0) : 1;
    const net = (item.unitRate || 0) * totalAds * multiplier;
    return acc + net;
  }, 0);

  const adjustment = form.watch("adjustmentSrl") || 0;
  const totalToInvoice = subtotal - adjustment;
  
  const agencyCommissionPct = form.watch("commissionSrl") || 0;
  const agencyAmount = form.watch("agencySale") ? (totalToInvoice * (agencyCommissionPct / 100)) : 0;
  const netAction = totalToInvoice - agencyAmount;

  return (
    <div className="space-y-8">
      
      {/* Botón para agregar renglones (Programas) */}
      <div className="flex justify-end">
        <Button 
            type="button" 
            variant="secondary" 
            onClick={() => append({ 
                programId: "", 
                adType: "Spot", 
                unitRate: 0, 
                seconds: 0, 
                dailySpots: {} 
            })}
        >
          <Plus className="mr-2 h-4 w-4" /> Agregar Programa
        </Button>
      </div>

      {/* Renderizado de Tablas por Mes */}
      {months.map((monthDate) => {
        const monthStart = startOfMonth(monthDate);
        const monthEnd = endOfMonth(monthDate);
        
        // Ajustar el rango del mes para no exceder las fechas globales seleccionadas
        const effectiveStart = monthStart < startDate ? startDate : monthStart;
        const effectiveEnd = monthEnd > endDate ? endDate : monthEnd;

        const days = eachDayOfInterval({ start: effectiveStart, end: effectiveEnd });

        return (
          <div key={monthDate.toString()} className="border rounded-md shadow-sm overflow-hidden bg-white">
            <div className="bg-slate-200 px-4 py-2 font-bold text-slate-700">
              {format(monthDate, "MMMM yyyy", { locale: es }).toUpperCase()}
            </div>
            <div className="overflow-x-auto">
              <Table className="min-w-[1200px]">
                <TableHeader>
                  <TableRow className="bg-slate-50">
                    <TableHead className="w-[200px]">Programa</TableHead>
                    <TableHead className="w-[150px]">Tipo Aviso</TableHead>
                    <TableHead className="w-[80px]"># Seg</TableHead>
                    
                    {/* Días del mes */}
                    {days.map(day => (
                      <TableHead key={day.toISOString()} className="w-[40px] p-1 text-center text-xs">
                        <div className="font-bold">{format(day, "d")}</div>
                        <div className="text-[10px] text-muted-foreground">{format(day, "EEEEE", { locale: es })}</div>
                      </TableHead>
                    ))}

                    <TableHead className="w-[80px] text-center font-bold">Tot. Avisos</TableHead>
                    <TableHead className="w-[80px] text-center font-bold">Tot. Seg</TableHead>
                    <TableHead className="w-[100px] text-right">Tarifa Un.</TableHead>
                    <TableHead className="w-[120px] text-right font-bold">Importe Neto</TableHead>
                    <TableHead className="w-[50px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {fields.map((field, index) => {
                    // Watch values for conditional rendering per row
                    const adType = items[index]?.adType;
                    const seconds = items[index]?.seconds || 0;
                    const unitRate = items[index]?.unitRate || 0;
                    const dailySpots = items[index]?.dailySpots || {};
                    
                    // Calculate row totals (Specific to THIS month range? Usually totals are global or per row? 
                    // Based on "Total de avisos: recuento de los números colocados en los días" 
                    // and usually users want to see the total order value. 
                    // I will show totals for the WHOLE order on the row, or just for this month?
                    // Given the design splits by month, usually the "Importe Neto" row is the sum of the line.
                    // Let's assume the row represents the whole line item, so we show cumulative totals).
                    
                    const totalAdsGlobal = Object.values(dailySpots).reduce((sum, val) => sum + (val || 0), 0);
                    const totalSecondsGlobal = adType === "Spot" ? (totalAdsGlobal * seconds) : 0;
                    const netAmountGlobal = unitRate * totalAdsGlobal * (adType === "Spot" ? seconds : 1);

                    return (
                      <TableRow key={field.id}>
                        {/* Programa */}
                        <TableCell className="p-2">
                           <FormField
                            control={form.control}
                            name={`srlItems.${index}.programId`}
                            render={({ field }) => (
                                <Select onValueChange={field.onChange} value={field.value}>
                                    <SelectTrigger className="h-8">
                                        <SelectValue placeholder="Prog." />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {PROGRAMS.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                                    </SelectContent>
                                </Select>
                            )}
                          />
                        </TableCell>

                        {/* Tipo Aviso */}
                        <TableCell className="p-2">
                           <FormField
                            control={form.control}
                            name={`srlItems.${index}.adType`}
                            render={({ field }) => (
                                <Select onValueChange={field.onChange} value={field.value}>
                                    <SelectTrigger className="h-8">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {srlAdTypes.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                                    </SelectContent>
                                </Select>
                            )}
                          />
                        </TableCell>

                        {/* Segundos (Condicional) */}
                        <TableCell className="p-2">
                           {adType === "Spot" && (
                            <FormField
                                control={form.control}
                                name={`srlItems.${index}.seconds`}
                                render={({ field }) => (
                                <Input 
                                    type="number" 
                                    className="h-8 w-16 text-center" 
                                    {...field} 
                                    onChange={e => field.onChange(parseFloat(e.target.value) || 0)}
                                />
                                )}
                            />
                           )}
                        </TableCell>

                        {/* Días Inputs */}
                        {days.map(day => {
                            const dateKey = format(day, "yyyy-MM-dd");
                            return (
                                <TableCell key={dateKey} className="p-1">
                                    <FormField
                                        control={form.control}
                                        name={`srlItems.${index}.dailySpots.${dateKey}`}
                                        render={({ field }) => (
                                            <Input 
                                                type="text" // text to allow empty
                                                className={cn(
                                                    "h-8 w-8 px-1 text-center transition-colors",
                                                    field.value ? "bg-blue-50 font-bold border-blue-200" : "text-gray-400"
                                                )}
                                                value={field.value || ""} 
                                                onChange={e => {
                                                    const val = parseInt(e.target.value);
                                                    field.onChange(isNaN(val) ? 0 : val);
                                                }}
                                            />
                                        )}
                                    />
                                </TableCell>
                            );
                        })}

                        {/* Totales Row */}
                        <TableCell className="text-center font-medium">{totalAdsGlobal}</TableCell>
                        <TableCell className="text-center text-muted-foreground">{totalSecondsGlobal > 0 ? totalSecondsGlobal : "-"}</TableCell>
                        <TableCell className="p-2">
                            <FormField
                                control={form.control}
                                name={`srlItems.${index}.unitRate`}
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
                             ${netAmountGlobal.toLocaleString("es-AR")}
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
          </div>
        );
      })}

      {/* FOOTER TOTALES SRL */}
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
                        name="adjustmentSrl"
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
