'use client';

import { useState, useEffect } from 'react';
import { User, Role } from '@/lib/types';
import { getAllUsers, updateUserProfile } from '@/lib/firebase-service';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { Check, Loader2, Save } from 'lucide-react';

export function PermissionsManager() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    loadUsers();
  }, []);

  const loadUsers = async () => {
    try {
      setLoading(true);
      const data = await getAllUsers();
      // Ordenar: primero los que tienen rol asignado, luego alfabéticamente
      const sorted = data.sort((a, b) => a.name.localeCompare(b.name));
      setUsers(sorted);
    } catch (error) {
      console.error('Error loading users:', error);
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'No se pudo cargar la lista de usuarios.',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleRoleChange = async (userId: string, newRole: Role) => {
    try {
      await updateUserProfile(userId, { role: newRole });
      setUsers(users.map(u => u.id === userId ? { ...u, role: newRole } : u));
      toast({
        title: 'Rol actualizado',
        description: 'Los permisos del usuario han sido modificados.',
      });
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'No se pudo actualizar el rol.',
      });
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold tracking-tight">Gestión de Equipo</h2>
        <Button variant="outline" size="sm" onClick={loadUsers} disabled={loading}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Actualizar Lista'}
        </Button>
      </div>

      <div className="rounded-md border bg-white">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Usuario</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Rol / Permisos</TableHead>
              <TableHead className="w-[200px]">Cód. Vendedor (Tango)</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.map((user) => (
              <UserRow 
                key={user.id} 
                user={user} 
                onRoleChange={handleRoleChange} 
              />
            ))}
            {!loading && users.length === 0 && (
              <TableRow>
                <TableCell colSpan={4} className="h-24 text-center text-muted-foreground">
                  No se encontraron usuarios.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

// Subcomponente para manejar el estado de cada fila independientemente
function UserRow({ 
  user, 
  onRoleChange 
}: { 
  user: User; 
  onRoleChange: (id: string, role: Role) => Promise<void> 
}) {
  const [sellerCode, setSellerCode] = useState(user.sellerCode || '');
  const [isSavingCode, setIsSavingCode] = useState(false);
  const { toast } = useToast();

  const handleSaveCode = async () => {
    if (sellerCode === user.sellerCode) return;
    
    try {
      setIsSavingCode(true);
      await updateUserProfile(user.id, { sellerCode });
      toast({
        title: 'Código guardado',
        description: `Se asignó el código "${sellerCode}" a ${user.name}`,
      });
      // Actualizamos el prop localmente en UI para que desaparezca el botón de guardar
      user.sellerCode = sellerCode;
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'No se pudo guardar el código de vendedor.',
      });
    } finally {
      setIsSavingCode(false);
    }
  };

  return (
    <TableRow>
      <TableCell className="font-medium">
        <div className="flex items-center gap-3">
          <Avatar className="h-8 w-8">
            <AvatarImage src={user.photoURL || undefined} />
            <AvatarFallback>{user.initials || user.name.substring(0, 2).toUpperCase()}</AvatarFallback>
          </Avatar>
          <span>{user.name}</span>
        </div>
      </TableCell>
      <TableCell className="text-muted-foreground">{user.email}</TableCell>
      <TableCell>
        <Select
          defaultValue={user.role}
          onValueChange={(value) => onRoleChange(user.id, value as Role)}
        >
          <SelectTrigger className="w-[140px] h-8">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="Asesor">Asesor</SelectItem>
            <SelectItem value="Jefe">Jefe</SelectItem>
            <SelectItem value="Gerencia">Gerencia</SelectItem>
            <SelectItem value="Admin">Admin</SelectItem>
          </SelectContent>
        </Select>
      </TableCell>
      <TableCell>
        <div className="flex items-center gap-2">
          <Input
            placeholder="Ej. VEND01"
            className="h-8 w-24 text-sm"
            value={sellerCode}
            onChange={(e) => setSellerCode(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSaveCode()}
          />
          {sellerCode !== (user.sellerCode || '') && (
            <Button
              size="icon"
              variant="ghost"
              className="h-8 w-8 text-green-600 hover:text-green-700 hover:bg-green-50"
              onClick={handleSaveCode}
              disabled={isSavingCode}
            >
              {isSavingCode ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            </Button>
          )}
        </div>
      </TableCell>
    </TableRow>
  );
}
