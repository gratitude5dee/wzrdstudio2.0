import React, { memo, useState } from 'react';
import { EdgeLabelRenderer, EdgeProps, getBezierPath } from '@xyflow/react';
import { DataType, EdgeStatus } from '@/types/computeFlow';

export interface ComputeEdgeData {
  dataType?: DataType;
  status?: EdgeStatus;
  label?: string;
}

export const ComputeEdge = memo(
  ({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    data,
    selected,
  }: EdgeProps) => {
    const [isHovered, setIsHovered] = useState(false);
    const edgeData = data as ComputeEdgeData | undefined;
    const distance = Math.hypot(targetX - sourceX, targetY - sourceY);
    const curvature = Math.min(0.52, Math.max(0.24, distance / 700));

    const [edgePath, labelX, labelY] = getBezierPath({
      sourceX,
      sourceY,
      sourcePosition,
      targetX,
      targetY,
      targetPosition,
      curvature,
    });

    const status = edgeData?.status || 'idle';
    const strokeColor =
      status === 'error' ? '#cf6a6a' : selected || isHovered ? '#f59e0b' : '#4a4a4a';
    const strokeWidth = selected || isHovered ? 1.9 : 1.35;
    const dashPattern = status === 'running' ? '6 6' : undefined;

    return (
      <g onMouseEnter={() => setIsHovered(true)} onMouseLeave={() => setIsHovered(false)}>
        <path d={edgePath} fill="none" stroke="transparent" strokeWidth={18} className="cursor-pointer" />

        <path
          d={edgePath}
          fill="none"
          stroke={strokeColor}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={dashPattern}
          opacity={selected || isHovered ? 0.92 : 0.56}
          style={{ transition: 'stroke 0.15s ease, stroke-width 0.15s ease' }}
        />

        {status === 'running' ? (
          <path
            d={edgePath}
            fill="none"
            stroke="#d4a574"
            strokeWidth={strokeWidth}
            strokeDasharray="6 6"
            strokeLinecap="round"
            opacity={0.95}
          >
            <animate attributeName="stroke-dashoffset" values="0;-12" dur="0.8s" repeatCount="indefinite" />
          </path>
        ) : null}

        <circle cx={sourceX} cy={sourceY} r={selected ? 2.4 : 2} fill={strokeColor} opacity={0.72} />
        <circle cx={targetX} cy={targetY} r={selected ? 2.4 : 2} fill={strokeColor} opacity={0.72} />

        {edgeData?.label && (isHovered || selected) ? (
          <EdgeLabelRenderer>
            <div
              className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/8 bg-[#151515]/92 px-2.5 py-1 text-[10px] uppercase tracking-[0.18em] text-zinc-300 shadow-lg"
              style={{
                left: labelX,
                top: labelY,
              }}
            >
              {edgeData.label}
            </div>
          </EdgeLabelRenderer>
        ) : null}
      </g>
    );
  }
);

ComputeEdge.displayName = 'ComputeEdge';
