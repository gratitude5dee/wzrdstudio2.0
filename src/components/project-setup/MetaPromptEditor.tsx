import React from 'react';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ChevronDown, Wand2 } from 'lucide-react';
import type { CustomMetaPrompts, ProjectData } from './types';

interface MetaPromptEditorProps {
  value?: CustomMetaPrompts;
  onChange: (next: CustomMetaPrompts) => void;
}

const FIELDS: Array<{ key: keyof CustomMetaPrompts; label: string; placeholder: string; rows: number }> = [
  { key: 'storylineSystem', label: 'Storyline System Prompt', placeholder: 'Override the system role for storyline generation…', rows: 4 },
  { key: 'storylineStructure', label: 'Storyline Structure Prompt', placeholder: 'Define scene/structure rules…', rows: 4 },
  { key: 'shotPrompting', label: 'Shot Prompting Prompt', placeholder: 'Override shot-level visual prompt rules…', rows: 4 },
  { key: 'characterExtraction', label: 'Character Extraction Prompt', placeholder: 'Override character extraction…', rows: 3 },
  { key: 'negativeConstraints', label: 'Negative Constraints', placeholder: 'List things the model must avoid…', rows: 3 },
];

export const MetaPromptEditor: React.FC<MetaPromptEditorProps> = ({ value, onChange }) => {
  const v = value ?? {};
  const update = (key: keyof CustomMetaPrompts, val: string) => {
    onChange({ ...v, [key]: val, version: 'v1' });
  };
  return (
    <Collapsible className="border border-border rounded-md bg-card/40">
      <CollapsibleTrigger className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium hover:bg-accent/40 rounded-md">
        <span className="flex items-center gap-2"><Wand2 className="h-4 w-4 text-primary" /> Meta Prompts (Advanced)</span>
        <ChevronDown className="h-4 w-4 opacity-60" />
      </CollapsibleTrigger>
      <CollapsibleContent className="px-4 pb-4 pt-2 space-y-4">
        <p className="text-xs text-muted-foreground">
          Optional overrides applied only to the Custom format. Empty fields fall back to platform defaults.
        </p>
        {FIELDS.map((f) => (
          <div key={f.key} className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">{f.label}</Label>
            <Textarea
              value={(v[f.key] as string) ?? ''}
              onChange={(e) => update(f.key, e.target.value)}
              placeholder={f.placeholder}
              rows={f.rows}
              className="bg-background/60 text-sm"
            />
          </div>
        ))}
      </CollapsibleContent>
    </Collapsible>
  );
};

export function pickCustomMetaPrompts(data: ProjectData): CustomMetaPrompts | undefined {
  return data.customMetaPrompts;
}
