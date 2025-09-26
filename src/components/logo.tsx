import Image from 'next/image';

export function Logo() {
  return (
    <div className="flex items-center gap-2.5 font-bold">
      <Image src="/aire-logo.png" alt="Logo de Aire de Santa Fe" width={32} height={32} className='rounded-md' />
      <span className="font-headline text-xl text-foreground">CRM Aire</span>
    </div>
  );
}
