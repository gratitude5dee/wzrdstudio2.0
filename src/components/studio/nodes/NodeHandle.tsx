import { Handle, Position } from '@xyflow/react';
import { cn } from '@/lib/utils';
import { DataType, HANDLE_COLORS, HANDLE_GLOW_COLORS } from '@/types/computeFlow';
import { MouseEvent, useState } from 'react';

interface NodeHandleProps {
  id: string;
  type: 'source' | 'target';
  position: Position;
  dataType?: DataType;
  label?: string;
  maxConnections?: number;
  className?: string;
  variant?: 'default' | 'flora';
  onClick?: (event: MouseEvent<HTMLDivElement>) => void;
}

export const NodeHandle = ({
  id,
  type,
  position,
  dataType = 'any',
  label,
  className,
  variant = 'default',
  onClick,
}: NodeHandleProps) => {
  const color = HANDLE_COLORS[dataType];
  const glow = HANDLE_GLOW_COLORS[dataType];
  const [isHovered, setIsHovered] = useState(false);
  const floraSize = type === 'source' ? 'h-5 w-5' : 'h-4.5 w-4.5';

  return (
    <div 
      className="pointer-events-none absolute inset-0 group/handle"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <Handle
        id={id}
        type={type}
        position={position}
        className={cn(
          variant === 'flora'
            ? `pointer-events-auto relative flex ${floraSize} items-center justify-center rounded-full border border-[rgba(249,115,22,0.2)] bg-[#171717]/96 backdrop-blur-sm`
            : 'pointer-events-auto relative flex h-4 w-4 items-center justify-center rounded-full border-2 bg-zinc-950/90',
          'transition-all duration-150 ease-out',
          variant === 'flora'
            ? 'hover:scale-110 active:scale-110'
            : 'hover:scale-125 hover:shadow-[0_0_16px_var(--handle-glow)] active:scale-150',
          isHovered && (variant === 'flora' ? 'scale-110' : 'scale-125'),
          className
        )}
        style={{
          borderColor: variant === 'flora' ? 'rgba(255,255,255,0.1)' : color,
          boxShadow: isHovered 
            ? variant === 'flora'
              ? `0 10px 22px rgba(0,0,0,0.38), 0 0 0 1px rgba(255,255,255,0.06), 0 0 18px ${glow}`
              : `0 0 16px ${glow}, 0 0 4px ${glow}` 
            : variant === 'flora'
              ? '0 8px 20px rgba(0,0,0,0.32)'
              : `0 0 8px ${glow}, 0 0 2px ${glow}`,
          ['--handle-glow' as string]: glow,
        }}
        aria-label={`${dataType} ${type} port`}
        onClick={(event) => {
          event.stopPropagation();
          onClick?.(event);
        }}
      >
        {variant === 'flora' ? (
          <span
            className={cn(
              'text-[11px] font-medium leading-none text-white transition-transform duration-150',
              isHovered && 'scale-110'
            )}
          >
            +
          </span>
        ) : (
          <span
            className={cn(
              "h-1.5 w-1.5 rounded-full transition-transform duration-150",
              isHovered && "scale-125"
            )}
            style={{ backgroundColor: color }}
          />
        )}
      </Handle>

      {label && (
        <div
          className={cn(
            'pointer-events-none absolute z-50 whitespace-nowrap rounded-full border border-[rgba(249,115,22,0.1)] bg-[#121212]/96 px-2.5 py-1 text-[10px] font-medium text-zinc-200 shadow-lg backdrop-blur-md',
            'opacity-0 transition-opacity duration-150 group-hover/handle:opacity-100 group-hover/node:opacity-100',
            isHovered && 'opacity-100',
            position === Position.Left && 'left-full ml-2 top-1/2 -translate-y-1/2',
            position === Position.Right && 'right-full mr-2 top-1/2 -translate-y-1/2',
            position === Position.Top && 'top-full mt-2 left-1/2 -translate-x-1/2',
            position === Position.Bottom && 'bottom-full mb-2 left-1/2 -translate-x-1/2'
          )}
        >
          <span style={{ color: variant === 'flora' ? '#d4d4d8' : color }}>{label}</span>
        </div>
      )}
    </div>
  );
};
