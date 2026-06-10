'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { signInWithPopup, signInWithEmailAndPassword, GoogleAuthProvider } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { Spinner } from '@/components/ui/spinner';
import Link from 'next/link';
import Image from 'next/image';

export default function LoginPage() {
  const [loading, setLoading] = useState(false);
  const [externalLoading, setExternalLoading] = useState(false);
  const [externalEmail, setExternalEmail] = useState('');
  const [externalPassword, setExternalPassword] = useState('');
  const router = useRouter();
  const { toast } = useToast();

  const handleGoogleLogin = async () => {
    setLoading(true);
    try {
      const provider = new GoogleAuthProvider();

      provider.setCustomParameters({
        prompt: 'select_account',
      });

      await signInWithPopup(auth, provider);
      localStorage.removeItem('google_api_token');
      localStorage.removeItem('google_api_token_expiry');
      sessionStorage.removeItem('google-access-token');

      toast({
        title: 'Bienvenido a Aire CRM',
        description: 'Sesion iniciada correctamente.',
      });

      router.push('/');
    } catch (error: any) {
      console.error('Login error:', error);
      toast({
        variant: 'destructive',
        title: 'Error de inicio de sesion',
        description: error.message || 'No se pudo iniciar sesion con Google.',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleExternalLogin = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!externalEmail.trim() || !externalPassword) return;
    setExternalLoading(true);
    try {
      await signInWithEmailAndPassword(auth, externalEmail.trim().toLowerCase(), externalPassword);
      router.push('/');
    } catch {
      toast({
        variant: 'destructive',
        title: 'No se pudo iniciar sesión',
        description: 'Revisá el correo y la contraseña asignados por administración.',
      });
    } finally {
      setExternalLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
      <Card className="w-full max-w-md border-slate-200 shadow-lg">
        <CardHeader className="space-y-4 text-center">
          <div className="flex justify-center">
            <div className="relative h-16 w-40">
              <Image src="/logo.webp" alt="Aire CRM" fill className="object-contain" priority />
            </div>
          </div>
          <CardTitle className="text-2xl font-bold">Iniciar sesion</CardTitle>
          <CardDescription>Accede con tu cuenta autorizada de Aire.</CardDescription>
        </CardHeader>
        <CardContent>
          <Button className="w-full py-6 text-base" onClick={handleGoogleLogin} disabled={loading}>
            {loading ? (
              <>
                <Spinner className="mr-2" /> Conectando...
              </>
            ) : (
              <>
                <svg className="mr-2 h-5 w-5" viewBox="0 0 24 24" aria-hidden="true">
                  <path
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                    fill="#4285F4"
                  />
                  <path
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                    fill="#34A853"
                  />
                  <path
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.84z"
                    fill="#FBBC05"
                  />
                  <path
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                    fill="#EA4335"
                  />
                </svg>
                Continuar con Google
              </>
            )}
          </Button>
          <div className="my-5 flex items-center gap-3 text-xs text-muted-foreground">
            <span className="h-px flex-1 bg-border" />
            Acceso externo
            <span className="h-px flex-1 bg-border" />
          </div>
          <form className="space-y-3" onSubmit={handleExternalLogin}>
            <div className="space-y-1">
              <label htmlFor="external-email" className="text-sm font-medium">Correo</label>
              <input
                id="external-email"
                type="email"
                autoComplete="email"
                value={externalEmail}
                onChange={event => setExternalEmail(event.target.value)}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              />
            </div>
            <div className="space-y-1">
              <label htmlFor="external-password" className="text-sm font-medium">Contraseña</label>
              <input
                id="external-password"
                type="password"
                autoComplete="current-password"
                value={externalPassword}
                onChange={event => setExternalPassword(event.target.value)}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              />
            </div>
            <Button type="submit" variant="outline" className="w-full" disabled={externalLoading || !externalEmail || !externalPassword}>
              {externalLoading ? <Spinner className="mr-2" /> : null}
              Ingresar
            </Button>
          </form>
        </CardContent>
        <CardFooter className="flex flex-col gap-2 justify-center border-t pt-4 text-xs text-muted-foreground">
          <div className="flex gap-4">
            <Link href="/privacy-policy" className="hover:text-primary hover:underline">
              Politica de privacidad
            </Link>
            <span>|</span>
            <Link href="/terms-of-service" className="hover:text-primary hover:underline">
              Terminos del servicio
            </Link>
          </div>
          <p>(c) {new Date().getFullYear()} Aire de Santa Fe</p>
        </CardFooter>
      </Card>
    </div>
  );
}
