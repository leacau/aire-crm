'use client';

import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/use-auth';
import { ArrowRight, BarChart3, ShieldCheck, Users } from 'lucide-react';

export default function LandingPage() {
  const { user, loading } = useAuth();

  return (
    <div className="flex min-h-screen flex-col">
      <header className="px-6 h-16 flex items-center border-b">
        <div className="flex items-center gap-2 font-bold text-xl">
          <div className="h-8 w-8 bg-red-600 rounded-md flex items-center justify-center text-white">
            A
          </div>
          CRM Aire
        </div>
        <nav className="ml-auto flex gap-4 sm:gap-6">
          <Link className="text-sm font-medium hover:underline underline-offset-4" href="/privacy-policy">
            Privacidad
          </Link>
          <Link className="text-sm font-medium hover:underline underline-offset-4" href="/terms-of-service">
            Términos
          </Link>
        </nav>
      </header>
      
      <main className="flex-1">
        <section className="w-full py-12 md:py-24 lg:py-32 xl:py-48 bg-gray-50 dark:bg-gray-900">
          <div className="container px-4 md:px-6 mx-auto">
            <div className="flex flex-col items-center space-y-4 text-center">
              <div className="space-y-2">
                <h1 className="text-3xl font-bold tracking-tighter sm:text-4xl md:text-5xl lg:text-6xl/none">
                  Gestión Comercial Aire de Santa Fe
                </h1>
                <p className="mx-auto max-w-[700px] text-gray-500 md:text-xl dark:text-gray-400">
                  Plataforma integral para la gestión de clientes, seguimiento de oportunidades comerciales, pautas publicitarias y facturación.
                </p>
              </div>
              <div className="space-x-4">
                {loading ? (
                  <Button disabled>Cargando...</Button>
                ) : user ? (
                  <Link href="/dashboard">
                    <Button className="h-12 px-8">
                      Ir al Dashboard <ArrowRight className="ml-2 h-4 w-4" />
                    </Button>
                  </Link>
                ) : (
                  <Link href="/login">
                    <Button className="h-12 px-8">Inicia Sesión</Button>
                  </Link>
                )}
              </div>
            </div>
          </div>
        </section>

        <section className="w-full py-12 md:py-24 lg:py-32">
          <div className="container px-4 md:px-6 mx-auto grid gap-10 sm:grid-cols-2 lg:grid-cols-3">
            <div className="flex flex-col items-center space-y-4 text-center">
              <div className="p-4 bg-red-100 rounded-full dark:bg-red-900/20">
                <Users className="h-8 w-8 text-red-600" />
              </div>
              <h2 className="text-xl font-bold">Gestión de Clientes</h2>
              <p className="text-gray-500 dark:text-gray-400">
                Administración centralizada de la base de datos de clientes y contactos de la empresa.
              </p>
            </div>
            <div className="flex flex-col items-center space-y-4 text-center">
              <div className="p-4 bg-blue-100 rounded-full dark:bg-blue-900/20">
                <BarChart3 className="h-8 w-8 text-blue-600" />
              </div>
              <h2 className="text-xl font-bold">Pronóstico de Ventas</h2>
              <p className="text-gray-500 dark:text-gray-400">
                Seguimiento de oportunidades comerciales y proyecciones de facturación mensual.
              </p>
            </div>
            <div className="flex flex-col items-center space-y-4 text-center">
              <div className="p-4 bg-green-100 rounded-full dark:bg-green-900/20">
                <ShieldCheck className="h-8 w-8 text-green-600" />
              </div>
              <h2 className="text-xl font-bold">Acceso Seguro</h2>
              <p className="text-gray-500 dark:text-gray-400">
                Plataforma de uso exclusivo para personal autorizado de Aire de Santa Fe.
              </p>
            </div>
          </div>
        </section>
      </main>
      
      <footer className="flex flex-col gap-2 sm:flex-row py-6 w-full shrink-0 items-center px-4 md:px-6 border-t">
        <p className="text-xs text-gray-500 dark:text-gray-400">
          © {new Date().getFullYear()} Aire de Santa Fe. Todos los derechos reservados.
        </p>
      </footer>
    </div>
  );
}
