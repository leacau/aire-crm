import { AdvertisingForm } from "@/components/publicidad/advertising-form";
import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Nuevo Pedido de Publicidad | Aire CRM",
  description: "Crear una nueva orden de publicidad",
};

export default function NewAdvertisingOrderPage() {
  return (
    <div className="flex-1 space-y-4 p-8 pt-6">
      <div className="flex items-center justify-between space-y-2">
        <h2 className="text-3xl font-bold tracking-tight">Nuevo Pedido de Publicidad</h2>
      </div>
      <div className="hidden h-full flex-1 flex-col space-y-8 md:flex">
        <AdvertisingForm />
      </div>
    </div>
  );
}
