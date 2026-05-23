import {
  CheckCircle2,
  FileCheck2,
  Filter,
  Image as ImageIcon,
  Loader2,
  Search,
} from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import type { IPVaultItem } from '@/types/ip-vault';
import { formatIp, LICENSE_LABELS, previewUrl, statusClass, STATUS_LABELS } from './ip-vault-utils';
import type { StatusFilter } from './ip-vault-utils';

interface IPVaultGalleryProps {
  items: IPVaultItem[];
  filteredItems: IPVaultItem[];
  selectedId: string | null;
  loading: boolean;
  search: string;
  statusFilter: StatusFilter;
  onSearchChange: (value: string) => void;
  onStatusFilterChange: (value: StatusFilter) => void;
  onSelectItem: (id: string) => void;
}

export function IPVaultGallery({
  filteredItems,
  selectedId,
  loading,
  search,
  statusFilter,
  onSearchChange,
  onStatusFilterChange,
  onSelectItem,
}: IPVaultGalleryProps) {
  return (
    <section className="space-y-4">
      <div className="grid gap-3 rounded-2xl border border-white/[0.08] bg-white/[0.03] p-3 md:grid-cols-[minmax(0,1fr)_180px]">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
          <Input
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search finalized IP…"
            className="h-10 rounded-xl border-white/10 bg-black/40 pl-9 text-white"
          />
        </div>
        <Select value={statusFilter} onValueChange={(v) => onStatusFilterChange(v as StatusFilter)}>
          <SelectTrigger className="h-10 rounded-xl border-white/10 bg-black/40 text-white">
            <Filter className="mr-2 h-4 w-4 text-zinc-500" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="draft">Draft</SelectItem>
            <SelectItem value="metadata_ready">Metadata ready</SelectItem>
            <SelectItem value="registering">Registering</SelectItem>
            <SelectItem value="registered">Registered</SelectItem>
            <SelectItem value="failed">Failed</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <div className="flex min-h-[420px] items-center justify-center rounded-3xl border border-white/[0.08] bg-white/[0.02]">
          <Loader2 className="h-7 w-7 animate-spin text-orange-300" />
        </div>
      ) : filteredItems.length === 0 ? (
        <div className="flex min-h-[420px] flex-col items-center justify-center rounded-3xl border border-dashed border-white/[0.1] bg-white/[0.02] p-8 text-center">
          <FileCheck2 className="mb-4 h-12 w-12 text-zinc-600" />
          <h2 className="text-lg font-semibold text-white">No finalized IP yet</h2>
          <p className="mt-2 max-w-md text-sm text-zinc-500">
            Use Finalize asset from Asset Store, Character Creation, or Final Export surfaces to add rights-ready work here.
          </p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {filteredItems.map((item) => {
            const url = previewUrl(item);
            const isSelected = selectedId === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onSelectItem(item.id)}
                className={cn(
                  'overflow-hidden rounded-2xl border bg-[#101015] text-left transition-all',
                  isSelected
                    ? 'border-orange-300 shadow-[0_0_0_2px_rgba(251,146,60,0.15)]'
                    : 'border-white/[0.08]',
                  'hover:border-orange-300/45 hover:bg-[#15151b]',
                )}
                data-testid="ip-vault-item-card"
              >
                <div className="relative aspect-[4/3] bg-black/50">
                  {url ? (
                    <img src={url} alt={item.title} className="h-full w-full object-cover" loading="lazy" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center">
                      <ImageIcon className="h-10 w-10 text-zinc-700" />
                    </div>
                  )}
                  <div className="absolute left-2 top-2 flex flex-wrap gap-1">
                    <Badge variant="outline" className={cn('text-[10px]', statusClass(item.registration_status))}>
                      {STATUS_LABELS[item.registration_status]}
                    </Badge>
                    {item.license_profile !== 'none' && (
                      <Badge variant="outline" className="border-white/10 bg-white/[0.04] text-[10px] text-zinc-300">
                        {LICENSE_LABELS[item.license_profile]}
                      </Badge>
                    )}
                  </div>
                </div>
                <div className="space-y-2 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate text-sm font-semibold text-white">{item.title}</p>
                    {item.registration_status === 'registered' && (
                      <CheckCircle2 className="h-4 w-4 shrink-0 text-lime-300" />
                    )}
                  </div>
                  <div className="flex items-center justify-between gap-2 text-[10px]">
                    <span className="rounded-full bg-white/[0.05] px-2 py-0.5 capitalize text-zinc-400">
                      {item.asset_kind}
                    </span>
                    <span className="font-mono text-zinc-500">{formatIp(item.ip_id)}</span>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
}
