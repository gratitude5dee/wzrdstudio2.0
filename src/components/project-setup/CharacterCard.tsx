import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  User,
  Pencil,
  Trash2,
  Sparkles,
  Loader2,
  ImagePlus,
  CheckCircle2,
  AlertCircle,
  Clock,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { CharacterEditDialog } from './CharacterEditDialog';
import { Character } from './types';

interface CharacterCardProps {
  character: Character;
  onDelete: (characterId: string) => void;
  styleReferenceUrl?: string;
  isVoiceSelected?: boolean;
  onSelect?: (character: Character) => void;
}

const STATUS_BADGE: Record<string, { icon: React.ReactNode; label: string; className: string }> = {
  pending: {
    icon: <Clock className="w-3 h-3" />,
    label: 'Pending',
    className: 'bg-zinc-700/80 text-zinc-300',
  },
  generating: {
    icon: <Loader2 className="w-3 h-3 animate-spin" />,
    label: 'Generating',
    className: 'bg-primary/20 text-primary',
  },
  completed: {
    icon: <CheckCircle2 className="w-3 h-3" />,
    label: 'Ready',
    className: 'bg-green-500/20 text-green-400',
  },
  failed: {
    icon: <AlertCircle className="w-3 h-3" />,
    label: 'Failed',
    className: 'bg-red-500/20 text-red-400',
  },
};

const CharacterCard: React.FC<CharacterCardProps> = ({
  character,
  onDelete,
  styleReferenceUrl,
  isVoiceSelected = false,
  onSelect,
}) => {
  const [isGenerating, setIsGenerating] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [progress, setProgress] = useState(0);
  const progressInterval = useRef<ReturnType<typeof setInterval> | null>(null);

  const isImageLoading = character.image_status === 'generating';
  const hasImage = !!character.image_url;
  const imageStatus = isGenerating ? 'generating' : (character.image_status || (hasImage ? 'completed' : 'pending'));
  const isActivelyGenerating = isGenerating || isImageLoading;

  // Progress bar simulation
  useEffect(() => {
    if (isActivelyGenerating) {
      setProgress(5);
      progressInterval.current = setInterval(() => {
        setProgress(prev => {
          if (prev < 30) return prev + 2;       // Phase 1: prompt (~3s)
          if (prev < 70) return prev + 1;       // Phase 2: image gen (~20s)
          if (prev < 90) return prev + 0.5;     // Phase 3: upload (~10s)
          return prev;                           // Hold at 90
        });
      }, 500);
    } else {
      if (progressInterval.current) {
        clearInterval(progressInterval.current);
        progressInterval.current = null;
      }
      if (imageStatus === 'completed' && progress > 0) {
        setProgress(100);
        const t = setTimeout(() => setProgress(0), 1500);
        return () => clearTimeout(t);
      }
      if (imageStatus === 'failed' && progress > 0) {
        // Keep current progress but color turns red via className
        const t = setTimeout(() => setProgress(0), 3000);
        return () => clearTimeout(t);
      }
    }
    return () => {
      if (progressInterval.current) clearInterval(progressInterval.current);
    };
  }, [isActivelyGenerating, imageStatus]);

  const handleGenerate = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isGenerating) return;

    setIsGenerating(true);
    setProgress(0);
    toast.info('Generating character image...');

    try {
      const { data, error } = await supabase.functions.invoke('generate-character-image', {
        body: {
          character_id: character.id,
          style_reference_url: styleReferenceUrl,
        },
      });

      if (error) throw error;
      if (data?.success) {
        toast.success('Character image generated!');
      }
    } catch (err) {
      console.error('Generate error:', err);
      toast.error(err instanceof Error ? err.message : 'Failed to generate image');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleEdit = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!hasImage) {
      toast.info('Generate an image first before editing');
      return;
    }
    setShowEditDialog(true);
  };

  const handleDelete = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm(`Delete ${character.name}?`)) return;

    setIsDeleting(true);
    try {
      onDelete(character.id);
    } finally {
      setIsDeleting(false);
    }
  };

  const badge = STATUS_BADGE[imageStatus];
  const showProgressBar = progress > 0;

  return (
    <>
      <motion.div
        layout
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95 }}
        transition={{ duration: 0.2 }}
      >
        <Card
          data-voice-character-id={character.id}
          onClick={() => onSelect?.(character)}
          className={cn(
            'relative bg-[#18191E] border border-zinc-700/60 w-56 aspect-[3/4] flex flex-col overflow-hidden transition-all duration-300 group hover:border-zinc-600 hover:shadow-lg hover:shadow-black/20',
            onSelect && 'cursor-pointer',
            isVoiceSelected &&
              'border-[#f97316]/70 ring-2 ring-[#f97316]/50 shadow-[0_0_0_4px_rgba(249,115,22,0.12),0_0_34px_rgba(249,115,22,0.28)]',
          )}
        >
          {isVoiceSelected && (
            <div className="pointer-events-none absolute inset-0 z-20 rounded-[inherit] border border-[#fed7aa]/40" />
          )}
          {/* Status Badge */}
          {badge && (
            <div className={cn(
              'absolute top-2 left-2 z-10 flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium backdrop-blur-sm',
              badge.className
            )}>
              {badge.icon}
              {badge.label}
            </div>
          )}

          {/* Progress Bar */}
          {showProgressBar && (
            <div className="absolute top-0 left-0 right-0 z-20 h-1 bg-zinc-800">
              <div
                className={cn(
                  'h-full transition-all duration-500 ease-out rounded-r-full',
                  imageStatus === 'failed' ? 'bg-red-500' : 'bg-primary'
                )}
                style={{ width: `${progress}%` }}
              />
            </div>
          )}

          {/* Image Area */}
          <div className="flex-1 bg-[#0D0E12] flex items-center justify-center relative overflow-hidden">
            <AnimatePresence mode="wait">
              {character.image_url ? (
                <motion.img
                  key="image"
                  src={character.image_url}
                  alt={character.name}
                  initial={{ opacity: 0, scale: 1.05 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.3 }}
                  className="w-full h-full object-cover"
                />
              ) : isActivelyGenerating ? (
                <motion.div
                  key="loading"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="flex flex-col items-center justify-center text-center p-4"
                >
                  <div className="relative">
                    <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center">
                      <Loader2 className="h-8 w-8 text-primary animate-spin" />
                    </div>
                    <Sparkles className="h-4 w-4 text-primary absolute -top-1 -right-1 animate-pulse" />
                  </div>
                  <p className="text-xs text-zinc-400 mt-3">
                    {progress < 30 ? 'Creating prompt...' : progress < 70 ? 'Generating image...' : 'Uploading...'}
                  </p>
                  <p className="text-[10px] text-zinc-600 mt-1">{Math.round(progress)}%</p>
                </motion.div>
              ) : (
                <motion.div
                  key="placeholder"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="flex flex-col items-center justify-center text-zinc-700"
                >
                  <div className="w-16 h-16 rounded-full bg-zinc-800/50 flex items-center justify-center">
                    <User className="h-10 w-10" />
                  </div>
                  <p className="text-xs text-zinc-600 mt-2">No image</p>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Hover Overlay */}
            <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex flex-col items-center justify-end p-3">
              {!isActivelyGenerating && (
                <div className="w-full space-y-1.5">
                  <Button
                    variant="secondary"
                    size="sm"
                    className={cn(
                      'w-full h-8 text-xs bg-white/10 hover:bg-white/20 text-white border-0 backdrop-blur-sm',
                      !hasImage && 'opacity-40 cursor-not-allowed'
                    )}
                    onClick={handleEdit}
                    disabled={!hasImage}
                  >
                    <Pencil className="w-3.5 h-3.5 mr-1.5" />
                    Edit
                  </Button>

                  <Button
                    variant="secondary"
                    size="sm"
                    className="w-full h-8 text-xs bg-primary/20 hover:bg-primary/30 text-primary border-0 backdrop-blur-sm"
                    onClick={handleGenerate}
                    disabled={isGenerating}
                  >
                    {isGenerating ? (
                      <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                    ) : (
                      <ImagePlus className="w-3.5 h-3.5 mr-1.5" />
                    )}
                    {hasImage ? 'Regenerate' : 'Generate'}
                  </Button>

                  <Button
                    variant="secondary"
                    size="sm"
                    className="w-full h-8 text-xs bg-red-500/10 hover:bg-red-500/20 text-red-400 border-0 backdrop-blur-sm"
                    onClick={handleDelete}
                    disabled={isDeleting}
                  >
                    {isDeleting ? (
                      <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                    ) : (
                      <Trash2 className="w-3.5 h-3.5 mr-1.5" />
                    )}
                    Delete
                  </Button>
                </div>
              )}
            </div>
          </div>

          {/* Info Footer */}
          <CardContent className="p-3 bg-[#18191E] border-t border-zinc-800/50">
            <h3 className="font-medium text-sm text-white truncate">{character.name}</h3>
            <p className="text-xs text-zinc-500 mt-0.5 line-clamp-1">
              {character.description || 'No description'}
            </p>
            {character.image_status === 'failed' && character.image_generation_error && (
              <p className="text-[10px] text-red-400/80 mt-1 truncate">
                {character.image_generation_error}
              </p>
            )}
          </CardContent>
        </Card>
      </motion.div>

      <CharacterEditDialog
        character={character}
        open={showEditDialog}
        onOpenChange={setShowEditDialog}
        styleReferenceUrl={styleReferenceUrl}
      />
    </>
  );
};

export default CharacterCard;
