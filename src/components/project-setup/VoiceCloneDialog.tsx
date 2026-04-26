import React, { useState, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import {
  Upload,
  Mic,
  FileAudio,
  X,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Info,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

const ACCEPTED_AUDIO_TYPES = ['audio/mpeg', 'audio/wav', 'audio/x-wav', 'audio/wave'];
const ACCEPTED_EXTENSIONS = ['.mp3', '.wav'];
const MIN_DURATION_SECONDS = 30;
const MAX_DURATION_SECONDS = 300; // 5 minutes
const MAX_FILE_SIZE_MB = 50;

interface VoiceCloneDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: (voiceId: string, voiceName: string, previewUrl: string) => void;
}

type UploadStage = 'idle' | 'validating' | 'uploading' | 'success' | 'error';

export const VoiceCloneDialog: React.FC<VoiceCloneDialogProps> = ({
  open,
  onOpenChange,
  onSuccess,
}) => {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [voiceName, setVoiceName] = useState('');
  const [audioDuration, setAudioDuration] = useState<number | null>(null);
  const [uploadStage, setUploadStage] = useState<UploadStage>('idle');
  const [uploadProgress, setUploadProgress] = useState(0);
  const [errorMessage, setErrorMessage] = useState('');
  const [validationError, setValidationError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const resetState = useCallback(() => {
    setSelectedFile(null);
    setVoiceName('');
    setAudioDuration(null);
    setUploadStage('idle');
    setUploadProgress(0);
    setErrorMessage('');
    setValidationError('');
  }, []);

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) {
      resetState();
    }
    onOpenChange(nextOpen);
  };

  const validateAudioFile = useCallback(
    (file: File): Promise<number> => {
      return new Promise((resolve, reject) => {
        // Check file type
        const ext = '.' + file.name.split('.').pop()?.toLowerCase();
        if (
          !ACCEPTED_AUDIO_TYPES.includes(file.type) &&
          !ACCEPTED_EXTENSIONS.includes(ext)
        ) {
          reject(new Error('Invalid file format. Please upload an MP3 or WAV file.'));
          return;
        }

        // Check file size
        const fileSizeMB = file.size / (1024 * 1024);
        if (fileSizeMB > MAX_FILE_SIZE_MB) {
          reject(
            new Error(`File too large (${fileSizeMB.toFixed(1)}MB). Maximum size is ${MAX_FILE_SIZE_MB}MB.`)
          );
          return;
        }

        // Check audio duration using Web Audio API
        const audio = new Audio();
        const url = URL.createObjectURL(file);
        audio.src = url;

        audio.addEventListener('loadedmetadata', () => {
          URL.revokeObjectURL(url);
          const duration = audio.duration;

          if (!isFinite(duration) || duration <= 0) {
            reject(new Error('Could not determine audio duration. Please try a different file.'));
            return;
          }

          if (duration < MIN_DURATION_SECONDS) {
            reject(
              new Error(
                `Audio is too short (${Math.round(duration)}s). Minimum duration is ${MIN_DURATION_SECONDS} seconds.`
              )
            );
            return;
          }

          if (duration > MAX_DURATION_SECONDS) {
            reject(
              new Error(
                `Audio is too long (${Math.round(duration)}s). Maximum duration is ${MAX_DURATION_SECONDS / 60} minutes.`
              )
            );
            return;
          }

          resolve(duration);
        });

        audio.addEventListener('error', () => {
          URL.revokeObjectURL(url);
          reject(new Error('Failed to read audio file. Please try a different file.'));
        });
      });
    },
    []
  );

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setValidationError('');
    setErrorMessage('');
    setUploadStage('validating');

    try {
      const duration = await validateAudioFile(file);
      setSelectedFile(file);
      setAudioDuration(duration);
      setUploadStage('idle');

      // Auto-generate voice name if empty
      if (!voiceName) {
        const baseName = file.name.replace(/\.[^/.]+$/, '');
        setVoiceName(baseName);
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown validation error';
      setValidationError(message);
      setSelectedFile(null);
      setAudioDuration(null);
      setUploadStage('idle');
    }

    // Reset file input so same file can be re-selected
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault();
      const file = e.dataTransfer.files?.[0];
      if (!file) return;

      setValidationError('');
      setErrorMessage('');
      setUploadStage('validating');

      try {
        const duration = await validateAudioFile(file);
        setSelectedFile(file);
        setAudioDuration(duration);
        setUploadStage('idle');

        if (!voiceName) {
          const baseName = file.name.replace(/\.[^/.]+$/, '');
          setVoiceName(baseName);
        }
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Unknown validation error';
        setValidationError(message);
        setSelectedFile(null);
        setAudioDuration(null);
        setUploadStage('idle');
      }
    },
    [validateAudioFile, voiceName]
  );

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleRemoveFile = () => {
    setSelectedFile(null);
    setAudioDuration(null);
    setValidationError('');
  };

  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        // reader.result is data:audio/mpeg;base64,... — extract just the base64 part
        const result = reader.result as string;
        const base64 = result.split(',')[1];
        resolve(base64);
      };
      reader.onerror = () => reject(new Error('Failed to read file'));
      reader.readAsDataURL(file);
    });
  };

  const handleUpload = async () => {
    if (!selectedFile || !voiceName.trim()) {
      toast.error('Please provide a voice name and audio file');
      return;
    }

    setUploadStage('uploading');
    setUploadProgress(0);
    setErrorMessage('');

    try {
      // Simulate progress for the base64 encoding phase
      setUploadProgress(10);

      const audioBase64 = await fileToBase64(selectedFile);
      setUploadProgress(30);

      // Simulate progress during API call
      const progressInterval = setInterval(() => {
        setUploadProgress((prev) => Math.min(prev + 5, 85));
      }, 500);

      const { data, error } = await supabase.functions.invoke('elevenlabs-voices', {
        body: {
          action: 'clone',
          name: voiceName.trim(),
          description: `Cloned voice: ${voiceName.trim()}`,
          audioBase64,
          audioFileName: selectedFile.name,
        },
      });

      clearInterval(progressInterval);

      if (error) throw error;

      if (data?.error) {
        throw new Error(data.error);
      }

      setUploadProgress(100);
      setUploadStage('success');

      const voiceId = data.voice_id;
      const previewUrl = data.voice?.preview_url || '';

      toast.success(`Voice "${voiceName.trim()}" cloned successfully!`);

      // Slight delay to show success state before closing
      setTimeout(() => {
        onSuccess(voiceId, voiceName.trim(), previewUrl);
        handleOpenChange(false);
      }, 1200);
    } catch (err: unknown) {
      console.error('Voice clone error:', err);
      setUploadStage('error');
      const message = err instanceof Error ? err.message : 'Failed to clone voice. Please try again.';
      setErrorMessage(message);
    }
  };

  const formatDuration = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.round(seconds % 60);
    return mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-md bg-[#111319] border-zinc-700">
        <DialogHeader>
          <DialogTitle className="text-white flex items-center gap-2">
            <Mic className="w-5 h-5 text-primary" />
            Clone Voice
          </DialogTitle>
          <DialogDescription className="text-zinc-400">
            Upload a clear audio recording of the voice you want to clone. For best results, use a
            clean recording with minimal background noise.
          </DialogDescription>
        </DialogHeader>

        {/* Requirements */}
        <div className="flex items-start gap-2 p-3 rounded-lg bg-zinc-800/50 border border-zinc-700/50">
          <Info className="w-4 h-4 text-primary mt-0.5 shrink-0" />
          <div className="text-xs text-zinc-400 space-y-1">
            <p>
              <strong className="text-zinc-300">Format:</strong> MP3 or WAV
            </p>
            <p>
              <strong className="text-zinc-300">Duration:</strong> 30 seconds to 5 minutes
            </p>
            <p>
              <strong className="text-zinc-300">Quality:</strong> Clear speech, minimal background
              noise
            </p>
          </div>
        </div>

        {/* Voice Name Input */}
        <div className="space-y-2">
          <Label htmlFor="voice-name" className="text-sm text-zinc-400">
            Voice Name
          </Label>
          <Input
            id="voice-name"
            value={voiceName}
            onChange={(e) => setVoiceName(e.target.value)}
            placeholder="e.g., My Custom Voice"
            className="bg-[#18191E] border-zinc-700"
            disabled={uploadStage === 'uploading' || uploadStage === 'success'}
          />
        </div>

        {/* Upload Area */}
        <AnimatePresence mode="wait">
          {!selectedFile ? (
            <motion.div
              key="dropzone"
              initial={{ opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -5 }}
            >
              <div
                onDrop={handleDrop}
                onDragOver={handleDragOver}
                onClick={() => fileInputRef.current?.click()}
                className={cn(
                  'relative flex flex-col items-center justify-center p-8 border-2 border-dashed rounded-lg cursor-pointer transition-all',
                  'border-zinc-600 hover:border-primary/50 hover:bg-primary/5',
                  uploadStage === 'validating' && 'border-primary/50 bg-primary/5 pointer-events-none'
                )}
              >
                {uploadStage === 'validating' ? (
                  <Loader2 className="w-8 h-8 text-primary animate-spin" />
                ) : (
                  <Upload className="w-8 h-8 text-zinc-500 mb-3" />
                )}
                <p className="text-sm text-zinc-400 text-center">
                  {uploadStage === 'validating'
                    ? 'Validating audio...'
                    : 'Drop audio file here or click to browse'}
                </p>
                <p className="text-xs text-zinc-600 mt-1">MP3 or WAV • 30s–5min</p>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept=".mp3,.wav,audio/mpeg,audio/wav"
                onChange={handleFileSelect}
                className="hidden"
              />
            </motion.div>
          ) : (
            <motion.div
              key="file-info"
              initial={{ opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -5 }}
              className="flex items-center gap-3 p-3 rounded-lg bg-zinc-800/50 border border-zinc-700"
            >
              <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                <FileAudio className="w-5 h-5 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-white truncate">{selectedFile.name}</p>
                <p className="text-xs text-zinc-500">
                  {(selectedFile.size / (1024 * 1024)).toFixed(1)}MB
                  {audioDuration !== null && ` • ${formatDuration(audioDuration)}`}
                </p>
              </div>
              {uploadStage !== 'uploading' && uploadStage !== 'success' && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 w-8 p-0 text-zinc-400 hover:text-white"
                  onClick={handleRemoveFile}
                >
                  <X className="w-4 h-4" />
                </Button>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Validation Error */}
        {validationError && (
          <motion.div
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-start gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/20"
          >
            <AlertCircle className="w-4 h-4 text-red-400 mt-0.5 shrink-0" />
            <p className="text-sm text-red-400">{validationError}</p>
          </motion.div>
        )}

        {/* Upload Progress */}
        {(uploadStage === 'uploading' || uploadStage === 'success') && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            className="space-y-2"
          >
            <div className="flex items-center justify-between text-xs">
              <span className="text-zinc-400">
                {uploadStage === 'success' ? 'Voice cloned!' : 'Cloning voice...'}
              </span>
              <span className="text-zinc-500">{uploadProgress}%</span>
            </div>
            <Progress
              value={uploadProgress}
              className="h-2 bg-zinc-800"
            />
            {uploadStage === 'success' && (
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                className="flex items-center gap-2 text-sm text-green-400"
              >
                <CheckCircle2 className="w-4 h-4" />
                Voice cloned successfully!
              </motion.div>
            )}
          </motion.div>
        )}

        {/* Error Message */}
        {uploadStage === 'error' && errorMessage && (
          <motion.div
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-start gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/20"
          >
            <AlertCircle className="w-4 h-4 text-red-400 mt-0.5 shrink-0" />
            <div>
              <p className="text-sm text-red-400">{errorMessage}</p>
              <Button
                variant="link"
                size="sm"
                className="text-red-400 hover:text-red-300 p-0 h-auto mt-1"
                onClick={() => {
                  setUploadStage('idle');
                  setErrorMessage('');
                  setUploadProgress(0);
                }}
              >
                Try again
              </Button>
            </div>
          </motion.div>
        )}

        <DialogFooter className="gap-2">
          <Button
            variant="outline"
            onClick={() => handleOpenChange(false)}
            disabled={uploadStage === 'uploading'}
            className="border-zinc-700"
          >
            Cancel
          </Button>
          <Button
            onClick={handleUpload}
            disabled={
              !selectedFile ||
              !voiceName.trim() ||
              uploadStage === 'uploading' ||
              uploadStage === 'success'
            }
            className="bg-primary hover:bg-primary/90"
          >
            {uploadStage === 'uploading' ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Cloning...
              </>
            ) : (
              <>
                <Mic className="w-4 h-4 mr-2" />
                Clone Voice
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
