
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const spinnerVariants = cva('animate-spin rounded-full border-solid', {
  variants: {
    size: {
      small: 'h-5 w-5 border-2',
      medium: 'h-8 w-8 border-4',
      large: 'h-12 w-12 border-4',
    },
    color: {
      primary: 'border-primary border-t-transparent',
      white: 'border-white border-t-transparent',
    },
  },
  defaultVariants: {
    size: 'medium',
    color: 'primary',
  },
});

export interface SpinnerProps extends VariantProps<typeof spinnerVariants> {
  className?: string;
}

export function Spinner({ size, color, className }: SpinnerProps) {
  return <div className={cn(spinnerVariants({ size, color }), className)} />;
}
