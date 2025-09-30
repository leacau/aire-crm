
'use client';

import { useState } from 'react';
import { updateProfile, sendPasswordResetEmail } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/use-auth';
import { Header } from '@/components/layout/header';
import { Spinner } from '@/components/ui/spinner';
import { ArrowLeft, Shield } from 'lucide-react';
import Link from 'next/link';

export default function SettingsPage() {
  const { user, userInfo, loading: authLoading } = useAuth();
  const [name, setName] = useState(user?.displayName || '');
  const [photoURL, setPhotoURL] = useState(user?.photoURL || '');
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setLoading(true);
    try {
      await updateProfile(user, { displayName: name, photoURL: photoURL });
      toast({
        title: 'Perfil actualizado',
        description: 'Tus datos han sido actualizados correctamente.',
      });
    } catch (error: any) {
      toast({
        title: 'Error al actualizar',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handlePasswordReset = async () => {
    if (!user || !user.email) return;
    setLoading(true);
    try {
      await sendPasswordResetEmail(auth, user.email);
      toast({
        title: 'Correo enviado',
        description: 'Revisa tu bandeja de entrada para restablecer tu contraseña.',
      });
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  if (authLoading) {
    return <div className="flex h-full w-full items-center justify-center"><Spinner size="large" /></div>;
  }

  return (
    <div className="flex flex-col h-full">
      <Header title="Configuración">
        <Button asChild variant="outline">
            <Link href="/">
                <ArrowLeft className="mr-2 h-4 w-4"/>
                Volver al Panel
            </Link>
        </Button>
      </Header>
      <main className="flex-1 overflow-auto p-4 md:p-6 lg:p-8">
        <div className="mx-auto max-w-2xl space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Perfil</CardTitle>
              <CardDescription>Actualiza tu nombre y tu imagen de perfil.</CardDescription>
            </CardHeader>
              <CardContent>
                <form onSubmit={handleUpdateProfile} className="space-y-4">
                    <div className="grid gap-2">
                      <Label htmlFor="name">Nombre</Label>
                      <Input
                        id="name"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        required
                      />
                    </div>
                    {userInfo && (
                      <div className="grid gap-2">
                        <Label>Email</Label>
                        <Input value={userInfo.email} disabled />
                      </div>
                    )}
                    <div className="grid gap-2">
                        <Label htmlFor="photoURL">URL de la imagen de perfil</Label>
                        <Input
                            id="photoURL"
                            value={photoURL}
                            onChange={(e) => setPhotoURL(e.target.value)}
                            placeholder="https://example.com/avatar.jpg"
                        />
                    </div>
                    <Button type="submit" disabled={loading} className="w-full sm:w-auto">
                      {loading ? <Spinner size="small" /> : 'Guardar Cambios'}
                    </Button>
                </form>
              </CardContent>
          </Card>
           {userInfo && (
            <Card>
                <CardHeader>
                    <CardTitle>Rol de Usuario</CardTitle>
                    <CardDescription>Este es tu rol actual en el sistema.</CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="flex items-center space-x-3">
                        <Shield className="h-6 w-6 text-primary" />
                        <span className="text-lg font-medium">{userInfo.role}</span>
                    </div>
                     <p className="text-sm text-muted-foreground mt-2">
                        Los roles determinan tus permisos. Contacta a un administrador para cambios.
                    </p>
                </CardContent>
            </Card>
           )}
          <Card>
            <CardHeader>
              <CardTitle>Contraseña</CardTitle>
              <CardDescription>
                Haz clic en el botón para recibir un correo electrónico y restablecer tu contraseña.
              </CardDescription>
            </CardHeader>
            <CardFooter className="border-t px-6 py-4">
              <Button onClick={handlePasswordReset} variant="outline" disabled={loading}>
                {loading ? <Spinner size="small" /> : 'Enviar correo de restablecimiento'}
              </Button>
            </CardFooter>
          </Card>
        </div>
      </main>
    </div>
  );
}
