import { useRef, useState } from "react";
import {
  ArrowRight,
  Check,
  ChevronDown,
  Download,
  FileText,
  HelpCircle,
  Archive,
  Loader2,
  Mic2,
  Play,
  Smile,
  Sparkles,
  Upload,
  Wand2,
  Zap,
  Eye,
  Music,
  User,
  Globe,
  Film,
} from "lucide-react";
import type { KanvasAsset, KanvasAssetType, KanvasJob, KanvasModel } from "@/features/kanvas/types";
import { getJobPrimaryUrl, isJobActive } from "@/features/kanvas/helpers";
import { cn } from "@/lib/utils";
import { useUserTier, sortModelsForTier } from "@/hooks/useUserTier";
import { musicPolishAssets } from "@/lib/musicPolishAssets";
import type { MusicPolishAsset } from "@/lib/musicPolishAssets";

/* ─── Types ──────────────────────────────────────────── */

type WizardStep = "script" | "voice" | "avatar" | "environment" | "render";
type ActiveView = "dashboard" | "templates" | "audio" | "environment" | "render";

interface LipsyncStudioProps {
  prompt: string;
  onPromptChange: (v: string) => void;
  lipsyncMode: "talking-head" | "lip-sync";
  onLipsyncModeChange: (mode: "talking-head" | "lip-sync") => void;
  imageId: string | null;
  videoId: string | null;
  audioId: string | null;
  onImageChange: (id: string | null) => void;
  onVideoChange: (id: string | null) => void;
  onAudioChange: (id: string | null) => void;
  currentModel: KanvasModel | null;
  models: KanvasModel[];
  onModelChange: (id: string) => void;
  settings: Record<string, unknown>;
  onSettingsChange: (key: string, value: string | number | boolean) => void;
  submitting: boolean;
  onGenerate: () => void;
  jobs: KanvasJob[];
  selectedJob: KanvasJob | null;
  assets: KanvasAsset[];
  uploadingImage: boolean;
  uploadingVideo: boolean;
  uploadingAudio: boolean;
  onUpload: (file: File, type: KanvasAssetType) => Promise<void>;
}

/* ─── Film Grain SVG ─────────────────────────────────── */

const NOISE_SVG = `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.5'/%3E%3C/svg%3E")`;

/* ─── Wizard Steps ───────────────────────────────────── */

const WIZARD_STEPS: { key: WizardStep; label: string; icon: typeof FileText }[] = [
  { key: "script", label: "Script", icon: FileText },
  { key: "voice", label: "Voice", icon: Mic2 },
  { key: "avatar", label: "Avatar", icon: User },
  { key: "environment", label: "Environment", icon: Globe },
  { key: "render", label: "Render", icon: Film },
];

/* ─── Templates Data ─────────────────────────────────── */

const TEMPLATES = [
  {
    id: "general",
    label: "PRODUCTION TYPE",
    title: "General",
    asset: musicPolishAssets.talent.voiceBooth,
  },
  {
    id: "selfie",
    label: "CAMERA STYLE",
    title: "Selfie",
    asset: musicPolishAssets.talent.leadVocalist,
  },
  {
    id: "selling",
    label: "CONTENT TYPE",
    title: "Selling",
    asset: musicPolishAssets.toolSurfaces.lipsyncProductRead,
  },
] satisfies Array<{ id: string; label: string; title: string; asset: MusicPolishAsset }>;

/* ─── Voice Types ────────────────────────────────────── */

const VOICE_TYPES = ["Whispers", "Rough", "Deep", "Youthful"];

/* ─── Emotions ───────────────────────────────────────── */

const EMOTIONS = [
  { id: "happy", label: "Happy", icon: Smile },
  { id: "serious", label: "Serious", icon: User },
  { id: "excited", label: "Excited", icon: Zap },
  { id: "calm", label: "Calm", icon: Music },
  { id: "sad", label: "Sad", icon: Globe },
  { id: "angry", label: "Angry", icon: Film },
];

/* ─── Wizard Sidebar ─────────────────────────────────── */

function WizardSidebar({
  activeStep,
  onStepChange,
}: {
  activeStep: WizardStep;
  onStepChange: (step: WizardStep) => void;
}) {
  return (
    <div className="hidden md:fixed md:left-0 md:top-[68px] md:bottom-0 md:w-[260px] md:bg-[#090909] md:z-40 md:flex md:flex-col md:overflow-hidden">
      {/* Header */}
      <div className="px-6 pt-8 pb-6">
        <p className="text-xs font-bold uppercase tracking-[0.3em] text-[#f97316] font-['Space_Grotesk']">
          UGC FACTORY
        </p>
        <p className="mt-1 text-[10px] uppercase tracking-[0.2em] text-zinc-600">
          Production Wizard
        </p>
      </div>

      {/* Steps */}
      <nav className="flex-1 px-4 space-y-2">
        {WIZARD_STEPS.map((step, i) => {
          const active = activeStep === step.key;
          const StepIcon = step.icon;
          return (
            <button
              key={step.key}
              type="button"
              onClick={() => onStepChange(step.key)}
              className={cn(
                "w-full flex items-center gap-4 rounded-full px-4 py-3 text-xs uppercase tracking-[0.15em] font-['Space_Grotesk'] font-bold transition-all",
                active
                  ? "bg-[#f97316] text-black"
                  : "text-zinc-500 hover:text-white hover:bg-white/5"
              )}
            >
              <span className={cn(
                "flex h-7 w-7 items-center justify-center rounded-full text-[10px] font-black",
                active ? "bg-black/20" : "bg-white/5"
              )}>
                {String(i + 1).padStart(2, "0")}
              </span>
              <StepIcon className="h-4 w-4" />
              <span>{step.label}</span>
            </button>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="px-4 pb-8 space-y-3">
        <button className="flex items-center gap-3 px-4 py-2 text-[10px] uppercase tracking-[0.2em] text-zinc-600 hover:text-white transition-colors w-full">
          <HelpCircle className="h-3.5 w-3.5" />
          Support
        </button>
        <button className="flex items-center gap-3 px-4 py-2 text-[10px] uppercase tracking-[0.2em] text-zinc-600 hover:text-white transition-colors w-full">
          <Archive className="h-3.5 w-3.5" />
          Archive
        </button>
        <button className="w-full flex items-center justify-center gap-2 rounded-full border border-white/10 bg-transparent px-4 py-3 text-[10px] uppercase tracking-[0.2em] text-zinc-400 hover:bg-white/5 hover:text-white transition-all font-['Space_Grotesk'] font-bold">
          <Download className="h-3.5 w-3.5" />
          Export Project
        </button>
      </div>
    </div>
  );
}

/* ─── Lipsync Dashboard ──────────────────────────────── */

function LipsyncDashboard({
  prompt,
  onPromptChange,
  lipsyncMode,
  onLipsyncModeChange,
  currentModel,
  models,
  onModelChange,
  imageId,
  videoId,
  audioId,
  submitting,
  onGenerate,
  onUpload,
  uploadingImage,
  uploadingAudio,
  jobs,
  selectedJob,
  tier,
}: {
  prompt: string;
  onPromptChange: (v: string) => void;
  lipsyncMode: "talking-head" | "lip-sync";
  onLipsyncModeChange: (mode: "talking-head" | "lip-sync") => void;
  currentModel: KanvasModel | null;
  models: KanvasModel[];
  onModelChange: (id: string) => void;
  imageId: string | null;
  videoId: string | null;
  audioId: string | null;
  submitting: boolean;
  onGenerate: () => void;
  onUpload: (file: File, type: KanvasAssetType) => Promise<void>;
  uploadingImage: boolean;
  uploadingAudio: boolean;
  jobs: KanvasJob[];
  selectedJob: KanvasJob | null;
  tier: "free" | "pro" | "enterprise";
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [audioMode, setAudioMode] = useState<"text" | "generate">("text");
  const latestCompleted = jobs.find((j) => j.status === "completed");
  const latestUrl = latestCompleted ? getJobPrimaryUrl(latestCompleted) : null;

  const workflowSteps = [
    { num: "01", title: "Upload", desc: "Upload your portrait or video asset" },
    { num: "02", title: "Generate", desc: "AI processes your lipsync request" },
    { num: "03", title: "Select", desc: "Choose the best output render" },
  ];
  const sortedModels = sortModelsForTier(models, tier);

  const activeWorkflowStep = !selectedJob ? 0 : selectedJob.status === "completed" ? 2 : 1;

  return (
    <div className="space-y-12 pb-24">
      {/* Hero */}
      <div className="pt-4">
        <h1 className="text-6xl md:text-8xl font-black font-['Space_Grotesk'] tracking-tighter leading-[0.9]">
          <span className="text-white">LIPSYNC MODELS,</span>
          <br />
          <span className="text-[#f97316]">ONE CLICK AWAY</span>
        </h1>
        <p className="mt-6 max-w-lg text-sm text-zinc-500 leading-relaxed">
          Upload a portrait, paste your script, and let AI bring it to life with natural lip movements and expressions.
        </p>
      </div>

      {/* Two-column layout */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Left Column — Input */}
        <div className="space-y-6">
          <div className="rounded-2xl border border-white/5 bg-[#131313] p-5 space-y-4">
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => onLipsyncModeChange("talking-head")}
                className={cn(
                  "rounded-full px-4 py-2 text-[10px] font-bold uppercase tracking-[0.18em] transition-all font-['Space_Grotesk']",
                  lipsyncMode === "talking-head" ? "bg-[#f97316] text-black" : "bg-white/[0.03] text-zinc-500 hover:text-white"
                )}
              >
                Talking Head
              </button>
              <button
                type="button"
                onClick={() => onLipsyncModeChange("lip-sync")}
                className={cn(
                  "rounded-full px-4 py-2 text-[10px] font-bold uppercase tracking-[0.18em] transition-all font-['Space_Grotesk']",
                  lipsyncMode === "lip-sync" ? "bg-[#f97316] text-black" : "bg-white/[0.03] text-zinc-500 hover:text-white"
                )}
              >
                Lip Sync
              </button>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between gap-3">
                <p className="text-[10px] uppercase tracking-[0.2em] text-zinc-500 font-bold">Model</p>
                <p className="text-[10px] text-zinc-600">
                  {`${currentModel?.credits ?? 0} credits`}
                </p>
              </div>
              <select
                value={currentModel?.id ?? ""}
                onChange={(event) => onModelChange(event.target.value)}
                className="w-full appearance-none rounded-2xl border border-white/5 bg-black/20 px-4 py-3 text-sm text-white focus:border-[#f97316]/30 focus:outline-none"
              >
                {sortedModels.map((model) => (
                  <option key={model.id} value={model.id}>
                    {model.name}{model.id.startsWith("gmi/") ? " (GMI)" : ""} — {model.credits}cr
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-3 gap-2 text-[10px] uppercase tracking-[0.15em]">
              <div className="rounded-xl bg-black/20 px-3 py-2 text-zinc-500">
                Portrait
                <div className="mt-2 text-white">{imageId ? "Ready" : "Missing"}</div>
              </div>
              <div className="rounded-xl bg-black/20 px-3 py-2 text-zinc-500">
                Video
                <div className="mt-2 text-white">{videoId ? "Ready" : "Missing"}</div>
              </div>
              <div className="rounded-xl bg-black/20 px-3 py-2 text-zinc-500">
                Audio
                <div className="mt-2 text-white">{audioId ? "Ready" : "Missing"}</div>
              </div>
            </div>
          </div>

          {/* Upload Card */}
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="relative w-full aspect-[16/9] overflow-hidden rounded-2xl border border-white/5 bg-[#131313] flex flex-col items-center justify-center gap-3 hover:border-[#f97316]/20 transition-all group cursor-pointer"
          >
            <img
              src={musicPolishAssets.kanvas.aiVisualWall.src}
              alt=""
              className="absolute inset-0 h-full w-full object-cover opacity-20 transition duration-700 group-hover:scale-105 group-hover:opacity-30"
              loading="lazy"
              decoding="async"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/55 to-black/30" />
            {uploadingImage ? (
              <Loader2 className="relative h-8 w-8 animate-spin text-[#f97316]" />
            ) : (
              <div className="relative flex h-14 w-14 items-center justify-center rounded-2xl bg-[#f97316]/10 group-hover:bg-[#f97316]/20 transition-colors">
                <Upload className="h-6 w-6 text-[#f97316]" />
              </div>
            )}
            <p className="relative text-xs uppercase tracking-[0.2em] text-zinc-300 font-bold">
              Upload Asset
            </p>
            <p className="relative text-[10px] text-zinc-500">PNG, JPG, MP4 — Max 50MB</p>
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/*,video/*"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.currentTarget.value = "";
              if (file) {
                const type: KanvasAssetType = file.type.startsWith("video") ? "video" : "image";
                void onUpload(file, type);
              }
            }}
          />

          {/* Audio Toggle */}
          <div className="flex items-center gap-1 rounded-full bg-[#131313] p-1 w-fit">
            <button
              type="button"
              onClick={() => setAudioMode("text")}
              className={cn(
                "px-5 py-2.5 rounded-full text-xs uppercase tracking-[0.15em] font-bold transition-all font-['Space_Grotesk']",
                audioMode === "text"
                  ? "bg-[#f97316] text-black"
                  : "text-zinc-500 hover:text-white"
              )}
            >
              Audio Text
            </button>
            <button
              type="button"
              onClick={() => setAudioMode("generate")}
              className={cn(
                "px-5 py-2.5 rounded-full text-xs uppercase tracking-[0.15em] font-bold transition-all font-['Space_Grotesk']",
                audioMode === "generate"
                  ? "bg-[#f97316] text-black"
                  : "text-zinc-500 hover:text-white"
              )}
            >
              Generate Audio
            </button>
          </div>

          {/* Script Input */}
          <div className="relative rounded-2xl bg-[#131313] p-6">
            <textarea
              value={prompt}
              onChange={(e) => onPromptChange(e.target.value)}
              placeholder="Write your script here... The AI will generate lip-synced video from this text."
              className="w-full min-h-[150px] bg-transparent text-white text-sm placeholder:text-zinc-600 resize-none focus:outline-none font-['Space_Grotesk']"
              maxLength={2000}
            />
            <div className="absolute bottom-4 right-4 flex items-center gap-3">
              <span className="text-[10px] text-zinc-600 font-mono">
                {prompt.length} / 2000
              </span>
              <Wand2 className="h-4 w-4 text-zinc-600 hover:text-[#f97316] cursor-pointer transition-colors" />
            </div>
          </div>

          {/* Generate Button */}
          <button
            type="button"
            onClick={onGenerate}
            disabled={submitting}
            className="w-full flex items-center justify-center gap-2 bg-[#f97316] text-black font-bold uppercase tracking-[0.15em] py-4 rounded-full hover:shadow-[0_0_30px_rgba(249,115,22,0.3)] transition-all font-['Space_Grotesk'] disabled:opacity-50"
          >
            {submitting ? (
              <>
                <Loader2 className="h-5 w-5 animate-spin" />
                Processing
              </>
            ) : (
              <>
                <Sparkles className="h-5 w-5" />
                Generate ✦ {currentModel?.credits ?? 20}
              </>
            )}
          </button>
        </div>

        {/* Right Column — Workflow & Output */}
        <div className="space-y-6">
          {/* Workflow Steps */}
          {workflowSteps.map((step, i) => (
            <div
              key={step.num}
              className={cn(
                "rounded-2xl bg-[#1a1919]/60 p-6 flex items-center gap-6 transition-all",
                i === activeWorkflowStep && "border-l-4 border-[#f97316]"
              )}
            >
              <span className={cn(
                "text-4xl font-black font-['Space_Grotesk'] tracking-tighter",
                i === activeWorkflowStep ? "text-[#f97316]" : "text-zinc-700"
              )}>
                {step.num}
              </span>
              <div>
                <p className={cn(
                  "text-sm font-bold uppercase tracking-[0.15em] font-['Space_Grotesk']",
                  i === activeWorkflowStep ? "text-white" : "text-zinc-500"
                )}>
                  {step.title}
                </p>
                <p className="text-xs text-zinc-600 mt-1">{step.desc}</p>
              </div>
              {i < activeWorkflowStep && (
                <Check className="ml-auto h-5 w-5 text-[#f97316]" />
              )}
            </div>
          ))}

          {/* Latest Render */}
          {latestCompleted && (
            <div className="rounded-2xl bg-[#131313] p-6 flex gap-6">
              <div className="h-24 w-24 rounded-xl overflow-hidden bg-white/5 shrink-0">
                {latestUrl ? (
                  latestCompleted.resultPayload?.mediaType === "video" ? (
                    <video src={latestUrl} muted playsInline preload="metadata" className="h-full w-full object-cover" />
                  ) : (
                    <img src={latestUrl} alt="Latest render" className="h-full w-full object-cover" loading="lazy" decoding="async" />
                  )
                ) : (
                  <div className="h-full w-full flex items-center justify-center">
                    <Film className="h-6 w-6 text-zinc-600" />
                  </div>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs uppercase tracking-[0.2em] text-zinc-500 font-bold">Latest Render</p>
                <p className="text-sm font-semibold text-white mt-1 truncate">
                  {latestCompleted.modelId ?? "Lipsync Output"}
                </p>
                <div className="flex items-center gap-2 mt-3">
                  <button className="px-4 py-1.5 rounded-full bg-white/10 text-white text-[10px] uppercase tracking-[0.15em] font-bold hover:bg-white/15 transition-colors flex items-center gap-1.5">
                    <Eye className="h-3 w-3" />
                    Preview
                  </button>
                  <button className="px-4 py-1.5 rounded-full bg-[#ff3399]/10 text-[#ff3399] text-[10px] uppercase tracking-[0.15em] font-bold hover:bg-[#ff3399]/20 transition-colors">
                    Upscale
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ─── UGC Templates ──────────────────────────────────── */

function UGCTemplates({
  selectedTemplate,
  onSelect,
  onNext,
}: {
  selectedTemplate: string | null;
  onSelect: (id: string) => void;
  onNext: () => void;
}) {
  return (
    <div className="space-y-10 pb-24 relative">
      {/* Hero */}
      <div className="pt-4">
        <h1 className="text-6xl md:text-8xl font-black font-['Space_Grotesk'] tracking-tighter leading-[0.9]">
          <span className="text-white">Choose your </span>
          <span className="text-[#f97316]">Template</span>
        </h1>
      </div>

      {/* Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {TEMPLATES.map((tpl) => {
          const selected = selectedTemplate === tpl.id;
          return (
            <button
              key={tpl.id}
              type="button"
              onClick={() => onSelect(tpl.id)}
              className={cn(
                "relative rounded-[2rem] h-[400px] overflow-hidden group cursor-pointer transition-all",
                selected
                  ? "border-2 border-[#f97316] shadow-[0_0_30px_rgba(249,115,22,0.15)]"
                  : "border border-white/5 hover:border-white/10"
              )}
            >
              <img
                src={tpl.asset.src}
                alt={tpl.asset.alt}
                className="absolute inset-0 h-full w-full object-cover opacity-75 transition duration-700 group-hover:scale-105 group-hover:opacity-95"
                loading="lazy"
                decoding="async"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent" />

              {/* Selected check */}
              {selected && (
                <div className="absolute top-4 right-4 z-10 h-8 w-8 rounded-full bg-[#f97316] flex items-center justify-center">
                  <Check className="h-4 w-4 text-black" />
                </div>
              )}

              {/* Text */}
              <div className="absolute bottom-6 left-6 z-10">
                <p className={cn(
                  "text-[10px] uppercase tracking-[0.3em] font-bold mb-2",
                  selected ? "text-[#f97316]" : "text-zinc-500"
                )}>
                  {tpl.label}
                </p>
                <p className="text-3xl font-black text-white font-['Space_Grotesk'] tracking-tight">
                  {tpl.title}
                </p>
              </div>
            </button>
          );
        })}
      </div>

      {/* Floating FAB */}
      <button
        type="button"
        onClick={onNext}
        className="fixed bottom-8 right-8 z-50 w-20 h-20 rounded-full bg-[#f97316] text-black flex items-center justify-center shadow-[0_0_40px_rgba(249,115,22,0.3)] hover:shadow-[0_0_60px_rgba(249,115,22,0.5)] transition-all"
      >
        <ArrowRight className="h-8 w-8" />
      </button>
    </div>
  );
}

/* ─── UGC Audio Settings ─────────────────────────────── */

function UGCAudioSettings({
  onNext,
}: {
  onNext: () => void;
}) {
  const [voiceType, setVoiceType] = useState("Whispers");
  const [emotion, setEmotion] = useState("happy");
  const [language, setLanguage] = useState("english");
  const [accent, setAccent] = useState("neutral");

  return (
    <div className="space-y-10 pb-24">
      {/* Hero */}
      <div className="pt-4">
        <h1 className="text-6xl md:text-8xl font-black font-['Space_Grotesk'] tracking-tighter leading-[0.9]">
          <span className="text-white">AUDIO </span>
          <span className="text-[#f97316]">SETTINGS</span>
        </h1>
      </div>

      {/* Dropdowns */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="relative">
          <p className="text-[10px] uppercase tracking-[0.2em] text-zinc-500 font-bold mb-3">Select Language</p>
          <div className="relative">
            <select
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
              className="w-full appearance-none bg-[#131313] border border-white/5 rounded-2xl px-5 py-4 text-white text-sm font-['Space_Grotesk'] focus:outline-none focus:border-[#f97316]/30 transition-colors"
            >
              <option value="english">English</option>
              <option value="spanish">Spanish</option>
              <option value="french">French</option>
              <option value="german">German</option>
              <option value="japanese">Japanese</option>
            </select>
            <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500 pointer-events-none" />
          </div>
        </div>
        <div className="relative">
          <p className="text-[10px] uppercase tracking-[0.2em] text-zinc-500 font-bold mb-3">Select Accent</p>
          <div className="relative">
            <select
              value={accent}
              onChange={(e) => setAccent(e.target.value)}
              className="w-full appearance-none bg-[#131313] border border-white/5 rounded-2xl px-5 py-4 text-white text-sm font-['Space_Grotesk'] focus:outline-none focus:border-[#f97316]/30 transition-colors"
            >
              <option value="neutral">Neutral</option>
              <option value="british">British</option>
              <option value="australian">Australian</option>
              <option value="southern">Southern</option>
            </select>
            <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500 pointer-events-none" />
          </div>
        </div>
      </div>

      {/* Voice Type Row */}
      <div>
        <p className="text-[10px] uppercase tracking-[0.2em] text-zinc-500 font-bold mb-4">Voice Type</p>
        <div className="flex flex-wrap gap-3">
          {VOICE_TYPES.map((vt) => (
            <button
              key={vt}
              type="button"
              onClick={() => setVoiceType(vt)}
              className={cn(
                "px-6 py-3 rounded-full text-xs uppercase tracking-[0.15em] font-bold transition-all font-['Space_Grotesk']",
                voiceType === vt
                  ? "bg-[#f97316] text-black"
                  : "bg-[#131313] text-zinc-500 hover:text-white hover:bg-white/5"
              )}
            >
              {vt}
            </button>
          ))}
        </div>
      </div>

      {/* Emotional Delivery Grid */}
      <div>
        <p className="text-[10px] uppercase tracking-[0.2em] text-zinc-500 font-bold mb-4">Emotional Delivery</p>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          {EMOTIONS.map((em) => {
            const active = emotion === em.id;
            const EmIcon = em.icon;
            return (
              <button
                key={em.id}
                type="button"
                onClick={() => setEmotion(em.id)}
                className={cn(
                  "flex flex-col items-center justify-center gap-3 rounded-2xl p-6 transition-all aspect-square",
                  active
                    ? "border-2 border-[#f97316] bg-[#f97316]/5"
                    : "border border-white/5 bg-[#131313] hover:border-white/10"
                )}
              >
                <EmIcon className={cn(
                  "h-6 w-6",
                  active ? "text-[#f97316]" : "text-zinc-600"
                )} />
                <span className={cn(
                  "text-[10px] uppercase tracking-[0.2em] font-bold",
                  active ? "text-[#f97316]" : "text-zinc-500"
                )}>
                  {em.label}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Voice Preview Player */}
      <div className="rounded-[2rem] bg-[#131313] p-6 flex items-center gap-6">
        <button
          type="button"
          className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-[#f97316] text-black hover:shadow-[0_0_20px_rgba(249,115,22,0.3)] transition-all"
        >
          <Play className="h-6 w-6 ml-1" />
        </button>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-white font-['Space_Grotesk']">
            Voice Preview: Neutral {voiceType}
          </p>
          <p className="text-xs text-zinc-500 italic mt-1 truncate">
            "Hello, this is a sample of the selected voice..."
          </p>
          <div className="mt-3 flex items-center gap-3">
            <div className="flex-1 h-1.5 rounded-full bg-white/10 overflow-hidden">
              <div className="h-full w-1/3 rounded-full bg-[#f97316]" />
            </div>
            <span className="text-[10px] text-zinc-600 font-mono whitespace-nowrap">0:04 / 0:12</span>
          </div>
        </div>
      </div>

      {/* Next Step */}
      <div className="flex justify-end">
        <button
          type="button"
          onClick={onNext}
          className="flex items-center gap-2 bg-[#f97316] text-black font-bold uppercase tracking-[0.15em] px-8 py-3 rounded-full hover:shadow-[0_0_20px_rgba(249,115,22,0.3)] transition-all text-xs font-['Space_Grotesk']"
        >
          Next Step
          <ArrowRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

/* ─── Environment Panel ──────────────────────────────── */

function EnvironmentPanel({
  settings,
  onSettingsChange,
  onNext,
}: {
  settings: Record<string, unknown>;
  onSettingsChange: (key: string, value: string | number | boolean) => void;
  onNext: () => void;
}) {
  return (
    <div className="space-y-10 pb-24">
      <div>
        <h2 className="text-4xl font-black font-['Space_Grotesk'] text-white tracking-tight">Dial In The Render Space</h2>
        <p className="mt-3 max-w-2xl text-sm text-zinc-500">
          These values are persisted into the lip-sync request payload so the render step uses the exact same framing and output settings.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <label className="rounded-3xl border border-white/10 bg-[#121212] p-6">
          <p className="text-[10px] uppercase tracking-[0.2em] text-zinc-500">Aspect Ratio</p>
          <select
            value={String(settings.aspect_ratio ?? "16:9")}
            onChange={(event) => onSettingsChange("aspect_ratio", event.target.value)}
            className="mt-4 w-full bg-transparent text-white outline-none"
          >
            {["16:9", "9:16", "1:1"].map((value) => (
              <option key={value} value={value} className="bg-black">
                {value}
              </option>
            ))}
          </select>
        </label>

        <label className="rounded-3xl border border-white/10 bg-[#121212] p-6">
          <p className="text-[10px] uppercase tracking-[0.2em] text-zinc-500">Resolution</p>
          <select
            value={String(settings.resolution ?? "1080p")}
            onChange={(event) => onSettingsChange("resolution", event.target.value)}
            className="mt-4 w-full bg-transparent text-white outline-none"
          >
            {["720p", "1080p", "1440p"].map((value) => (
              <option key={value} value={value} className="bg-black">
                {value}
              </option>
            ))}
          </select>
        </label>

        <label className="rounded-3xl border border-white/10 bg-[#121212] p-6">
          <p className="text-[10px] uppercase tracking-[0.2em] text-zinc-500">Generate Audio</p>
          <button
            type="button"
            onClick={() => onSettingsChange("generate_audio", !(settings.generate_audio ?? true))}
            className={cn(
              "mt-4 inline-flex rounded-full px-4 py-2 text-xs font-bold uppercase tracking-[0.15em]",
              settings.generate_audio ?? true ? "bg-[#f97316] text-black" : "bg-white/5 text-zinc-400"
            )}
          >
            {(settings.generate_audio ?? true) ? "Enabled" : "Disabled"}
          </button>
        </label>
      </div>

      <div className="flex justify-end">
        <button
          type="button"
          onClick={onNext}
          className="flex items-center gap-2 bg-[#f97316] text-black font-bold uppercase tracking-[0.15em] px-8 py-3 rounded-full hover:shadow-[0_0_20px_rgba(249,115,22,0.3)] transition-all text-xs font-['Space_Grotesk']"
        >
          Continue To Render
          <ArrowRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

/* ─── Render Panel ───────────────────────────────────── */

function RenderPanel({
  currentModel,
  prompt,
  imageId,
  videoId,
  audioId,
  settings,
  submitting,
  onGenerate,
  selectedJob,
}: {
  currentModel: KanvasModel | null;
  prompt: string;
  imageId: string | null;
  videoId: string | null;
  audioId: string | null;
  settings: Record<string, unknown>;
  submitting: boolean;
  onGenerate: () => void;
  selectedJob: KanvasJob | null;
}) {
  const summary = [
    { label: "Model", value: currentModel?.name ?? "Not selected" },
    { label: "Portrait", value: imageId ?? "Optional" },
    { label: "Video", value: videoId ?? "Optional" },
    { label: "Audio", value: audioId ?? "Required" },
    { label: "Prompt", value: prompt.trim() || "No extra direction" },
    { label: "Aspect", value: String(settings.aspect_ratio ?? "16:9") },
    { label: "Resolution", value: String(settings.resolution ?? "1080p") },
  ];

  return (
    <div className="space-y-8 pb-24">
      <div>
        <h2 className="text-4xl font-black font-['Space_Grotesk'] text-white tracking-tight">Render Review</h2>
        <p className="mt-3 max-w-2xl text-sm text-zinc-500">
          Review the exact request payload inputs before dispatching the render. The generate button here uses the current model, selected assets, prompt, and environment settings.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {summary.map((item) => (
          <div key={item.label} className="rounded-3xl border border-white/10 bg-[#121212] p-5">
            <p className="text-[10px] uppercase tracking-[0.2em] text-zinc-500">{item.label}</p>
            <p className="mt-3 text-sm text-white break-all">{item.value}</p>
          </div>
        ))}
      </div>

      <div className="rounded-3xl border border-white/10 bg-[#121212] p-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-[10px] uppercase tracking-[0.2em] text-zinc-500">Latest Status</p>
            <p className="mt-2 text-sm text-white">{selectedJob ? selectedJob.status : "Ready to render"}</p>
          </div>
          <button
            type="button"
            onClick={onGenerate}
            disabled={submitting || !audioId}
            className="inline-flex items-center gap-2 rounded-full bg-[#f97316] px-6 py-3 text-xs font-bold uppercase tracking-[0.18em] text-black disabled:opacity-50"
          >
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            Generate Render
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── Main Component ─────────────────────────────────── */

export default function LipsyncStudioSection(props: LipsyncStudioProps) {
  const { tier } = useUserTier();
  const [activeStep, setActiveStep] = useState<WizardStep>("script");
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);

  const viewForStep: Record<WizardStep, ActiveView> = {
    script: "dashboard",
    voice: "audio",
    avatar: "templates",
    environment: "environment",
    render: "render",
  };

  const activeView = viewForStep[activeStep];

  function handleNextStep() {
    const currentIdx = WIZARD_STEPS.findIndex((s) => s.key === activeStep);
    if (currentIdx < WIZARD_STEPS.length - 1) {
      setActiveStep(WIZARD_STEPS[currentIdx + 1].key);
    }
  }

  return (
    <div className="fixed inset-0 top-[68px] z-30 bg-[#000000] overflow-hidden">
      {/* Film Grain */}
      <div
        className="pointer-events-none fixed inset-0 z-[1] mix-blend-overlay opacity-[0.15]"
        style={{ backgroundImage: NOISE_SVG, backgroundRepeat: "repeat", backgroundSize: "128px 128px" }}
      />

      {/* Mobile: horizontal step indicator */}
      <div className="md:hidden flex items-center gap-1 px-4 py-3 overflow-x-auto scrollbar-hide border-b border-white/[0.06] bg-[#090909] z-40 relative">
        {WIZARD_STEPS.map((step, i) => {
          const active = activeStep === step.key;
          const StepIcon = step.icon;
          return (
            <button
              key={step.key}
              onClick={() => setActiveStep(step.key)}
              className={cn(
                "shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-full text-[10px] font-bold uppercase tracking-wider transition-all",
                active
                  ? "bg-[#f97316] text-black"
                  : "text-zinc-500 bg-white/[0.03]"
              )}
            >
              <StepIcon className="h-3 w-3" />
              {step.label}
            </button>
          );
        })}
      </div>

      {/* Desktop Sidebar */}
      <WizardSidebar activeStep={activeStep} onStepChange={setActiveStep} />

      {/* Main Content */}
      <div className="absolute inset-0 left-0 md:left-[260px] top-[52px] md:top-0 overflow-y-auto z-[2] pb-16 md:pb-0" style={{ scrollbarWidth: "none" }}>
        <div className="px-4 md:px-10 py-6 md:py-8 max-w-[1200px]">
          {activeView === "dashboard" && (
            <LipsyncDashboard
              prompt={props.prompt}
              onPromptChange={props.onPromptChange}
              lipsyncMode={props.lipsyncMode}
              onLipsyncModeChange={props.onLipsyncModeChange}
                currentModel={props.currentModel}
                models={props.models}
                onModelChange={props.onModelChange}
                imageId={props.imageId}
                videoId={props.videoId}
                audioId={props.audioId}
              submitting={props.submitting}
              onGenerate={props.onGenerate}
              onUpload={props.onUpload}
              uploadingImage={props.uploadingImage}
              uploadingAudio={props.uploadingAudio}
              jobs={props.jobs}
              selectedJob={props.selectedJob}
              tier={tier}
            />
          )}
          {activeView === "templates" && (
            <UGCTemplates
              selectedTemplate={selectedTemplate}
              onSelect={setSelectedTemplate}
              onNext={handleNextStep}
            />
          )}
          {activeView === "audio" && (
            <UGCAudioSettings onNext={handleNextStep} />
          )}
          {activeView === "environment" && (
            <EnvironmentPanel
              settings={props.settings}
              onSettingsChange={props.onSettingsChange}
              onNext={handleNextStep}
            />
          )}
          {activeView === "render" && (
            <RenderPanel
              currentModel={props.currentModel}
              prompt={props.prompt}
              imageId={props.imageId}
              videoId={props.videoId}
              audioId={props.audioId}
              settings={props.settings}
              submitting={props.submitting}
              onGenerate={props.onGenerate}
              selectedJob={props.selectedJob}
            />
          )}
        </div>
      </div>
    </div>
  );
}
