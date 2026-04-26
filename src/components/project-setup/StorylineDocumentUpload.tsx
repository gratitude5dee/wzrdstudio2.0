import { useState, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { FileText, Upload, Loader2, X, Link as LinkIcon } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import {
  documentService,
  ACCEPTED_DOCUMENT_EXTENSIONS,
} from '@/services/documentService';
import { cn } from '@/lib/utils';

interface StorylineDocumentUploadProps {
  /** Called with the parsed text so the parent can use it as storyline input */
  onTextParsed: (text: string) => void;
  disabled?: boolean;
}

/**
 * Document upload section for the Storyline tab.
 * Supports PDF, DOCX, MD, TXT file upload (and optional URL import).
 * Uses the same documentService / document-parse edge function as the Concept tab.
 */
export function StorylineDocumentUpload({
  onTextParsed,
  disabled = false,
}: StorylineDocumentUploadProps) {
  const [isParsing, setIsParsing] = useState(false);
  const [showUrlInput, setShowUrlInput] = useState(false);
  const [urlValue, setUrlValue] = useState('');
  const [isLoadingUrl, setIsLoadingUrl] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = useCallback(
    async (file: File) => {
      setIsParsing(true);
      setFileName(file.name);
      try {
        const result = await documentService.parseDocument(file);
        onTextParsed(result.text);
        const suffix = result.pageCount ? ` (${result.pageCount} pages)` : '';
        toast.success(`Document loaded${suffix}`);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Failed to parse document';
        toast.error(msg);
        setFileName(null);
      } finally {
        setIsParsing(false);
      }
    },
    [onTextParsed],
  );

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFileSelect(file);
    // Reset so the same file can be re-selected
    e.target.value = '';
  };

  // Drag-and-drop handlers
  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDragIn = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer.items?.length) setDragActive(true);
  }, []);

  const handleDragOut = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setDragActive(false);
      const file = e.dataTransfer.files?.[0];
      if (file) handleFileSelect(file);
    },
    [handleFileSelect],
  );

  const handleUrlImport = async () => {
    const trimmed = urlValue.trim();
    if (!trimmed) return;
    try {
      new URL(trimmed); // validate
    } catch {
      toast.error('Please enter a valid URL');
      return;
    }

    setIsLoadingUrl(true);
    try {
      // Use the document-parse edge function with a URL body
      const { supabase } = await import('@/integrations/supabase/client');
      const { data, error } = await supabase.functions.invoke('document-parse', {
        body: { url: trimmed },
      });

      if (error) {
        const msg =
          typeof error === 'object' && error !== null && 'message' in error
            ? (error as { message: string }).message
            : String(error);
        throw new Error(msg || 'Failed to fetch URL');
      }

      if (!data || typeof data.text !== 'string') {
        throw new Error('Invalid response from document parser');
      }

      onTextParsed(data.text);
      toast.success('Content imported from URL');
      setUrlValue('');
      setShowUrlInput(false);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to import from URL';
      toast.error(msg);
    } finally {
      setIsLoadingUrl(false);
    }
  };

  return (
    <div className="space-y-3">
      {/* Drop zone */}
      <div
        className={cn(
          'relative rounded-lg border-2 border-dashed transition-colors duration-200 p-6',
          dragActive
            ? 'border-primary bg-primary/10'
            : 'border-zinc-700 hover:border-zinc-500 bg-zinc-900/50',
          disabled && 'opacity-50 pointer-events-none',
        )}
        onDragEnter={handleDragIn}
        onDragLeave={handleDragOut}
        onDragOver={handleDrag}
        onDrop={handleDrop}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept={ACCEPTED_DOCUMENT_EXTENSIONS}
          className="hidden"
          onChange={handleInputChange}
          disabled={disabled || isParsing}
        />

        <AnimatePresence mode="wait">
          {isParsing ? (
            <motion.div
              key="parsing"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex flex-col items-center gap-2 text-center"
            >
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
              <p className="text-sm text-zinc-300">
                Parsing <span className="font-medium">{fileName}</span>…
              </p>
            </motion.div>
          ) : (
            <motion.div
              key="idle"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex flex-col items-center gap-3 text-center"
            >
              <div className="rounded-full bg-zinc-800 p-3">
                <Upload className="w-6 h-6 text-zinc-400" />
              </div>
              <div>
                <p className="text-sm text-zinc-300">
                  Drag &amp; drop a script, chapter, or treatment
                </p>
                <p className="text-xs text-zinc-500 mt-1">
                  PDF, DOCX, MD, TXT — up to 10 MB
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="bg-zinc-800 border-zinc-700 text-zinc-300 hover:bg-zinc-700"
                onClick={() => fileInputRef.current?.click()}
                disabled={disabled}
              >
                <FileText className="w-4 h-4 mr-2" />
                Browse files
              </Button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* URL import toggle */}
      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="sm"
          className="text-xs text-zinc-500 hover:text-zinc-300"
          onClick={() => setShowUrlInput(!showUrlInput)}
          disabled={disabled}
        >
          <LinkIcon className="w-3.5 h-3.5 mr-1.5" />
          {showUrlInput ? 'Hide URL import' : 'Import from URL'}
        </Button>
      </div>

      {/* URL input */}
      <AnimatePresence>
        {showUrlInput && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="flex gap-2">
              <Input
                placeholder="https://example.com/script.pdf"
                value={urlValue}
                onChange={(e) => setUrlValue(e.target.value)}
                className="bg-zinc-900 border-zinc-700 text-sm"
                disabled={isLoadingUrl || disabled}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleUrlImport();
                }}
              />
              <Button
                size="sm"
                variant="outline"
                className="bg-zinc-800 border-zinc-700 text-zinc-300 hover:bg-zinc-700 shrink-0"
                onClick={handleUrlImport}
                disabled={isLoadingUrl || !urlValue.trim() || disabled}
              >
                {isLoadingUrl ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  'Import'
                )}
              </Button>
              <Button
                size="icon"
                variant="ghost"
                className="shrink-0 text-zinc-500 hover:text-zinc-300"
                onClick={() => {
                  setShowUrlInput(false);
                  setUrlValue('');
                }}
              >
                <X className="w-4 h-4" />
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
