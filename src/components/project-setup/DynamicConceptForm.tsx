import React, { useEffect, useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ProjectFormat, ProjectData, AdBriefData, MusicVideoData, ShortFilmData } from './types';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Activity, Camera, Clapperboard, FileText, RefreshCw, Loader2, ImageIcon, X, Music, Palette, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { documentService, ACCEPTED_DOCUMENT_EXTENSIONS } from '@/services/documentService';
import { cn } from '@/lib/utils';
import { musicStyleRange } from '@/lib/musicPolishAssets';
import { useProjectContext } from './ProjectContext';
import { useAuth } from '@/providers/AuthProvider';
import { MetaPromptEditor } from './MetaPromptEditor';
import { MusicProductionPanel } from './MusicProductionPanel';

interface DynamicConceptFormProps {
  format: ProjectFormat;
  projectData: ProjectData;
  updateProjectData: (data: Partial<ProjectData>) => void;
}

interface ExampleConcept {
  title: string;
  description: string;
  type: 'logline' | 'storyline';
}

export const DynamicConceptForm: React.FC<DynamicConceptFormProps> = ({
  format,
  projectData,
  updateProjectData,
}) => {
  switch (format) {
    case 'commercial':
      return <CommercialForm projectData={projectData} updateProjectData={updateProjectData} />;
    case 'music_video':
      return <MusicVideoForm projectData={projectData} updateProjectData={updateProjectData} />;
    case 'infotainment':
      return <InfotainmentForm projectData={projectData} updateProjectData={updateProjectData} />;
    case 'short_film':
      return <ShortFilmForm projectData={projectData} updateProjectData={updateProjectData} />;
    case 'custom':
    default:
      return <DefaultConceptForm projectData={projectData} updateProjectData={updateProjectData} />;
  }
};

const CommercialForm: React.FC<{
  projectData: ProjectData;
  updateProjectData: (data: Partial<ProjectData>) => void;
}> = ({ projectData, updateProjectData }) => {
  const [productImagePreview, setProductImagePreview] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const { projectId } = useProjectContext();
  const { user } = useAuth();

  const defaultAdBrief: AdBriefData = {
    product: '',
    targetAudience: '',
    mainMessage: '',
    callToAction: '',
    adDuration: '30s',
    platform: 'all',
    brandGuidelines: '',
    brandName: '',
    productType: '',
    tone: '',
    productImageUrl: '',
  };
  const adBrief = projectData.adBrief || defaultAdBrief;

  // Initialize preview from existing URL
  useEffect(() => {
    if (adBrief.productImageUrl && !productImagePreview) {
      setProductImagePreview(adBrief.productImageUrl);
    }
  }, [adBrief.productImageUrl, productImagePreview]);

  const updateAdBrief = (field: keyof AdBriefData, value: string) => {
    updateProjectData({
      adBrief: { ...adBrief, [field]: value },
      product: field === 'product' ? value : projectData.product,
      targetAudience: field === 'targetAudience' ? value : projectData.targetAudience,
      mainMessage: field === 'mainMessage' ? value : projectData.mainMessage,
      callToAction: field === 'callToAction' ? value : projectData.callToAction,
    });
  };

  const handleProductImageUpload = async (file: File) => {
    if (!file.type.startsWith('image/')) {
      toast.error('Please upload an image file');
      return;
    }

    // Show immediate preview using blob URL
    const previewUrl = URL.createObjectURL(file);
    setProductImagePreview(previewUrl);

    // Upload to Supabase Storage for persistent URL
    if (user) {
      setIsUploading(true);
      try {
        const fileExt = file.name.split('.').pop() || 'jpg';
        const fileName = `${crypto.randomUUID()}.${fileExt}`;
        const storagePath = `${user.id}/${projectId ?? 'general'}/product-images/${fileName}`;

        const { error: uploadError } = await supabase.storage
          .from('project-media')
          .upload(storagePath, file, {
            cacheControl: '3600',
            upsert: false,
          });

        if (uploadError) throw uploadError;

        const { data: urlData } = supabase.storage
          .from('project-media')
          .getPublicUrl(storagePath);

        const persistentUrl = urlData?.publicUrl ?? previewUrl;

        // Revoke the blob preview now that we have a persistent URL
        URL.revokeObjectURL(previewUrl);
        setProductImagePreview(persistentUrl);
        updateProjectData({
          adBrief: { ...adBrief, productImageUrl: persistentUrl },
        });
        toast.success('Product image uploaded');
      } catch (err) {
        console.error('Failed to upload product image to storage:', err);
        // Fall back to blob URL if upload fails
        updateProjectData({
          adBrief: { ...adBrief, productImageUrl: previewUrl },
        });
        toast.error('Image saved locally — storage upload failed');
      } finally {
        setIsUploading(false);
      }
    } else {
      // No user — use blob URL as fallback
      updateProjectData({
        adBrief: { ...adBrief, productImageUrl: previewUrl },
      });
      toast.success('Product image added');
    }
  };

  const handleRemoveProductImage = () => {
    if (productImagePreview) {
      URL.revokeObjectURL(productImagePreview);
    }
    setProductImagePreview(null);
    updateProjectData({
      adBrief: { ...adBrief, productImageUrl: '' },
    });
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleProductImageUpload(file);
  };

  return (
    <div className="space-y-6">
      <div className="p-4 rounded-lg bg-gradient-to-r from-orange-500/10 to-amber-500/10 border border-orange-500/20">
        <h3 className="text-lg font-semibold text-orange-400 mb-1">Ad Brief Builder</h3>
        <p className="text-sm text-zinc-400">
          Following AdCP (Advertising Creative Platform) standards for professional commercial production
        </p>
      </div>

      {/* Product Reference Image Upload */}
      <div className="space-y-3">
        <Label className="text-sm text-zinc-400 uppercase tracking-wide flex items-center gap-2">
          <ImageIcon className="w-4 h-4" />
          Product Reference Image
          <span className="text-xs text-zinc-500">(Optional)</span>
        </Label>

        <AnimatePresence mode="wait">
          {productImagePreview ? (
            <motion.div
              key="preview"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="relative group"
            >
              <div className="aspect-video max-w-xs rounded-lg overflow-hidden border border-zinc-700 bg-[#111319]">
                <img
                  src={productImagePreview}
                  alt="Product Reference"
                  className="w-full h-full object-cover"
                />
                <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                  <Button variant="destructive" size="sm" onClick={handleRemoveProductImage}>
                    <X className="w-4 h-4 mr-2" />
                    Remove
                  </Button>
                </div>
              </div>
              {isUploading && (
                <div className="absolute inset-0 bg-black/40 flex items-center justify-center rounded-lg">
                  <Loader2 className="w-6 h-6 animate-spin text-white" />
                </div>
              )}
              <p className="text-xs text-zinc-500 mt-2">
                This image will be used as a visual reference for the product in your commercial
              </p>
            </motion.div>
          ) : (
            <motion.div
              key="upload"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={cn(
                'relative border-2 border-dashed rounded-lg p-6 flex flex-col items-center justify-center gap-2 cursor-pointer transition-all max-w-xs',
                isDragging
                  ? 'border-primary bg-primary/5'
                  : 'border-zinc-700 hover:border-zinc-500 bg-[#18191E]'
              )}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleProductImageUpload(file);
                }}
                className="hidden"
              />
              <div className="w-10 h-10 rounded-full bg-zinc-800 flex items-center justify-center">
                <ImageIcon className="w-5 h-5 text-zinc-400" />
              </div>
              <p className="text-sm text-zinc-400">
                {isDragging ? 'Drop image here' : 'Upload product image'}
              </p>
              <p className="text-xs text-zinc-500">or click to browse</p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label className="text-sm text-zinc-400 uppercase tracking-wide">
            Brand Name
          </Label>
          <Input
            value={adBrief.brandName || ''}
            onChange={(e) => updateAdBrief('brandName', e.target.value)}
            placeholder="e.g., Nike, Apple, Tesla"
            className="bg-[#111319] border-zinc-700"
          />
        </div>
        <div className="space-y-2">
          <Label className="text-sm text-zinc-400 uppercase tracking-wide">
            Product Type
          </Label>
          <Input
            value={adBrief.productType || ''}
            onChange={(e) => updateAdBrief('productType', e.target.value)}
            placeholder="e.g., Running shoe, Smartphone, Electric car"
            className="bg-[#111319] border-zinc-700"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label className="text-sm text-zinc-400 uppercase tracking-wide">
            Product / Service <span className="text-red-400">*</span>
          </Label>
          <Input
            value={adBrief.product}
            onChange={(e) => updateAdBrief('product', e.target.value)}
            placeholder="e.g., Nike Air Max 2025"
            className="bg-[#111319] border-zinc-700"
          />
        </div>
        <div className="space-y-2">
          <Label className="text-sm text-zinc-400 uppercase tracking-wide">
            Target Audience <span className="text-red-400">*</span>
          </Label>
          <Input
            value={adBrief.targetAudience}
            onChange={(e) => updateAdBrief('targetAudience', e.target.value)}
            placeholder="e.g., Active millennials aged 25-35"
            className="bg-[#111319] border-zinc-700"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label className="text-sm text-zinc-400 uppercase tracking-wide">
            Tone
          </Label>
          <Input
            value={adBrief.tone || ''}
            onChange={(e) => updateAdBrief('tone', e.target.value)}
            placeholder="e.g., Bold, Inspirational, Humorous, Professional"
            className="bg-[#111319] border-zinc-700"
          />
        </div>
        <div className="space-y-2">
          <Label className="text-sm text-zinc-400 uppercase tracking-wide">
            Ad Duration
          </Label>
          <Select
            value={adBrief.adDuration}
            onValueChange={(value) => updateAdBrief('adDuration', value)}
          >
            <SelectTrigger className="bg-[#111319] border-zinc-700">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="15s">15 seconds</SelectItem>
              <SelectItem value="30s">30 seconds</SelectItem>
              <SelectItem value="60s">60 seconds</SelectItem>
              <SelectItem value="90s">90 seconds</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-2">
        <Label className="text-sm text-zinc-400 uppercase tracking-wide">
          Key Message <span className="text-red-400">*</span>
        </Label>
        <Textarea
          value={adBrief.mainMessage}
          onChange={(e) => updateAdBrief('mainMessage', e.target.value)}
          placeholder="What's the single most important thing you want viewers to remember?"
          className="bg-[#111319] border-zinc-700 min-h-[80px]"
        />
      </div>

      <div className="space-y-2">
        <Label className="text-sm text-zinc-400 uppercase tracking-wide">
          Call to Action <span className="text-red-400">*</span>
        </Label>
        <Input
          value={adBrief.callToAction}
          onChange={(e) => updateAdBrief('callToAction', e.target.value)}
          placeholder="e.g., Visit nike.com/airmax"
          className="bg-[#111319] border-zinc-700"
        />
      </div>

      <div className="space-y-2">
        <Label className="text-sm text-zinc-400 uppercase tracking-wide">
          Primary Platform
        </Label>
        <Select
          value={adBrief.platform}
          onValueChange={(value) => updateAdBrief('platform', value)}
        >
          <SelectTrigger className="bg-[#111319] border-zinc-700">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Platforms</SelectItem>
            <SelectItem value="tv">Television</SelectItem>
            <SelectItem value="social">Social Media</SelectItem>
            <SelectItem value="youtube">YouTube</SelectItem>
            <SelectItem value="streaming">OTT/Streaming</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label className="text-sm text-zinc-400 uppercase tracking-wide flex items-center gap-2">
          Brand Guidelines
          <span className="text-xs text-zinc-500">(Optional)</span>
        </Label>
        <Textarea
          value={adBrief.brandGuidelines || ''}
          onChange={(e) => updateAdBrief('brandGuidelines', e.target.value)}
          placeholder="Color codes, typography, do's and don'ts, tone of voice..."
          className="bg-[#111319] border-zinc-700 min-h-[80px]"
        />
      </div>
    </div>
  );
};

const MusicVideoForm: React.FC<{
  projectData: ProjectData;
  updateProjectData: (data: Partial<ProjectData>) => void;
}> = ({ projectData, updateProjectData }) => {
  const [isParsingLyrics, setIsParsingLyrics] = useState(false);
  const [isDetectingBpm, setIsDetectingBpm] = useState(false);
  const audioInputRef = useRef<HTMLInputElement>(null);
  const { projectId: musicProjectId } = useProjectContext();

  const musicData = projectData.musicVideoData || {
    artistName: '',
    trackTitle: '',
    genre: '',
    lyrics: '',
    performanceRatio: 50,
  };

  const updateMusicData = (field: string, value: string | number | number[] | string[] | undefined) => {
    updateProjectData({
      musicVideoData: { ...musicData, [field]: value },
    });
  };

  const updateMusicDataBatch = (updates: Partial<MusicVideoData>) => {
    updateProjectData({
      musicVideoData: { ...musicData, ...updates },
    });
  };

  const handleLyricsFileUpload = async () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = ACCEPTED_DOCUMENT_EXTENSIONS;
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      setIsParsingLyrics(true);
      try {
        const result = await documentService.parseDocument(file);
        updateMusicData('lyrics', result.text);
        toast.success('Lyrics loaded from file');
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Failed to read file';
        toast.error(msg);
      } finally {
        setIsParsingLyrics(false);
      }
    };
    input.click();
  };

  const handleAudioFileUpload = async (file: File) => {
    if (!file.type.startsWith('audio/')) {
      toast.error('Please upload an audio file (MP3, WAV, etc.)');
      return;
    }

    const audioUrl = URL.createObjectURL(file);
    updateMusicDataBatch({
      audioFileUrl: audioUrl,
      audioFileName: file.name,
    });

    // Detect BPM using web-audio-beat-detector
    setIsDetectingBpm(true);
    try {
      const { analyze } = await import('web-audio-beat-detector');
      const audioContext = new AudioContext();
      const arrayBuffer = await file.arrayBuffer();
      const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
      const tempo = await analyze(audioBuffer);
      const detectedBpm = Math.round(tempo);

      // Generate a basic beat timeline (beat timestamps based on BPM)
      const beatInterval = 60 / detectedBpm;
      const duration = audioBuffer.duration;
      const beats: number[] = [];
      for (let t = 0; t < duration; t += beatInterval) {
        beats.push(Math.round(t * 1000) / 1000);
      }

      updateMusicDataBatch({
        audioFileUrl: audioUrl,
        audioFileName: file.name,
        bpm: detectedBpm,
        beatTimeline: beats.slice(0, 200), // Cap at 200 beat markers
      });

      await audioContext.close();
      toast.success(`BPM detected: ${detectedBpm}`);
    } catch (err: unknown) {
      console.error('BPM detection error:', err);
      toast.error('Could not detect BPM. You can enter it manually.');
    } finally {
      setIsDetectingBpm(false);
    }
  };

  const handleRemoveAudio = () => {
    if (musicData.audioFileUrl) {
      URL.revokeObjectURL(musicData.audioFileUrl);
    }
    updateMusicDataBatch({
      audioFileUrl: undefined,
      audioFileName: undefined,
      bpm: undefined,
      beatTimeline: undefined,
    });
  };

  return (
    <div className="space-y-6">
      <div className="overflow-hidden rounded-lg border border-white/10 bg-[#0b0d12]">
        <div className="grid gap-0 md:grid-cols-[1fr_1.1fr]">
          <div className="p-5">
            <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-cyan-200/70">Music Video Brief</p>
            <h3 className="mt-3 text-xl font-semibold text-white">Build the treatment around the track.</h3>
            <p className="mt-2 text-sm leading-relaxed text-zinc-500">
              Upload audio, define the artist world, capture mood references, then balance performance, choreography, lyric plates, and story scenes.
            </p>
            <div className="mt-4 grid grid-cols-2 gap-2 text-[10px] uppercase tracking-[0.16em] text-zinc-400">
              {[
                { label: 'Audio timing', Icon: Activity },
                { label: 'Artist anchor', Icon: Music },
                { label: 'Scene language', Icon: Camera },
                { label: 'Visual palette', Icon: Palette },
              ].map(({ label, Icon }) => (
                <div key={label} className="flex items-center gap-2 rounded-lg border border-white/[0.06] bg-white/[0.03] px-3 py-2">
                  <Icon className="h-3.5 w-3.5 text-[#f97316]" />
                  {label}
                </div>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 p-3">
            {musicStyleRange.map((asset) => (
              <div key={asset.title} className="relative aspect-video overflow-hidden rounded-lg border border-white/[0.06] bg-black">
                <img
                  src={asset.src}
                  alt={asset.alt}
                  className="h-full w-full object-cover opacity-80"
                  loading="lazy"
                  decoding="async"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-transparent to-transparent" />
                <span className="absolute bottom-2 left-2 right-2 truncate text-[10px] font-bold uppercase tracking-[0.14em] text-zinc-200">
                  {asset.style}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label className="text-sm text-zinc-400 uppercase tracking-wide">
            Artist Name <span className="text-red-400">*</span>
          </Label>
          <Input
            value={musicData.artistName}
            onChange={(e) => updateMusicData('artistName', e.target.value)}
            placeholder="e.g., Fictional artist name"
            className="bg-[#111319] border-zinc-700"
          />
        </div>
        <div className="space-y-2">
          <Label className="text-sm text-zinc-400 uppercase tracking-wide">
            Track Title <span className="text-red-400">*</span>
          </Label>
          <Input
            value={musicData.trackTitle}
            onChange={(e) => updateMusicData('trackTitle', e.target.value)}
            placeholder="e.g., Working track title"
            className="bg-[#111319] border-zinc-700"
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label className="text-sm text-zinc-400 uppercase tracking-wide">Genre / Style</Label>
        <Input
          value={musicData.genre}
          onChange={(e) => updateMusicData('genre', e.target.value)}
          placeholder="e.g., Gothic trap, rain-soaked R&B, cyberpop choreography..."
          className="bg-[#111319] border-zinc-700"
        />
      </div>

      <div className="space-y-2">
        <Label className="text-sm text-zinc-400 uppercase tracking-wide flex items-center gap-2">
          <Clapperboard className="w-4 h-4" />
          Treatment Notes / References
        </Label>
        <Textarea
          value={(musicData.moodBoard || []).join('\n')}
          onChange={(e) =>
            updateMusicData(
              'moodBoard',
              e.target.value.split('\n').map((line) => line.trim()).filter(Boolean)
            )
          }
          placeholder="One reference per line: key art mood, choreography direction, lens language, wardrobe palette, lyric typography..."
          className="bg-[#111319] border-zinc-700 min-h-[96px] text-sm"
        />
      </div>

      {/* Audio File Upload with BPM Detection */}
      <div className="space-y-3">
        <Label className="text-sm text-zinc-400 uppercase tracking-wide flex items-center gap-2">
          <Music className="w-4 h-4" />
          Audio Track
          <span className="text-xs text-zinc-500">(tempo + beat map)</span>
        </Label>

        <AnimatePresence mode="wait">
          {musicData.audioFileName ? (
            <motion.div
              key="audio-preview"
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className="rounded-lg border border-[#f97316]/20 bg-[#18191E] p-4 space-y-3"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-[#f97316]/20 flex items-center justify-center">
                    <Music className="w-5 h-5 text-[#f97316]" />
                  </div>
                  <div>
                    <p className="text-sm text-white font-medium truncate max-w-[200px]">
                      {musicData.audioFileName}
                    </p>
                    {isDetectingBpm ? (
                      <p className="text-xs text-zinc-400 flex items-center gap-1">
                        <Loader2 className="w-3 h-3 animate-spin" /> Analyzing BPM...
                      </p>
                    ) : musicData.bpm ? (
                      <p className="text-xs text-[#f97316] font-mono">
                        {musicData.bpm} BPM detected
                      </p>
                    ) : (
                      <p className="text-xs text-zinc-500">BPM not detected</p>
                    )}
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleRemoveAudio}
                  className="text-zinc-400 hover:text-red-400"
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>

              {/* Beat Timeline Visualization */}
              {musicData.bpm && musicData.beatTimeline && musicData.beatTimeline.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs text-zinc-500 uppercase tracking-wide">Beat Timeline</p>
                  <div className="h-8 bg-zinc-900 rounded-md overflow-hidden flex items-end gap-px px-1">
                    {musicData.beatTimeline.slice(0, 60).map((beat, i) => (
                      <div
                        key={i}
                        className="flex-1 bg-[#f97316]/70 rounded-t-sm min-w-[2px]"
                        style={{
                          height: `${i % 4 === 0 ? 100 : 50}%`,
                          opacity: i % 4 === 0 ? 1 : 0.5,
                        }}
                      />
                    ))}
                  </div>
                  <p className="text-xs text-zinc-500 text-center">
                    {musicData.beatTimeline.length} beats detected • Beat interval: {(60 / musicData.bpm).toFixed(2)}s
                  </p>
                </div>
              )}

              {/* Manual BPM override */}
              <div className="flex items-center gap-3">
                <Label className="text-xs text-zinc-500 whitespace-nowrap">Manual BPM:</Label>
                <Input
                  type="number"
                  value={musicData.bpm || ''}
                  onChange={(e) => {
                    const val = parseInt(e.target.value, 10);
                    if (!isNaN(val) && val > 0 && val < 999) {
                      updateMusicData('bpm', val);
                    }
                  }}
                  placeholder="e.g., 120"
                  className="bg-[#111319] border-zinc-700 w-24 h-8 text-sm"
                />
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="audio-upload"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => audioInputRef.current?.click()}
              className="border-2 border-dashed border-zinc-700 hover:border-[#f97316]/40 rounded-lg p-6 flex flex-col items-center justify-center gap-2 cursor-pointer transition-all bg-[#18191E]"
            >
              <input
                ref={audioInputRef}
                type="file"
                accept="audio/*"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleAudioFileUpload(file);
                }}
                className="hidden"
              />
              <div className="w-10 h-10 rounded-full bg-zinc-800 flex items-center justify-center">
                <Upload className="w-5 h-5 text-zinc-400" />
              </div>
              <p className="text-sm text-zinc-400">Upload the song or edit section</p>
              <p className="text-xs text-zinc-500">MP3, WAV, or other audio formats for BPM detection</p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Demucs stem split + GMI Gemini annotated lyrics */}
      <MusicProductionPanel
        projectId={musicProjectId}
        musicData={musicData}
        onUpdate={(patch) => updateMusicDataBatch(patch)}
      />

      <div className="space-y-2">
        <Label className="text-sm text-zinc-400 uppercase tracking-wide flex items-center gap-2">
          Lyrics
          <Button
            variant="outline"
            size="sm"
            className="h-6 px-2 text-xs"
            onClick={handleLyricsFileUpload}
            disabled={isParsingLyrics}
          >
            {isParsingLyrics ? (
              <><Loader2 className="w-3 h-3 mr-1 animate-spin" /> Parsing...</>
            ) : (
              <><FileText className="w-3 h-3 mr-1" /> Upload</>
            )}
          </Button>
        </Label>
        <Textarea
          value={musicData.lyrics || ''}
          onChange={(e) => updateMusicData('lyrics', e.target.value)}
          placeholder="Paste lyrics for visual scene matching, hooks, typography moments, and beat-aware cuts..."
          className="bg-[#111319] border-zinc-700 min-h-[120px] font-mono text-sm"
        />
      </div>

      <div className="space-y-4">
        <Label className="text-sm text-zinc-400 uppercase tracking-wide">Visual Balance</Label>
        <div className="flex items-center gap-4">
          <span className="text-sm text-zinc-500 w-24">Performance</span>
          <Slider
            value={[musicData.performanceRatio]}
            onValueChange={(val) => updateMusicData('performanceRatio', val[0])}
            max={100}
            step={10}
            className="flex-1"
          />
          <span className="text-sm text-zinc-500 w-24 text-right">Narrative</span>
        </div>
        <p className="text-xs text-zinc-500 text-center">
          {musicData.performanceRatio}% Performance / {100 - musicData.performanceRatio}% Narrative
        </p>
      </div>
    </div>
  );
};

const InfotainmentForm: React.FC<{
  projectData: ProjectData;
  updateProjectData: (data: Partial<ProjectData>) => void;
}> = ({ projectData, updateProjectData }) => {
  const infoData = projectData.infotainmentData || {
    topic: '',
    educationalGoals: [],
    targetDemographic: '',
    hostStyle: 'casual',
    segments: [],
    keyFacts: '',
    visualStyle: '',
  };

  const updateInfoData = (field: string, value: string | string[]) => {
    updateProjectData({
      infotainmentData: { ...infoData, [field]: value },
    });
  };

  return (
    <div className="space-y-6">
      <div className="p-4 rounded-lg bg-gradient-to-r from-amber-500/10 to-orange-500/10 border border-amber-500/20">
        <h3 className="text-lg font-semibold text-amber-400 mb-1">Infotainment Brief</h3>
        <p className="text-sm text-zinc-400">
          Educational content that entertains — learn while you watch
        </p>
      </div>

      <div className="space-y-2">
        <Label className="text-sm text-zinc-400 uppercase tracking-wide">
          Topic <span className="text-red-400">*</span>
        </Label>
        <Input
          value={infoData.topic}
          onChange={(e) => updateInfoData('topic', e.target.value)}
          placeholder="e.g., The Science of Sleep"
          className="bg-[#111319] border-zinc-700"
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label className="text-sm text-zinc-400 uppercase tracking-wide">
            Target Audience <span className="text-red-400">*</span>
          </Label>
          <Input
            value={infoData.targetDemographic}
            onChange={(e) => updateInfoData('targetDemographic', e.target.value)}
            placeholder="e.g., Curious adults 25-45"
            className="bg-[#111319] border-zinc-700"
          />
        </div>
        <div className="space-y-2">
          <Label className="text-sm text-zinc-400 uppercase tracking-wide">Presentation Style</Label>
          <Select
            value={infoData.hostStyle}
            onValueChange={(value) => updateInfoData('hostStyle', value)}
          >
            <SelectTrigger className="bg-[#111319] border-zinc-700">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="casual">Casual / Conversational</SelectItem>
              <SelectItem value="professional">Professional / Expert</SelectItem>
              <SelectItem value="documentary">Documentary Style</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-2">
        <Label className="text-sm text-zinc-400 uppercase tracking-wide">
          Key Facts <span className="text-red-400">*</span>
        </Label>
        <Textarea
          value={infoData.keyFacts || ''}
          onChange={(e) => updateInfoData('keyFacts', e.target.value)}
          placeholder="Essential facts, statistics, or data points to include in the content..."
          className="bg-[#111319] border-zinc-700 min-h-[80px]"
        />
      </div>

      <div className="space-y-2">
        <Label className="text-sm text-zinc-400 uppercase tracking-wide">Educational Goals</Label>
        <Textarea
          value={(infoData.educationalGoals || []).join('\n')}
          onChange={(e) =>
            updateInfoData(
              'educationalGoals',
              e.target.value.split('\n').filter(Boolean)
            )
          }
          placeholder="What should viewers learn? (one per line)"
          className="bg-[#111319] border-zinc-700 min-h-[80px]"
        />
      </div>

      <div className="space-y-2">
        <Label className="text-sm text-zinc-400 uppercase tracking-wide">
          Visual Style
        </Label>
        <Select
          value={infoData.visualStyle || ''}
          onValueChange={(value) => updateInfoData('visualStyle', value)}
        >
          <SelectTrigger className="bg-[#111319] border-zinc-700">
            <SelectValue placeholder="Choose a visual style" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="animated_explainer">Animated Explainer</SelectItem>
            <SelectItem value="documentary_footage">Documentary Footage</SelectItem>
            <SelectItem value="whiteboard">Whiteboard Animation</SelectItem>
            <SelectItem value="mixed_media">Mixed Media</SelectItem>
            <SelectItem value="infographic">Infographic Style</SelectItem>
            <SelectItem value="cinematic">Cinematic</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  );
};

const ShortFilmForm: React.FC<{
  projectData: ProjectData;
  updateProjectData: (data: Partial<ProjectData>) => void;
}> = ({ projectData, updateProjectData }) => {
  const filmData = projectData.shortFilmData || {
    genre: '',
    tone: '',
    duration: '',
    visualStyle: '',
  };

  const updateFilmData = (field: keyof ShortFilmData, value: string) => {
    updateProjectData({
      shortFilmData: { ...filmData, [field]: value },
      // Also sync genre/tone to top-level projectData for backward compat
      ...(field === 'genre' ? { genre: value } : {}),
      ...(field === 'tone' ? { tone: value } : {}),
    });
  };

  return (
    <div className="space-y-6">
      <div className="p-4 rounded-lg bg-gradient-to-r from-blue-500/10 to-cyan-500/10 border border-blue-500/20">
        <h3 className="text-lg font-semibold text-blue-400 mb-1">Short Film Brief</h3>
        <p className="text-sm text-zinc-400">
          Narrative-driven cinematic storytelling with structured creative direction
        </p>
      </div>

      <div className="space-y-2">
        <Label className="text-lg font-medium text-white">Story Concept</Label>
        <p className="text-sm text-zinc-400">
          Describe your short film idea, scenes, or paste a full script
        </p>
        <motion.div
          className="border border-border/40 rounded-xl bg-card/40 backdrop-blur-sm mt-2 overflow-hidden focus-within:border-primary/40 focus-within:shadow-lg focus-within:shadow-primary/5 transition-all duration-300"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.3, delay: 0.1 }}
        >
          <Textarea
            value={projectData.concept}
            onChange={(e) => updateProjectData({ concept: e.target.value })}
            placeholder="Describe your short film concept, characters, and story arc..."
            className="min-h-[160px] bg-transparent border-none focus-visible:ring-0 resize-none text-foreground placeholder:text-muted-foreground/60"
          />
        </motion.div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label className="text-sm text-zinc-400 uppercase tracking-wide">
            Genre <span className="text-red-400">*</span>
          </Label>
          <Select
            value={filmData.genre}
            onValueChange={(value) => updateFilmData('genre', value)}
          >
            <SelectTrigger className="bg-[#111319] border-zinc-700">
              <SelectValue placeholder="Select genre" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="drama">Drama</SelectItem>
              <SelectItem value="thriller">Thriller</SelectItem>
              <SelectItem value="comedy">Comedy</SelectItem>
              <SelectItem value="horror">Horror</SelectItem>
              <SelectItem value="sci-fi">Sci-Fi</SelectItem>
              <SelectItem value="romance">Romance</SelectItem>
              <SelectItem value="documentary">Documentary</SelectItem>
              <SelectItem value="experimental">Experimental</SelectItem>
              <SelectItem value="noir">Film Noir</SelectItem>
              <SelectItem value="fantasy">Fantasy</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label className="text-sm text-zinc-400 uppercase tracking-wide">
            Tone <span className="text-red-400">*</span>
          </Label>
          <Select
            value={filmData.tone}
            onValueChange={(value) => updateFilmData('tone', value)}
          >
            <SelectTrigger className="bg-[#111319] border-zinc-700">
              <SelectValue placeholder="Select tone" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="dark">Dark</SelectItem>
              <SelectItem value="light">Light-hearted</SelectItem>
              <SelectItem value="suspenseful">Suspenseful</SelectItem>
              <SelectItem value="melancholic">Melancholic</SelectItem>
              <SelectItem value="uplifting">Uplifting</SelectItem>
              <SelectItem value="gritty">Gritty</SelectItem>
              <SelectItem value="whimsical">Whimsical</SelectItem>
              <SelectItem value="intense">Intense</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label className="text-sm text-zinc-400 uppercase tracking-wide">
            Duration
          </Label>
          <Select
            value={filmData.duration}
            onValueChange={(value) => updateFilmData('duration', value)}
          >
            <SelectTrigger className="bg-[#111319] border-zinc-700">
              <SelectValue placeholder="Select duration" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="1-3min">1–3 minutes</SelectItem>
              <SelectItem value="3-5min">3–5 minutes</SelectItem>
              <SelectItem value="5-10min">5–10 minutes</SelectItem>
              <SelectItem value="10-15min">10–15 minutes</SelectItem>
              <SelectItem value="15-30min">15–30 minutes</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label className="text-sm text-zinc-400 uppercase tracking-wide">
            Visual Style
          </Label>
          <Select
            value={filmData.visualStyle}
            onValueChange={(value) => updateFilmData('visualStyle', value)}
          >
            <SelectTrigger className="bg-[#111319] border-zinc-700">
              <SelectValue placeholder="Select visual style" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="cinematic">Cinematic / Film</SelectItem>
              <SelectItem value="handheld">Handheld / Docu-style</SelectItem>
              <SelectItem value="stylized">Stylized / Aesthetic</SelectItem>
              <SelectItem value="noir">Noir / High Contrast</SelectItem>
              <SelectItem value="dreamy">Dreamy / Soft Focus</SelectItem>
              <SelectItem value="minimalist">Minimalist</SelectItem>
              <SelectItem value="retro">Retro / Vintage</SelectItem>
              <SelectItem value="anime">Anime / Animation</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
    </div>
  );
};

const DefaultConceptForm: React.FC<{
  projectData: ProjectData;
  updateProjectData: (data: Partial<ProjectData>) => void;
}> = ({ projectData, updateProjectData }) => {
  const [conceptCharCount, setConceptCharCount] = useState(0);
  const [isGeneratingExamples, setIsGeneratingExamples] = useState(false);
  const [isParsingDocument, setIsParsingDocument] = useState(false);
  const [exampleConcepts, setExampleConcepts] = useState<ExampleConcept[]>([
    {
      title: 'Forgotten Melody',
      description:
        "A musician's rediscovered composition sparks a journey through love, betrayal, and the hidden glamour of the music industry.",
      type: 'logline',
    },
    {
      title: 'Virtual Nightmare',
      description:
        'A virtual reality platform turns dreams into nightmares as users are trapped within it, forcing a group of tech-savvy strangers to unite and escape before their minds are lost forever.',
      type: 'logline',
    },
    {
      title: 'Holiday Hearts',
      description:
        'At a cozy ski resort, a group of strangers arrives for the holidays, each carrying their own hopes and worries. As their paths cross, unexpected connections form, transforming the season.',
      type: 'storyline',
    },
  ]);

  useEffect(() => {
    setConceptCharCount(projectData.concept ? projectData.concept.length : 0);
  }, [projectData.concept]);

  const handleRegenerateExamples = async () => {
    setIsGeneratingExamples(true);
    try {
      const { data, error } = await supabase.functions.invoke('generate-concept-examples');

      if (error) throw error;

      if (data?.concepts && Array.isArray(data.concepts)) {
        setExampleConcepts(data.concepts);
        toast.success('New examples generated!');
      } else {
        throw new Error('Invalid response format');
      }
    } catch (error: unknown) {
      console.error('Error generating examples:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to generate new examples');
    } finally {
      setIsGeneratingExamples(false);
    }
  };

  const handleUseExampleConcept = (concept: ExampleConcept) => {
    updateProjectData({
      title: concept.title,
      concept: concept.description,
    });
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-col lg:flex-row">
        <div className="flex-1">
          <div className="space-y-2">
            <Label className="text-lg font-medium text-white">Input your Concept</Label>
            <p className="text-sm text-zinc-400">
              Describe your story idea, scenes, or paste a full script
            </p>
          </div>

          <motion.div
            className="border border-border/40 rounded-xl bg-card/40 backdrop-blur-sm mt-4 overflow-hidden focus-within:border-primary/40 focus-within:shadow-lg focus-within:shadow-primary/5 transition-all duration-300"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.3, delay: 0.1 }}
          >
            <Textarea
              value={projectData.concept}
              onChange={(e) => updateProjectData({ concept: e.target.value })}
              placeholder="Input anything from a full script, a few scenes, or a story..."
              className="min-h-[200px] bg-transparent border-none focus-visible:ring-0 resize-none text-foreground placeholder:text-muted-foreground/60"
            />
            <div className="flex justify-between items-center px-4 py-3 text-sm text-muted-foreground border-t border-border/30 bg-card/30">
              <Button
                variant="outline"
                size="sm"
                className="h-8 px-3 bg-card/60 border-border/40 text-muted-foreground hover:bg-primary/10 hover:text-primary hover:border-primary/30 transition-all duration-200"
                disabled={isParsingDocument}
                onClick={() => {
                  const input = document.createElement('input');
                  input.type = 'file';
                  input.accept = ACCEPTED_DOCUMENT_EXTENSIONS;
                  input.onchange = async (e) => {
                    const file = (e.target as HTMLInputElement).files?.[0];
                    if (!file) return;
                    setIsParsingDocument(true);
                    try {
                      const result = await documentService.parseDocument(file);
                      updateProjectData({ concept: result.text });
                      const suffix = result.pageCount ? ` (${result.pageCount} pages)` : '';
                      toast.success(`Document loaded${suffix}`);
                    } catch (err: unknown) {
                      const msg = err instanceof Error ? err.message : 'Failed to read file';
                      toast.error(msg);
                    } finally {
                      setIsParsingDocument(false);
                    }
                  };
                  input.click();
                }}
              >
                {isParsingDocument ? (
                  <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Parsing...</>
                ) : (
                  <><FileText className="h-4 w-4 mr-2" /> Upload Document</>
                )}
              </Button>
              <div className="text-xs">{conceptCharCount} / 12000</div>
            </div>
          </motion.div>
        </div>

        <div className="hidden lg:block lg:w-[350px] ml-6">
          <div className="mb-4 flex justify-between items-center">
            <h2 className="font-semibold text-muted-foreground uppercase text-xs tracking-wider">
              Examples
            </h2>
            <Button
              variant="ghost"
              size="icon"
              className="text-muted-foreground hover:text-foreground hover:bg-primary/10"
              onClick={handleRegenerateExamples}
              disabled={isGeneratingExamples}
            >
              <RefreshCw className={`h-4 w-4 ${isGeneratingExamples ? 'animate-spin' : ''}`} />
            </Button>
          </div>

          <div className="space-y-3">
            {exampleConcepts.map((concept, index) => (
              <motion.div
                key={index}
                className="bg-card/60 backdrop-blur-sm rounded-xl p-4 cursor-pointer border border-border/40 hover:border-amber/40 hover:shadow-lg hover:shadow-amber/5 transition-all duration-300"
                onClick={() => handleUseExampleConcept(concept)}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                transition={{ duration: 0.2 }}
              >
                <div className="flex justify-between items-start">
                  <h3 className="font-medium text-foreground">{concept.title}</h3>
                  <span className="text-[10px] text-amber uppercase px-2 py-0.5 rounded-full bg-amber/10 border border-amber/20 font-medium">
                    {concept.type}
                  </span>
                </div>
                <p className="text-sm text-muted-foreground mt-2 line-clamp-3">
                  {concept.description}
                </p>
              </motion.div>
            ))}
          </div>
        </div>
      </div>

      {projectData.conceptOption === 'ai' && (
        <motion.div
          className="space-y-6"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 10 }}
          transition={{ duration: 0.4 }}
        >
          <h2 className="text-xl font-medium mb-4 text-white">Optional settings</h2>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label className="text-sm text-zinc-400">Special Requests</Label>
              <Input
                value={projectData.specialRequests || ''}
                onChange={(e) => updateProjectData({ specialRequests: e.target.value })}
                placeholder="Anything from '80s atmosphere' to 'plot twists' or 'a car chase'"
                className="bg-[#111319] border-zinc-700"
              />
            </div>

            {projectData.format === 'custom' && (
              <>
                <div className="space-y-2">
                  <Label className="text-sm text-zinc-400">Custom Format</Label>
                  <Input
                    value={projectData.customFormat || ''}
                    onChange={(e) => updateProjectData({ customFormat: e.target.value })}
                    placeholder="Describe the structure or format you want"
                    className="bg-[#111319] border-zinc-700"
                  />
                </div>
                <MetaPromptEditor
                  value={projectData.customMetaPrompts}
                  onChange={(next) => updateProjectData({ customMetaPrompts: next })}
                />
              </>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-sm text-zinc-400">Genre</Label>
                <Input
                  value={projectData.genre || ''}
                  onChange={(e) => updateProjectData({ genre: e.target.value })}
                  placeholder="e.g., Thriller, Comedy..."
                  className="bg-[#111319] border-zinc-700"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-sm text-zinc-400">Tone</Label>
                <Input
                  value={projectData.tone || ''}
                  onChange={(e) => updateProjectData({ tone: e.target.value })}
                  placeholder="e.g., Dark, Upbeat..."
                  className="bg-[#111319] border-zinc-700"
                />
              </div>
            </div>
          </div>
        </motion.div>
      )}
    </div>
  );
};
