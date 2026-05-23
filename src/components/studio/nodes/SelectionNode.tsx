import { memo } from 'react';
import { Handle, Position, useReactFlow } from '@xyflow/react';
import { motion } from 'framer-motion';
import { Image, Layers, Type, Upload, Video } from 'lucide-react';

type SelectionNodeData = {
  showSelector?: boolean;
  onSelectType?: (type: 'text' | 'image' | 'imageEdit' | 'video' | 'upload', position?: { x: number; y: number }) => void;
  onClose?: (nodeId: string) => void;
};

const blockTypes = [
  { id: 'text' as const, icon: Type, label: 'Text', shortcut: 'T' },
  { id: 'image' as const, icon: Image, label: 'Image', shortcut: 'I' },
  { id: 'imageEdit' as const, icon: Layers, label: 'Image Edit', shortcut: 'E' },
  { id: 'video' as const, icon: Video, label: 'Video', shortcut: 'V' },
  { id: 'upload' as const, icon: Upload, label: 'Upload', shortcut: 'U' },
];

export const SelectionNode = memo(({ id, data }: { id: string; data: SelectionNodeData }) => {
  const { getNode } = useReactFlow();
  const showSelector = data?.showSelector ?? true;

  const handleSelect = (type: 'text' | 'image' | 'imageEdit' | 'video' | 'upload') => {
    const node = getNode(id);
    const position = node?.position ?? { x: 0, y: 0 };
    data?.onSelectType?.(type, position);
    data?.onClose?.(id);
  };

  if (!showSelector) {
    return null;
  }

  return (
    <motion.div
      initial={{ scale: 0.9, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ type: 'spring', stiffness: 350, damping: 25 }}
      className="relative"
    >
      <Handle type="target" position={Position.Left} className="!bg-[#f97316]" />
      <Handle type="source" position={Position.Right} className="!bg-[#f97316]" />

      <div className="min-w-[220px] rounded-2xl border border-[rgba(249,115,22,0.1)] bg-[#111111]/95 p-3 shadow-xl backdrop-blur">
        <div className="mb-2 px-2 text-xs font-semibold uppercase tracking-[0.2em] text-zinc-500">
          Select Node
        </div>
        <div className="space-y-1">
          {blockTypes.map((type) => (
            <motion.button
              key={type.id}
              onClick={() => handleSelect(type.id)}
              whileHover={{ x: 2 }}
              className="group flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm text-zinc-300 transition-colors hover:bg-[#1d1d1d] hover:text-white"
            >
              <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-[rgba(249,115,22,0.08)] bg-[#1a1a1a] text-zinc-400 group-hover:text-[#d4a574]">
                <type.icon className="h-4 w-4" />
              </span>
              <span className="flex-1">{type.label}</span>
              <kbd className="rounded bg-zinc-800 px-2 py-0.5 text-[10px] text-zinc-500">
                {type.shortcut}
              </kbd>
            </motion.button>
          ))}
        </div>
      </div>
    </motion.div>
  );
});

SelectionNode.displayName = 'SelectionNode';

export default SelectionNode;
