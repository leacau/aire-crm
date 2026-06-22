"use client";

import { format, getDaysInMonth, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import { Edit3 } from "lucide-react";

import type {
  AdvertisingOrder,
  AdvertisingOrderChange,
  AdvertisingOrderFinancialSummary,
  AdvertisingOrderItemSas,
  AdvertisingOrderItemSrl,
  AdvertisingOrderRevision,
  Program,
} from "@/lib/types";
import { getAdvertisingOrderFinancialSummary } from "@/lib/advertising-order-utils";
import { Badge } from "@/components/ui/badge";

const currency = (value: number) =>
  new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    maximumFractionDigits: 2,
  }).format(value || 0);

const parseCurrency = (value: string) => {
  const normalized = value.replace(/[^\d,.-]/g, "").replace(/\./g, "").replace(",", ".");
  return Number(normalized) || 0;
};

const parseLegacySrlItem = (value?: string): AdvertisingOrderItemSrl | undefined => {
  if (!value || !value.includes("Programa ")) return undefined;
  const parts = value.split(" | ").map(part => part.trim());
  const programPart = parts.find(part => part.startsWith("Programa "));
  const ratePart = parts.find(part => part.startsWith("Tarifa "));
  const secondsPart = parts.find(part => /^\d+s$/.test(part));
  const pautaPart = parts.find(part => part.startsWith("Pauta "));
  if (!programPart) return undefined;

  const programIndex = parts.indexOf(programPart);
  const adType = parts[1] || "";
  const customType = programIndex > 2 ? parts.slice(2, programIndex).join(" | ") : undefined;
  const dailySpots: Record<string, number> = {};
  (pautaPart?.replace(/^Pauta\s*/, "").split(",") || []).forEach(entry => {
    const match = entry.trim().match(/^(\d{2})\/(\d{2})\/(\d{4}):\s*(\d+)$/);
    if (match) dailySpots[`${match[3]}-${match[2]}-${match[1]}`] = Number(match[4]);
  });

  return {
    month: parts[0] || "Mensual",
    programId: programPart.replace(/^Programa\s*/, ""),
    adType,
    customType,
    seconds: secondsPart ? Number(secondsPart.replace("s", "")) : 0,
    unitRate: ratePart ? parseCurrency(ratePart) : 0,
    dailySpots,
  };
};

const parseLegacySasItem = (value?: string): AdvertisingOrderItemSas | undefined => {
  if (!value) return undefined;
  const parts = value.split(" | ").map(part => part.trim());
  if (parts.some(part => part.startsWith("Programa "))) return undefined;
  const ratePart = parts.find(part => part.startsWith("Tarifa "));
  return {
    month: parts[0] || "Mensual",
    format: parts[1] || "",
    type: parts[2] || "",
    detail: parts[3] || "",
    unitRate: ratePart ? parseCurrency(ratePart) : 0,
  };
};

const resolveProgramName = (programId: string | undefined, programs: Program[]) =>
  programId === "Personalizado"
    ? "Personalizado"
    : programs.find(program => program.id === programId)?.name || programId || "Sin programa";

const replaceProgramIds = (value: string | undefined, programs: Program[]) => {
  if (!value) return value;
  return programs.reduce(
    (result, program) => result.replaceAll(`Programa ${program.id}`, `Programa ${program.name}`),
    value,
  );
};

const getSrlValue = (
  change: AdvertisingOrderChange,
  side: "before" | "after",
) => {
  const structured = side === "before" ? change.beforeValue : change.afterValue;
  if (structured && "dailySpots" in structured) return structured as AdvertisingOrderItemSrl;
  return parseLegacySrlItem(side === "before" ? change.before : change.after);
};

const getSasValue = (
  change: AdvertisingOrderChange,
  side: "before" | "after",
) => {
  const structured = side === "before" ? change.beforeValue : change.afterValue;
  if (structured && "format" in structured && !("dailySpots" in structured)) {
    return structured as AdvertisingOrderItemSas;
  }
  return parseLegacySasItem(side === "before" ? change.before : change.after);
};

const sameSrlItem = (left: AdvertisingOrderItemSrl, right: AdvertisingOrderItemSrl) =>
  left.programId === right.programId
  && left.adType === right.adType
  && (left.customType || "") === (right.customType || "");

const sameSasItem = (left: AdvertisingOrderItemSas, right: AdvertisingOrderItemSas) =>
  left.format === right.format
  && (left.type || "") === (right.type || "")
  && (left.detail || "") === (right.detail || "");

const reverseRevision = (
  currentOrder: Partial<AdvertisingOrder>,
  revision: AdvertisingOrderRevision,
): Partial<AdvertisingOrder> => {
  const previous = JSON.parse(JSON.stringify(currentOrder)) as Partial<AdvertisingOrder>;
  previous.srlItems = [...(previous.srlItems || [])];
  previous.sasItems = [...(previous.sasItems || [])];

  revision.changes.forEach(change => {
    if (change.field === "adjustmentSrl" && change.before) previous.adjustmentSrl = parseCurrency(change.before);
    if (change.field === "adjustmentSas" && change.before) previous.adjustmentSas = parseCurrency(change.before);

    if (change.field === "srlItems") {
      const before = getSrlValue(change, "before");
      const after = getSrlValue(change, "after");
      if (after) {
        const index = previous.srlItems!.findIndex(item => sameSrlItem(item, after));
        if (index >= 0) {
          if (before) previous.srlItems![index] = before;
          else previous.srlItems!.splice(index, 1);
        }
      } else if (before) {
        previous.srlItems!.push(before);
      }
    }

    if (change.field === "sasItems") {
      const before = getSasValue(change, "before");
      const after = getSasValue(change, "after");
      if (after) {
        const index = previous.sasItems!.findIndex(item => sameSasItem(item, after));
        if (index >= 0) {
          if (before) previous.sasItems![index] = before;
          else previous.sasItems!.splice(index, 1);
        }
      } else if (before) {
        previous.sasItems!.push(before);
      }
    }
  });

  return previous;
};

const getRevisionFinancials = (
  order: AdvertisingOrder,
  revisions: AdvertisingOrderRevision[],
) => {
  const result = new Map<AdvertisingOrderRevision, {
    before: AdvertisingOrderFinancialSummary;
    after: AdvertisingOrderFinancialSummary;
  }>();
  let current: Partial<AdvertisingOrder> = order;

  [...revisions].reverse().forEach(revision => {
    const beforeOrder = reverseRevision(current, revision);
    result.set(revision, revision.financials || {
      before: getAdvertisingOrderFinancialSummary(beforeOrder),
      after: getAdvertisingOrderFinancialSummary(current),
    });
    current = beforeOrder;
  });

  return result;
};

function FinancialComparison({
  financials,
}: {
  financials: { before: AdvertisingOrderFinancialSummary; after: AdvertisingOrderFinancialSummary };
}) {
  const companies = [
    { key: "srl" as const, label: "AIRE SRL" },
    { key: "sas" as const, label: "AIRE SAS" },
  ].filter(({ key }) =>
    financials.before[key].gross
    || financials.after[key].gross
    || financials.before[key].adjustment
    || financials.after[key].adjustment
  );

  if (!companies.length) return null;

  return (
    <div className="mt-3 grid gap-3 lg:grid-cols-2">
      {companies.map(({ key, label }) => (
        <div key={key} className="overflow-hidden rounded border border-slate-300 bg-white">
          <div className="bg-slate-100 px-3 py-2 text-sm font-bold text-slate-800">{label} - valor mensual</div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[430px] text-sm">
              <thead>
                <tr className="border-b text-left text-slate-500">
                  <th className="px-3 py-2">Versión</th>
                  <th className="px-3 py-2 text-right">Bruto</th>
                  <th className="px-3 py-2 text-right">Desajuste</th>
                  <th className="px-3 py-2 text-right">Neto</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b bg-red-50/40">
                  <td className="px-3 py-2 font-semibold text-red-700">Anterior</td>
                  <td className="px-3 py-2 text-right">{currency(financials.before[key].gross)}</td>
                  <td className="px-3 py-2 text-right">{currency(financials.before[key].adjustment)}</td>
                  <td className="px-3 py-2 text-right font-bold">{currency(financials.before[key].net)}</td>
                </tr>
                <tr className="bg-emerald-50/40">
                  <td className="px-3 py-2 font-semibold text-emerald-700">Actual</td>
                  <td className="px-3 py-2 text-right">{currency(financials.after[key].gross)}</td>
                  <td className="px-3 py-2 text-right">{currency(financials.after[key].adjustment)}</td>
                  <td className="px-3 py-2 text-right font-bold">{currency(financials.after[key].net)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </div>
  );
}

function SrlCalendar({
  item,
  programs,
  side,
}: {
  item: AdvertisingOrderItemSrl;
  programs: Program[];
  side: "before" | "after";
}) {
  const entries = Object.entries(item.dailySpots || {})
    .filter(([, quantity]) => Number(quantity) > 0)
    .sort(([left], [right]) => left.localeCompare(right));
  const months = [...new Set(entries.map(([date]) => date.slice(0, 7)))];
  const repetitions = entries.reduce((total, [, quantity]) => total + (Number(quantity) || 0), 0);
  const multiplier = item.adType === "Spot" ? (item.seconds || 0) : 1;
  const total = (item.unitRate || 0) * repetitions * multiplier;
  const tone = side === "before" ? "border-red-200" : "border-emerald-200";

  return (
    <div className={`mt-2 overflow-hidden rounded border ${tone} bg-white`}>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 bg-slate-100 px-3 py-2 text-xs">
        <strong className="text-sm">{resolveProgramName(item.programId, programs)}</strong>
        <span>{item.adType === "Personalizado" ? item.customType || item.adType : item.adType}</span>
        {item.hasTv && <Badge variant="outline">TV</Badge>}
        {item.adType === "Spot" && <span>{item.seconds || 0} segundos</span>}
        <span>Tarifa: {currency(item.unitRate || 0)}</span>
        <span className="font-bold">Total: {currency(total)}</span>
      </div>
      {months.length ? months.map(month => {
        const monthDate = parseISO(`${month}-01`);
        const days = Array.from({ length: getDaysInMonth(monthDate) }, (_, index) => index + 1);
        return (
          <div key={month} className="border-t p-2">
            <div className="mb-2 text-xs font-semibold capitalize text-slate-600">
              {format(monthDate, "MMMM yyyy", { locale: es })}
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-max border-collapse text-center text-xs">
                <thead>
                  <tr>
                    {days.map(day => (
                      <th key={day} className="h-7 min-w-8 border bg-slate-100 font-semibold">{day}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    {days.map(day => {
                      const dateKey = `${month}-${String(day).padStart(2, "0")}`;
                      const quantity = item.dailySpots?.[dateKey];
                      return (
                        <td
                          key={day}
                          className={`h-8 min-w-8 border font-bold ${quantity ? "bg-blue-100 text-blue-800" : "text-slate-300"}`}
                        >
                          {quantity || ""}
                        </td>
                      );
                    })}
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        );
      }) : <p className="p-3 text-xs text-slate-500">Sin días pautados.</p>}
    </div>
  );
}

function SasItemView({ item }: { item: AdvertisingOrderItemSas }) {
  const locations = [
    item.desktop && "Desktop",
    item.mobile && "Mobile",
    item.home && "Home",
    item.interiores && "Interiores",
  ].filter(Boolean).join(", ");
  const total = item.format === "Banner"
    ? (item.cpm || 0) * (item.unitRate || 0)
    : (item.unitRate || 0);

  return (
    <div className="mt-2 overflow-x-auto rounded border bg-white">
      <table className="w-full min-w-[600px] text-xs">
        <thead className="bg-slate-100 text-left">
          <tr>
            <th className="px-3 py-2">Formato</th>
            <th className="px-3 py-2">Tipo / detalle</th>
            <th className="px-3 py-2">Ubicación</th>
            <th className="px-3 py-2">Observaciones</th>
            <th className="px-3 py-2 text-right">Neto</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td className="px-3 py-2 font-bold">{item.format}</td>
            <td className="px-3 py-2">{item.customDetail || item.detail || item.type || "-"}</td>
            <td className="px-3 py-2">{locations || "-"}</td>
            <td className="px-3 py-2">{item.observations || "-"}</td>
            <td className="px-3 py-2 text-right font-bold">{currency(total)}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

function FullSrlSchedule({ items, programs }: { items: AdvertisingOrderItemSrl[]; programs: Program[] }) {
  const months = [...new Set(items.flatMap(item =>
    Object.keys(item.dailySpots || {}).map(date => date.slice(0, 7)),
  ))].sort();

  if (!items.length) return null;
  return (
    <div className="space-y-3">
      {months.map(month => {
        const monthDate = parseISO(`${month}-01`);
        const days = Array.from({ length: getDaysInMonth(monthDate) }, (_, index) => index + 1);
        const monthItems = items.filter(item => Object.keys(item.dailySpots || {}).some(date => date.startsWith(month)));
        return (
          <div key={month} className="overflow-hidden rounded border">
            <div className="bg-slate-100 px-3 py-2 text-xs font-bold capitalize text-slate-700">
              {format(monthDate, "MMMM yyyy", { locale: es })}
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-max border-collapse text-center text-xs">
                <thead>
                  <tr className="bg-slate-50">
                    <th className="sticky left-0 z-10 min-w-40 border bg-slate-50 px-2 text-left">Programa</th>
                    <th className="min-w-28 border px-2 text-left">Tipo</th>
                    {days.map(day => <th key={day} className="h-8 min-w-8 border">{day}</th>)}
                    <th className="min-w-16 border px-2">Cant.</th>
                    <th className="min-w-24 border px-2 text-right">Tarifa</th>
                    <th className="min-w-28 border px-2 text-right">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {monthItems.map((item, index) => {
                    const repetitions = days.reduce((sum, day) => sum + Number(item.dailySpots?.[`${month}-${String(day).padStart(2, "0")}`] || 0), 0);
                    const multiplier = item.adType === "Spot" ? Number(item.seconds || 0) : 1;
                    const total = Number(item.unitRate || 0) * repetitions * multiplier;
                    return (
                      <tr key={`${item.programId}-${item.adType}-${index}`}>
                        <td className="sticky left-0 z-10 border bg-white px-2 py-2 text-left font-semibold">{resolveProgramName(item.programId, programs)}</td>
                        <td className="border px-2 text-left">{item.adType === "Personalizado" ? item.customType || item.adType : item.adType}{item.adType === "Spot" ? ` ${item.seconds || 0}s` : ""}</td>
                        {days.map(day => {
                          const quantity = item.dailySpots?.[`${month}-${String(day).padStart(2, "0")}`];
                          return <td key={day} className={`h-8 border font-bold ${quantity ? "bg-blue-100 text-blue-800" : ""}`}>{quantity || ""}</td>;
                        })}
                        <td className="border px-2 font-bold">{repetitions}</td>
                        <td className="border px-2 text-right">{currency(item.unitRate || 0)}</td>
                        <td className="border px-2 text-right font-bold">{currency(total)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function FullSasSchedule({ items }: { items: AdvertisingOrderItemSas[] }) {
  if (!items.length) return null;
  return (
    <div className="overflow-x-auto rounded border">
      <table className="w-full min-w-[700px] text-xs">
        <thead className="bg-slate-100 text-left">
          <tr><th className="px-3 py-2">Formato</th><th className="px-3 py-2">Tipo / detalle</th><th className="px-3 py-2">Observaciones</th><th className="px-3 py-2 text-right">Neto</th></tr>
        </thead>
        <tbody>
          {items.map((item, index) => {
            const total = item.format === "Banner" ? Number(item.cpm || 0) * Number(item.unitRate || 0) : Number(item.unitRate || 0);
            return (
              <tr key={`${item.format}-${item.type}-${index}`} className="border-t">
                <td className="px-3 py-2 font-bold">{item.format}</td>
                <td className="px-3 py-2">{item.customDetail || item.detail || item.type || "-"}</td>
                <td className="px-3 py-2">{item.observations || "-"}</td>
                <td className="px-3 py-2 text-right font-bold">{currency(total)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function ScheduleSnapshotView({
  snapshot,
  programs,
  side,
}: {
  snapshot: Pick<AdvertisingOrder, "startDate" | "endDate" | "srlItems" | "sasItems">;
  programs: Program[];
  side: "before" | "after";
}) {
  const isBefore = side === "before";
  return (
    <div className={`overflow-hidden rounded border-2 ${isBefore ? "border-red-200" : "border-emerald-200"} bg-white`}>
      <div className={`flex flex-wrap items-center justify-between gap-2 px-4 py-3 ${isBefore ? "bg-red-50 text-red-800" : "bg-emerald-50 text-emerald-800"}`}>
        <strong>{isBefore ? "Calendario anterior completo" : "Calendario actual completo"}</strong>
        <span className="text-xs">
          Vigencia: {format(new Date(snapshot.startDate), "dd/MM/yyyy")} al {format(new Date(snapshot.endDate), "dd/MM/yyyy")}
        </span>
      </div>
      <div className="space-y-3 p-3">
        <FullSrlSchedule items={snapshot.srlItems || []} programs={programs} />
        <FullSasSchedule items={snapshot.sasItems || []} />
        {(snapshot.srlItems || []).length === 0 && (snapshot.sasItems || []).length === 0 && (
          <p className="py-4 text-center text-sm text-slate-500">Sin pauta cargada.</p>
        )}
      </div>
    </div>
  );
}

function RevisionChangeView({
  change,
  programs,
}: {
  change: AdvertisingOrderChange;
  programs: Program[];
}) {
  const beforeSrl = change.field === "srlItems" ? getSrlValue(change, "before") : undefined;
  const afterSrl = change.field === "srlItems" ? getSrlValue(change, "after") : undefined;
  const beforeSas = change.field === "sasItems" ? getSasValue(change, "before") : undefined;
  const afterSas = change.field === "sasItems" ? getSasValue(change, "after") : undefined;

  return (
    <div className="rounded border border-slate-200 bg-white p-3 text-sm">
      <div className="flex items-center gap-2">
        <Badge variant="outline">{change.kind}</Badge>
        <strong>{change.label}</strong>
      </div>

      {beforeSrl && <><p className="mt-2 font-semibold text-red-700">Versión anterior</p><SrlCalendar item={beforeSrl} programs={programs} side="before" /></>}
      {afterSrl && <><p className="mt-3 font-semibold text-emerald-700">Versión actual</p><SrlCalendar item={afterSrl} programs={programs} side="after" /></>}
      {beforeSas && <><p className="mt-2 font-semibold text-red-700">Versión anterior</p><SasItemView item={beforeSas} /></>}
      {afterSas && <><p className="mt-3 font-semibold text-emerald-700">Versión actual</p><SasItemView item={afterSas} /></>}

      {!beforeSrl && !afterSrl && !beforeSas && !afterSas && (
        <>
          {change.before && <p className="mt-2 text-red-700"><strong>Antes:</strong> {replaceProgramIds(change.before, programs)}</p>}
          {change.after && <p className="mt-1 text-emerald-700"><strong>Después:</strong> {replaceProgramIds(change.after, programs)}</p>}
        </>
      )}
    </div>
  );
}

export function AdvertisingRevisionHistory({
  order,
  programs,
}: {
  order: AdvertisingOrder;
  programs: Program[];
}) {
  const revisions = order.revisionHistory || [];
  const financialsByRevision = getRevisionFinancials(order, revisions);
  if (!revisions.length) return null;

  return (
    <div className="space-y-4">
      {[...revisions].reverse().map((revision, revisionIndex) => (
        <div key={`${revision.timestamp}-${revisionIndex}`} className="border-l-4 border-amber-500 bg-amber-50/60 p-4">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <Edit3 className="h-4 w-4 text-amber-700" />
            <span className="font-bold text-slate-900">{revision.userName}</span>
            {revision.userRole && <Badge variant="outline">{revision.userRole}</Badge>}
            <span className="text-slate-500">{format(new Date(revision.timestamp), "dd/MM/yyyy HH:mm")}</span>
          </div>
          <p className="mt-2 text-sm text-slate-800"><strong>Motivo:</strong> {revision.reason}</p>
          <FinancialComparison financials={financialsByRevision.get(revision)!} />
          {revision.schedule && (
            <div className="mt-4 grid gap-4">
              <ScheduleSnapshotView snapshot={revision.schedule.before} programs={programs} side="before" />
              <ScheduleSnapshotView snapshot={revision.schedule.after} programs={programs} side="after" />
            </div>
          )}
          <div className="mt-4 space-y-3">
            {revision.changes
              .filter(change => !["adjustmentSrl", "adjustmentSas"].includes(change.field))
              .filter(change => !revision.schedule || !["srlItems", "sasItems"].includes(change.field))
              .map((change, changeIndex) => (
                <RevisionChangeView
                  key={`${change.field}-${changeIndex}`}
                  change={change}
                  programs={programs}
                />
              ))}
          </div>
        </div>
      ))}
    </div>
  );
}
