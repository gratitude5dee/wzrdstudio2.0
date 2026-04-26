import { ArrowUpDown } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

export type SortOption = 'updated' | 'created' | 'name';

interface SortDropdownProps {
  value: SortOption;
  onChange: (option: SortOption) => void;
}

export const SortDropdown = ({ value, onChange }: SortDropdownProps) => {
  const options = [
    { value: 'updated' as SortOption, label: 'Last edited' },
    { value: 'created' as SortOption, label: 'Created date' },
    { value: 'name' as SortOption, label: 'Name (A-Z)' },
  ];

  const currentLabel = options.find(opt => opt.value === value)?.label || 'Last edited';

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="flex items-center gap-2 h-9 px-3 bg-zinc-100 dark:bg-white/[0.04] border border-zinc-200 dark:border-white/[0.08] rounded-lg text-sm text-zinc-600 dark:text-white/60 hover:text-zinc-800 dark:hover:text-white hover:border-zinc-300 dark:hover:border-white/[0.16] transition-colors">
        <ArrowUpDown className="w-4 h-4" />
        <span>{currentLabel}</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="bg-white dark:bg-[#1A1A1A] border-zinc-200 dark:border-white/[0.08]">
        {options.map((option) => (
          <DropdownMenuItem
            key={option.value}
            onClick={() => onChange(option.value)}
            className={`text-sm cursor-pointer ${
              value === option.value ? 'text-zinc-900 dark:text-white' : 'text-zinc-600 dark:text-white/60'
            } hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-white/[0.04]`}
          >
            {option.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
