'use client';

import { useState, useEffect } from 'react';
import { User, Role, SellerCompanyConfig } from '@/lib/types';
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Settings2, Plus, X, Trash2, Building2 } from 'lucide-react';

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
      toast({ title: 'Rol actualizado', description: 'Permisos modificados correctamente.' });
    } catch (error) {
      toast({ variant: 'destructive', title: 'Error', description: 'No se pudo actualizar el rol.' });
    }
  };

  const handleConfigUpdate = (userId: string, newConfig: SellerCompanyConfig[]) => {
      setUsers(users.map(u => u.id === userId ? { ...u, sellerConfig: newConfig } : u));
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold tracking-tight">Gestión de Equipo</h2>
        <Button variant="outline" size="sm" onClick={loadUsers} disabled={loading}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Actualizar Lista'}
        </Button>
      </div>

      <div className="rounded-md border bg-white shadow-sm">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Usuario</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Rol / Permisos</TableHead>
              <TableHead className="w-[300px]">Códigos Tango</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.map((user) => (
              <UserRow 
                key={user.id} 
                user={user} 
                onRoleChange={handleRoleChange}
                onConfigUpdate={handleConfigUpdate}
              />
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function UserRow({ 
  user, 
  onRoleChange,
  onConfigUpdate
}: { 
  user: User; 
  onRoleChange: (id: string, role: Role) => Promise<void>;
  onConfigUpdate: (id: string, config: SellerCompanyConfig[]) => void;
}) {
  const configCount = user.sellerConfig?.reduce((acc, curr) => acc + curr.codes.length, 0) || 0;
  const companiesCount = user.sellerConfig?.length || 0;

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
         <SellerConfigDialog user={user} onUpdate={onConfigUpdate} />
         <div className="mt-1 text-xs text-muted-foreground">
             {configCount > 0 
                ? `${configCount} códigos en ${companiesCount} empresas` 
                : 'Sin asignar'}
         </div>
      </TableCell>
    </TableRow>
  );
}

// --- Componente del Diálogo de Configuración ---

function SellerConfigDialog({ user, onUpdate }: { user: User, onUpdate: (id: string, c: SellerCompanyConfig[]) => void }) {
    const [open, setOpen] = useState(false);
    const [config, setConfig] = useState<SellerCompanyConfig[]>(user.sellerConfig || []);
    const [loading, setLoading] = useState(false);
    const { toast } = useToast();

    // Estados para inputs temporales
    const [newCompany, setNewCompany] = useState('');
    const [newCodeInputs, setNewCodeInputs] = useState<{[key: string]: string}>({});

    // Sincronizar estado cuando se abre el diálogo
    useEffect(() => {
        if (open) setConfig(user.sellerConfig || []);
    }, [open, user.sellerConfig]);

    const handleAddCompany = () => {
        if (!newCompany.trim()) return;
        if (config.some(c => c.companyName.toLowerCase() === newCompany.trim().toLowerCase())) {
            toast({ title: "Empresa ya existe", variant: "destructive" });
            return;
        }
        setConfig([...config, { companyName: newCompany.trim(), codes: [] }]);
        setNewCompany('');
    };

    const handleRemoveCompany = (companyName: string) => {
        setConfig(config.filter(c => c.companyName !== companyName));
    };

    const handleAddCode = (companyName: string) => {
        const codeToAdd = newCodeInputs[companyName]?.trim();
        if (!codeToAdd) return;

        setConfig(config.map(c => {
            if (c.companyName === companyName) {
                if (c.codes.includes(codeToAdd)) return c;
                return { ...c, codes: [...c.codes, codeToAdd] };
            }
            return c;
        }));
        
        setNewCodeInputs(prev => ({ ...prev, [companyName]: '' }));
    };

    const handleRemoveCode = (companyName: string, codeToRemove: string) => {
        setConfig(config.map(c => {
            if (c.companyName === companyName) {
                return { ...c, codes: c.codes.filter(code => code !== codeToRemove) };
            }
            return c;
        }));
    };

    const handleSave = async () => {
        try {
            setLoading(true);
            await updateUserProfile(user.id, { sellerConfig: config });
            onUpdate(user.id, config);
            toast({ title: "Configuración guardada" });
            setOpen(false);
        } catch (error) {
            toast({ title: "Error al guardar", variant: "destructive" });
        } finally {
            setLoading(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <Button variant="outline" size="sm" className="h-8 gap-2">
                    <Settings2 className="h-3.5 w-3.5" />
                    Gestionar Códigos
                </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
                <DialogHeader>
                    <DialogTitle>Códigos de Vendedor: {user.name}</DialogTitle>
                </DialogHeader>
                
                <div className="py-4 space-y-6">
                    {/* Lista de Empresas y sus Códigos */}
                    <div className="space-y-4 max-h-[300px] overflow-y-auto pr-2">
                        {config.length === 0 && (
                            <p className="text-center text-sm text-muted-foreground italic">
                                No hay empresas configuradas.
                            </p>
                        )}
                        
                        {config.map((item, idx) => (
                            <div key={idx} className="rounded-lg border p-3 space-y-3 bg-slate-50">
                                <div className="flex items-center justify-between border-b pb-2">
                                    <div className="flex items-center gap-2 font-medium text-sm">
                                        <Building2 className="h-4 w-4 text-blue-600" />
                                        {item.companyName}
                                    </div>
                                    <Button 
                                        variant="ghost" 
                                        size="icon" 
                                        className="h-6 w-6 text-red-500 hover:bg-red-50"
                                        onClick={() => handleRemoveCompany(item.companyName)}
                                    >
                                        <Trash2 className="h-3.5 w-3.5" />
                                    </Button>
                                </div>

                                <div className="flex flex-wrap gap-2">
                                    {item.codes.map(code => (
                                        <Badge key={code} variant="secondary" className="flex items-center gap-1 bg-white border">
                                            {code}
                                            <X 
                                                className="h-3 w-3 cursor-pointer text-muted-foreground hover:text-red-500" 
                                                onClick={() => handleRemoveCode(item.companyName, code)}
                                            />
                                        </Badge>
                                    ))}
                                </div>

                                <div className="flex items-center gap-2 pt-1">
                                    <Input 
                                        placeholder="Nuevo código (ej. 021)" 
                                        className="h-7 text-xs bg-white"
                                        value={newCodeInputs[item.companyName] || ''}
                                        onChange={(e) => setNewCodeInputs({...newCodeInputs, [item.companyName]: e.target.value})}
                                        onKeyDown={(e) => e.key === 'Enter' && handleAddCode(item.companyName)}
                                    />
                                    <Button 
                                        size="sm" 
                                        variant="secondary" 
                                        className="h-7 px-2"
                                        onClick={() => handleAddCode(item.companyName)}
                                        disabled={!newCodeInputs[item.companyName]}
                                    >
                                        <Plus className="h-3.5 w-3.5" />
                                    </Button>
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* Agregar Nueva Empresa */}
                    <div className="flex items-center gap-2 pt-2 border-t">
                        <Input 
                            placeholder="Nombre de Empresa (ej. Aire SRL)" 
                            value={newCompany}
                            onChange={(e) => setNewCompany(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && handleAddCompany()}
                        />
                        <Button onClick={handleAddCompany} disabled={!newCompany.trim()}>
                            Agregar Empresa
                        </Button>
                    </div>
                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
                    <Button onClick={handleSave} disabled={loading}>
                        {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        Guardar Cambios
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
