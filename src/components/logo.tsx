import { TrendingUp } from 'lucide-react';

export function Logo() {
  return (
    <div className="flex items-center gap-2.5 font-bold text-primary">
      <div className="bg-primary text-primary-foreground p-2 rounded-lg">
        <TrendingUp className="h-5 w-5" />
      </div>
      <span className="font-headline text-xl text-foreground">MediaSales</span>
    </div>
  );
}
