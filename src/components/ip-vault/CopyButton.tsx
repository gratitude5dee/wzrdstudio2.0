import { Check, Copy } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface CopyButtonProps {
  value: string | null | undefined;
  label?: string;
  className?: string;
}

export function CopyButton({ value, label, className }: CopyButtonProps) {
  const [copied, setCopied] = useState(false);

  if (!value) return null;

  const handleCopy = async () => {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    toast.success(label ? `${label} copied` : 'Copied to clipboard');
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      onClick={() => void handleCopy()}
      className={cn('h-6 w-6 shrink-0 text-zinc-500 hover:text-zinc-300', className)}
    >
      {copied ? <Check className="h-3 w-3 text-lime-300" /> : <Copy className="h-3 w-3" />}
    </Button>
  );
}
