import { MouseEvent, PointerEvent as ReactPointerEvent, useCallback, useMemo, useRef, useState } from 'react';
import { useDrag } from '@/lib/react-dnd';
import { Film, Music } from 'lucide-react';
import { useVideoEditorStore, Clip, AudioTrack } from '@/store/videoEditorStore';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import { buildSnapPoints, snapValue } from './snapping';

interface TimelineClipProps {
  clip: Clip | AudioTrack;
  zoom: number;
  onSelect: (id: string, additive: boolean) => void;
  isSelected: boolean;
}

export function TimelineClip({ clip, zoom, onSelect, isSelected }: TimelineClipProps) {
  const updateClip = useVideoEditorStore((state) => state.updateClip);
  const updateAudioTrack = useVideoEditorStore((state) => state.updateAudioTrack);
  const moveTimelineItems = useVideoEditorStore((state) => state.moveTimelineItems);
  const deleteTimelineItems = useVideoEditorStore((state) => state.deleteTimelineItems);
  const duplicateTimelineItems = useVideoEditorStore((state) => state.duplicateTimelineItems);
  const selectedClipIds = useVideoEditorStore((state) => state.selectedClipIds);
  const selectedAudioTrackIds = useVideoEditorStore((state) => state.selectedAudioTrackIds);
  const timeline = useVideoEditorStore((state) => state.timeline);
  const clips = useVideoEditorStore((state) => state.clips);
  const audioTracks = useVideoEditorStore((state) => state.audioTracks);
  const [isHovered, setIsHovered] = useState(false);
  const [isTrimming, setIsTrimming] = useState(false);
  const pendingTrim = useRef<(Partial<Clip> & Pick<Clip, 'startTime' | 'duration' | 'endTime'>) | null>(null);

  const duration = clip.duration ?? 1000;
  const widthPx = (duration / 1000) * zoom;
  const leftPx = ((clip.startTime ?? 0) / 1000) * zoom;

  const snapPoints = useMemo(
    () => buildSnapPoints(clips, audioTracks, clip.id),
    [audioTracks, clip.id, clips]
  );

  const applySnapping = useCallback(
    (value: number) =>
      snapValue(value, snapPoints, {
        snapToGrid: timeline.snapToGrid,
        gridSize: timeline.gridSize,
      }),
    [snapPoints, timeline.gridSize, timeline.snapToGrid]
  );

  const commandSelection = useMemo(() => {
    if (isSelected && (selectedClipIds.length > 0 || selectedAudioTrackIds.length > 0)) {
      return {
        clipIds: selectedClipIds,
        audioTrackIds: selectedAudioTrackIds,
      };
    }

    return clip.type === 'audio'
      ? { audioTrackIds: [clip.id] }
      : { clipIds: [clip.id] };
  }, [clip.id, clip.type, isSelected, selectedAudioTrackIds, selectedClipIds]);

  const commitUpdate = useCallback(
    (updates: Partial<Clip> | Partial<AudioTrack>, skipHistory = false) => {
      if (clip.type === 'audio') {
        updateAudioTrack(clip.id, updates as Partial<AudioTrack>, { skipHistory });
      } else {
        updateClip(clip.id, updates as Partial<Clip>, { skipHistory });
      }
    },
    [clip.id, clip.type, updateAudioTrack, updateClip]
  );

  const [{ isDragging }, dragRef] = useDrag({
    type: 'TIMELINE_CLIP',
    item: { id: clip.id, startTime: clip.startTime },
    end: (_, monitor) => {
      const diff = monitor.getDifferenceFromInitialOffset();
      if (!diff) return;
      const deltaMs = (diff.x / zoom) * 1000;
      if (!deltaMs) return;
      const targetStart = applySnapping((clip.startTime ?? 0) + deltaMs);
      moveTimelineItems(commandSelection, Math.max(0, targetStart) - (clip.startTime ?? 0));
    },
    collect: (monitor) => ({
      isDragging: monitor.isDragging(),
    }),
  });

  const handleSelect = (event: MouseEvent<HTMLDivElement>) => {
    event.stopPropagation();
    onSelect(clip.id, event.metaKey || event.ctrlKey);
  };

  const handleTrimPointerDown = (edge: 'start' | 'end') => (event: ReactPointerEvent<HTMLDivElement>) => {
    event.stopPropagation();
    setIsTrimming(true);
    const startX = event.clientX;
    const initialStart = clip.startTime ?? 0;
    const initialDuration = clip.duration ?? 1000;
    const initialTrimStart = clip.type === 'audio' ? 0 : clip.trimStart ?? 0;
    const initialTrimEnd = clip.type === 'audio' ? 0 : clip.trimEnd ?? 0;

    const onMove = (moveEvent: PointerEvent) => {
      const deltaPx = moveEvent.clientX - startX;
      const deltaMs = (deltaPx / zoom) * 1000;
      let newStart = initialStart;
      let newDuration = initialDuration;
      if (edge === 'start') {
        newStart = initialStart + deltaMs;
        newDuration = initialDuration - deltaMs;
      } else {
        newDuration = initialDuration + deltaMs;
      }
      newDuration = Math.max(200, newDuration);
      if (edge === 'start') {
        newStart = Math.min(newStart, initialStart + initialDuration - 200);
      }
      const snappedStart = edge === 'start' ? applySnapping(newStart) : newStart;
      const startTime = Math.max(0, snappedStart);
      const duration = edge === 'start'
        ? Math.max(200, initialStart + initialDuration - startTime)
        : newDuration;
      const endTime = startTime + duration;
      const trimUpdates: Partial<Clip> =
        clip.type === 'audio'
          ? {}
          : edge === 'start'
            ? { trimStart: Math.max(0, initialTrimStart + startTime - initialStart) }
            : { trimEnd: Math.max(0, initialTrimEnd - (duration - initialDuration)) };
      pendingTrim.current = {
        startTime,
        duration,
        endTime,
        ...trimUpdates,
      };
      commitUpdate(
        pendingTrim.current,
        true
      );
    };

    const onUp = () => {
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
      document.removeEventListener('pointercancel', onUp);
      if (pendingTrim.current) {
        commitUpdate(pendingTrim.current, false);
        pendingTrim.current = null;
      }
      setIsTrimming(false);
    };

    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp);
    document.addEventListener('pointercancel', onUp);
  };

  const handleDelete = () => {
    deleteTimelineItems(commandSelection);
  };

  const duplicateItem = () => {
    duplicateTimelineItems(commandSelection, timeline.gridSize || 100);
  };

  const toggleMute = () => {
    if (clip.type === 'audio') {
      updateAudioTrack(clip.id, { isMuted: !clip.isMuted });
    }
  };

  const clipColors = clip.type === 'audio'
    ? 'bg-accent/20 border-accent/40'
    : 'bg-primary/20 border-primary/40';

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div
          ref={dragRef}
          className="absolute cursor-move overflow-hidden transition-all"
          style={{
            width: `${widthPx}px`,
            left: `${leftPx}px`,
            top: '4px',
            height: 'calc(100% - 8px)',
            background: clip.type === 'audio' 
              ? `linear-gradient(135deg, #7E12FF 0%, #5209B8 100%)`
              : `linear-gradient(135deg, #3B82F6 0%, #1E40AF 100%)`,
            borderRadius: '4px',
            border: isSelected ? '2px solid #7E12FF' : '1px solid rgba(255, 255, 255, 0.1)',
            opacity: isDragging || isTrimming ? 0.5 : 1,
            boxShadow: isSelected 
              ? '0 0 0 1px rgba(126, 18, 255, 0.5), 0 4px 12px rgba(126, 18, 255, 0.3)'
              : '0 2px 8px rgba(0, 0, 0, 0.15)',
          }}
          onClick={handleSelect}
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={() => setIsHovered(false)}
        >
          {/* Thumbnail strip for video clips */}
          {clip.type !== 'audio' && 'url' in clip && clip.url && (
            <div 
              className="absolute inset-0 opacity-30"
              style={{
                backgroundImage: `url(${clip.url})`,
                backgroundSize: 'auto 100%',
                backgroundRepeat: 'repeat-x',
                backgroundPosition: 'left center',
              }}
            />
          )}

          {/* Gradient overlay */}
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              background: 'linear-gradient(to bottom, transparent 0%, rgba(0, 0, 0, 0.3) 100%)',
            }}
          />

          {/* Clip name label */}
          <div
            className="absolute top-0 left-0 flex items-center gap-1 px-2 py-1 pointer-events-none truncate"
            style={{
              background: 'rgba(0, 0, 0, 0.5)',
              borderBottomRightRadius: '4px',
              fontSize: '11px',
              color: 'white',
              maxWidth: 'calc(100% - 32px)',
            }}
          >
            {clip.type === 'audio' ? (
              <Music className="w-3 h-3 flex-shrink-0" />
            ) : (
              <Film className="w-3 h-3 flex-shrink-0" />
            )}
            <span className="truncate">{clip.name || 'Unnamed'}</span>
          </div>

          {/* Left resize handle */}
          <div
            className="absolute left-0 top-0 bottom-0 transition-all"
            style={{
              width: isHovered ? '8px' : '2px',
              cursor: 'ew-resize',
              background: isHovered ? 'rgba(255, 255, 255, 0.3)' : 'transparent',
              borderLeft: isHovered ? '2px solid rgba(255, 255, 255, 0.8)' : 'none',
            }}
            onPointerDown={handleTrimPointerDown('start')}
            onClick={(e) => e.stopPropagation()}
          />
          
          {/* Right resize handle */}
          <div
            className="absolute right-0 top-0 bottom-0 transition-all"
            style={{
              width: isHovered ? '8px' : '2px',
              cursor: 'ew-resize',
              background: isHovered ? 'rgba(255, 255, 255, 0.3)' : 'transparent',
              borderRight: isHovered ? '2px solid rgba(255, 255, 255, 0.8)' : 'none',
            }}
            onPointerDown={handleTrimPointerDown('end')}
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent className="bg-card text-foreground border-border">
        <ContextMenuItem
          onSelect={(event) => {
            event.preventDefault();
            duplicateItem();
          }}
        >
          Duplicate
        </ContextMenuItem>
        <ContextMenuItem
          onSelect={(event) => {
            event.preventDefault();
            handleDelete();
          }}
        >
          Delete
        </ContextMenuItem>
        {clip.type === 'audio' && (
          <>
            <ContextMenuSeparator />
            <ContextMenuItem
              onSelect={(event) => {
                event.preventDefault();
                toggleMute();
              }}
            >
              {clip.isMuted ? 'Unmute' : 'Mute'}
            </ContextMenuItem>
          </>
        )}
      </ContextMenuContent>
    </ContextMenu>
  );
}

const formatTime = (ms: number) => {
  const seconds = Math.floor(ms / 1000);
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
};
