
'use client';

import React, { useState, useCallback, useEffect } from 'react';
import { updateProfile } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/use-auth';
import { Header } from '@/components/layout/header';
import { Spinner } from '@/components/ui/spinner';
import { ArrowLeft, Shield, UploadCloud, Plus, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useDropzone } from 'react-dropzone';
import { uploadAvatarToDrive } from '@/lib/google-avatar-service';
import { updateUserProfile, getEmailWhitelist, updateEmailWhitelist } from '@/lib/firebase-service';
import { hasManagementPrivileges } from '@/lib/role-utils';
import { cn } from '@/lib/utils';
import Image from 'next/image';

export default function SettingsPage() {
  const { user, userInfo, loading: authLoading, getGoogleAccessToken } = useAuth();
  const [name, setName] = useState(user?.displayName || '');
  const [loading, setLoading] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const { toast } = useToast();

  // 🟢 ESTADOS PARA LISTA BLANCA
  const [whitelist, setWhitelist] = useState<string[]>([]);
  const [newEmail, setNewEmail] = useState('');
  const [whitelistLoading, setWhitelistLoading] = useState(false);

  const canManageSystem = userInfo ? hasManagementPrivileges(userInfo) || userInfo.role === 'Admin' || userInfo.role === 'Administracion' : false;

  useEffect(() => {
      if (canManageSystem) {
          getEmailWhitelist().then(setWhitelist);
      }
  }, [canManageSystem]);

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !userInfo) return;
    setLoading(true);
    try {
      await updateProfile(user, { displayName: name });
      await updateUserProfile(user.uid, { name });
      toast({
        title: 'Perfil actualizado',
        description: 'Tu nombre ha sido actualizado correctamente.',
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

  // 🟢 FUNCIONES PARA LISTA BLANCA
  const handleAddEmail = async () => {
      if (!newEmail.trim() || !newEmail.includes('@')) return;
      const lowerEmail = newEmail.trim().toLowerCase();
      if (whitelist.includes(lowerEmail)) {
          toast({ title: 'El correo ya está en la lista' });
          return;
      }
      
      setWhitelistLoading(true);
      const updatedList = [...whitelist, lowerEmail];
      try {
          await updateEmailWhitelist(updatedList, userInfo!.id, userInfo!.name);
          setWhitelist(updatedList);
          setNewEmail('');
          toast({ title: 'Correo autorizado agregado' });
      } catch (error) {
          toast({ title: 'Error al actualizar la lista', variant: 'destructive' });
      } finally {
          setWhitelistLoading(false);
      }
  };

  const handleRemoveEmail = async (emailToRemove: string) => {
      setWhitelistLoading(true);
      const updatedList = whitelist.filter(e => e !== emailToRemove);
      try {
          await updateEmailWhitelist(updatedList, userInfo!.id, userInfo!.name);
          setWhitelist(updatedList);
          toast({ title: 'Correo removido' });
      } catch (error) {
          toast({ title: 'Error al actualizar la lista', variant: 'destructive' });
      } finally {
          setWhitelistLoading(false);
      }
  };

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    const file = acceptedFiles[0];
    if (!file || !user || !userInfo) return;

    setIsUploading(true);
    try {
        const token = await getGoogleAccessToken();
        if (!token) {
            throw new Error("No se pudo obtener el token de acceso de Google. Intenta iniciar sesión de nuevo.");
        }

        const fileUrl = await uploadAvatarToDrive(token, file, user.uid);
        
        await updateProfile(user, { photoURL: fileUrl });
        await updateUserProfile(user.uid, { photoURL: fileUrl });
        window.location.reload(); 
    } catch (error: any) {
        toast({ title: "Error al subir la imagen", description: error.message, variant: "destructive" });
    } finally {
        setIsUploading(false);
    }
  }, [user, userInfo, getGoogleAccessToken, toast]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'image/*': ['.jpeg', '.png', '.gif', '.jpg'] },
    multiple: false,
  });

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
              <CardContent className="space-y-6">
                 <div 
                    {...getRootProps()} 
                    className={cn(
                        "relative group flex flex-col items-center justify-center p-4 border-2 border-dashed rounded-lg cursor-pointer transition-colors w-48 h-48 mx-auto",
                        isDragActive && "border-primary bg-primary/10",
                        isUploading && "cursor-not-allowed opacity-50"
                    )}
                  >
                    <input {...getInputProps()} disabled={isUploading} />
                    {user?.photoURL ? (
                        <>
                           <Image src={user.photoURL} alt="Foto de perfil" layout="fill" objectFit="cover" className="rounded-lg" unoptimized/>
                           <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 flex flex-col items-center justify-center transition-opacity rounded-lg">
                                <UploadCloud className="h-8 w-8 text-white" />
                                <p className="text-white text-sm mt-2 text-center">Cambiar foto</p>
                           </div>
                        </>
                    ) : (
                         <>
                            <UploadCloud className="h-12 w-12 text-muted-foreground" />
                            <p className="mt-2 text-center text-sm text-muted-foreground">Subir foto</p>
                        </>
                    )}
                     {isUploading && (
                        <div className="absolute inset-0 bg-white/80 flex items-center justify-center rounded-lg">
                            <Spinner />
                        </div>
                    )}
                 </div>

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
                        <Label htmlFor="email">Email</Label>
                        <Input id="email" value={userInfo.email} disabled />
                      </div>
                    )}
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

           {/* 🟢 PANEL DE LISTA BLANCA DE CORREOS */}
           {canManageSystem && (
               <Card className="border-red-200">
                   <CardHeader className="bg-red-50/50">
                       <CardTitle className="text-red-700">Accesos de Personal Externo</CardTitle>
                       <CardDescription>
                           Agrega correos de Gmail o dominios externos que tengan permiso para iniciar sesión en el CRM.
                       </CardDescription>
                   </CardHeader>
                   <CardContent className="space-y-4 pt-4">
                       <div className="flex gap-2">
                           <Input 
                                placeholder="Ej: asesorcanjes@gmail.com" 
                                value={newEmail} 
                                onChange={e => setNewEmail(e.target.value)}
                                disabled={whitelistLoading}
                            />
                           <Button onClick={handleAddEmail} disabled={whitelistLoading || !newEmail}>
                               {whitelistLoading ? <Spinner size="small" color="white" /> : <Plus className="h-4 w-4" />}
                               Agregar
                           </Button>
                       </div>
                       
                       {whitelist.length > 0 ? (
                           <div className="space-y-2 mt-4">
                               {whitelist.map(email => (
                                   <div key={email} className="flex justify-between items-center p-3 border rounded-md bg-slate-50">
                                       <span className="font-medium text-sm">{email}</span>
                                       <Button variant="ghost" size="sm" className="text-red-500 hover:bg-red-100 h-8 w-8 p-0" onClick={() => handleRemoveEmail(email)} disabled={whitelistLoading}>
                                           <Trash2 className="h-4 w-4" />
                                       </Button>
                                   </div>
                               ))}
                           </div>
                       ) : (
                           <p className="text-sm text-muted-foreground italic text-center py-4 border border-dashed rounded-md mt-4">
                               No hay correos externos autorizados.
                           </p>
                       )}
                   </CardContent>
               </Card>
           )}
        </div>
      </main>
    </div>
  );
}
