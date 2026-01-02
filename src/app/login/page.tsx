
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { signInWithPopup, GoogleAuthProvider } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { Logo } from '@/components/logo';
import { createUserProfile, getUserProfile } from '@/lib/firebase-service';
import Link from 'next/link';

const ALLOWED_DOMAINS = ['airedesantafe.com.ar', 'airedigital.com'];

export default function LoginPage() {
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const { toast } = useToast();

  const handleGoogleSignIn = async () => {
    setLoading(true);
    const provider = new GoogleAuthProvider();
    provider.addScope('https://www.googleapis.com/auth/calendar');
    provider.addScope('https://www.googleapis.com/auth/gmail.send');
    provider.addScope('https://www.googleapis.com/auth/drive.file');

    try {
        const result = await signInWithPopup(auth, provider);
        const user = result.user;
        const emailDomain = user.email?.split('@')[1];

        if (!emailDomain || !ALLOWED_DOMAINS.includes(emailDomain)) {
            await auth.signOut(); // Sign out the user immediately
            toast({
                title: 'Acceso Denegado',
                description: 'Solo se permiten usuarios con dominios @airedesantafe.com.ar o @airedigital.com.',
                variant: 'destructive',
            });
            setLoading(false);
            return;
        }


        const credential = GoogleAuthProvider.credentialFromResult(result);
        const token = credential?.accessToken;

        // Store access token in session storage
        if (token) {
            sessionStorage.setItem('google-access-token', token);
        }

        // Check if user profile exists, if not create one
        const userProfile = await getUserProfile(user.uid);
        if (!userProfile) {
            await createUserProfile(user.uid, user.displayName || 'Usuario de Google', user.email || '', user.photoURL || undefined);
        }

        router.push('/');
    } catch (error: any) {
        // Don't show toast for user closing the popup
        if (error.code !== 'auth/popup-closed-by-user') {
            toast({
                title: 'Error con Google Sign-In',
                description: error.message,
                variant: 'destructive',
            });
        }
    } finally {
        setLoading(false);
    }
  };


  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <Card className="w-full max-w-sm">
        <CardHeader className="items-center">
            <Logo />
          <CardTitle className="text-2xl">Iniciar Sesión</CardTitle>
          <CardDescription>
            Usa tu cuenta de Google para acceder al CRM.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
            <Button variant="outline" onClick={handleGoogleSignIn} disabled={loading}>
                <svg className="mr-2 h-4 w-4" aria-hidden="true" focusable="false" data-prefix="fab" data-icon="google" role="img" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 488 512"><path fill="currentColor" d="M488 261.8C488 403.3 391.1 504 248 504 110.8 504 0 393.2 0 256S110.8 8 248 8c66.8 0 126 21.2 177.2 56.4l-64.2 64.2c-23.4-22.4-56.4-36.8-95-36.8-70.2 0-129.2 56.4-129.2 128.2s59 128.2 129.2 128.2c80.2 0 116.2-53.6 122.2-81.8H248v-64h240c1.4 8.6 2.2 17.2 2.2 26.2z"></path></svg>
                {loading ? 'Iniciando sesión...' : 'Iniciar sesión con Google'}
            </Button>
        </CardContent>
        <CardFooter className="flex justify-center gap-4 text-sm">
            <Link href="/terms-of-service" className="text-muted-foreground hover:text-primary underline-offset-4 hover:underline">
                Condiciones del Servicio
            </Link>
            <Link href="/privacy-policy" className="text-muted-foreground hover:text-primary underline-offset-4 hover:underline">
                Política de Privacidad
            </Link>
        </CardFooter>
      </Card>
    </div>
  );
}
