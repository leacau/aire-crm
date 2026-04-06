import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// 🟢 Formatea un CUIT mientras el usuario escribe (XX-XXXXXXXX-X)
export function formatCuit(value: string): string {
    // Elimina todo lo que no sea número
    const numbers = value.replace(/\D/g, '');
    
    if (numbers.length === 0) return '';
    if (numbers.length <= 2) return numbers;
    if (numbers.length <= 10) return `${numbers.slice(0, 2)}-${numbers.slice(2)}`;
    return `${numbers.slice(0, 2)}-${numbers.slice(2, 10)}-${numbers.slice(10, 11)}`;
}

// 🟢 Limpia los guiones para guardado y comparación interna
export function cleanCuit(value: string | undefined | null): string {
    if (!value) return '';
    return value.replace(/\D/g, '');
}
