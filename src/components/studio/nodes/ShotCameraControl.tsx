import { useCallback, useMemo, useRef, useState, type ReactNode } from 'react';
import { Camera, ChevronDown, ChevronUp, RotateCcw } from 'lucide-react';

import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import {
  APERTURE_OPTIONS,
  CAMERA_BODY_OPTIONS,
  FOCAL_LENGTH_OPTIONS,
  LENS_FAMILY_OPTIONS,
  MOOD_OPTIONS,
  MOVEMENT_OPTIONS,
  SHOT_SIZE_OPTIONS,
  type ShotControl,
  type ShotSize,
  isShotControlEmpty,
} from '@/lib/studio/shotCamera';
import { LensWheel, type LensWheelHandle } from './lens-combo/LensWheel';
import {
  ApertureGlyph,
  CameraGlyph,
  FocalGlyph,
  LensGlyph,
} from './lens-combo/glyphs';
import { SummaryCell } from './lens-combo/SummaryCell';
import { useIsMobile } from '@/hooks/use-mobile';

interface ShotCameraControlProps {
  mediaType: 'image' | 'video';
  value?: ShotControl;
  onChange: (next: ShotControl) => void;
  popoverContainer?: HTMLElement | null;
}

function chipClasses(active: boolean): string {
  return cn(
    'inline-flex h-7 items-center rounded-full border px-2.5 text-[11px] font-medium transition-colors',
    active
      ? 'border-[#f97316]/40 bg-[#1c1510] text-[#fdba74]'
      : 'border-[rgba(249,115,22,0.10)] bg-[#141414] text-zinc-400 hover:text-white hover:border-[rgba(249,115,22,0.20)]'
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <div className="text-[10px] uppercase tracking-[0.22em] text-zinc-500">{title}</div>
      <div className="flex flex-wrap gap-1.5">{children}</div>
    </div>
  );
}

/** Compact "kit token" rendered inside the trigger button when values are present. */
function KitToken({ glyph, label }: { glyph: ReactNode; label: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-[#241a10] px-1.5 py-0.5 text-[10px] font-medium text-[#fdba74]">
      <span className="h-3 w-3" aria-hidden>
        {glyph}
      </span>
      <span className="max-w-[64px] truncate">{label}</span>
    </span>
  );
}

export function ShotCameraControl({
  mediaType,
  value,
  onChange,
  popoverContainer,
}: ShotCameraControlProps) {
  const shot = value ?? {};
  const [open, setOpen] = useState(false);
  const isMobile = useIsMobile();

  const hasSecondary = Boolean(shot.shotSize || shot.movement || shot.mood);
  const [showMore, setShowMore] = useState(hasSecondary);

  // Refs to focus a specific wheel when the matching summary cell is clicked
  const bodyRef = useRef<LensWheelHandle>(null);
  const lensRef = useRef<LensWheelHandle>(null);
  const focalRef = useRef<LensWheelHandle>(null);
  const apertureRef = useRef<LensWheelHandle>(null);

  const set = useCallback(
    <K extends keyof ShotControl>(key: K, next: ShotControl[K]) => {
      const cur = shot[key];
      onChange({ ...shot, [key]: cur === next ? undefined : next });
    },
    [shot, onChange]
  );

  const reset = useCallback(() => {
    onChange({});
    setShowMore(false);
  }, [onChange]);

  const hasValues = !isShotControlEmpty(shot);

  // Build the inline kit tokens for the trigger button (max 4)
  const triggerTokens = useMemo(() => {
    const tokens: { key: string; label: string; glyph: ReactNode }[] = [];
    if (shot.cameraBody) {
      tokens.push({
        key: 'body',
        label: shot.cameraBody,
        glyph: <CameraGlyph name={shot.cameraBody} className="text-[#fdba74]" />,
      });
    }
    if (shot.lensFamily) {
      tokens.push({
        key: 'lens',
        label: shot.lensFamily,
        glyph: <LensGlyph name={shot.lensFamily} className="text-[#fdba74]" />,
      });
    }
    if (shot.focalLength) {
      tokens.push({
        key: 'focal',
        label: shot.focalLength,
        glyph: <FocalGlyph value={shot.focalLength} className="text-[#fdba74]" />,
      });
    }
    if (shot.aperture) {
      tokens.push({
        key: 'aperture',
        label: shot.aperture,
        glyph: <ApertureGlyph value={shot.aperture} className="text-[#fdba74]" />,
      });
    }
    return tokens;
  }, [shot.cameraBody, shot.lensFamily, shot.focalLength, shot.aperture]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          onClick={(event) => event.stopPropagation()}
          className={cn(
            'inline-flex h-7 max-w-full items-center gap-1.5 rounded-full border px-2 text-[11px] font-medium transition-colors',
            hasValues
              ? 'border-[#f97316]/40 bg-[#1c1510] text-[#fdba74]'
              : 'border-[rgba(249,115,22,0.10)] bg-[#141414] px-2.5 text-zinc-300 hover:text-white'
          )}
          aria-label="Open lens combo"
        >
          <Camera className="h-3 w-3 shrink-0" />
          {hasValues ? (
            <span className="flex min-w-0 items-center gap-1 overflow-hidden">
              {triggerTokens.slice(0, 4).map((token) => (
                <KitToken key={token.key} glyph={token.glyph} label={token.label} />
              ))}
            </span>
          ) : (
            <span>Lens Combo</span>
          )}
          <ChevronDown className="h-3 w-3 shrink-0 opacity-60" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        side="top"
        sideOffset={10}
        container={popoverContainer ?? undefined}
        className={cn(
          'rounded-[24px] border border-[rgba(249,115,22,0.12)] bg-[#0E0E0E]/98 p-0 text-white shadow-[0_24px_64px_rgba(0,0,0,0.55),0_0_0_1px_rgba(255,255,255,0.02),inset_0_1px_0_rgba(255,255,255,0.04)] backdrop-blur-2xl',
          isMobile ? 'w-[calc(100vw-32px)] max-w-[420px]' : 'w-[560px]'
        )}
        onMouseDown={(event) => event.stopPropagation()}
        onClick={(event) => event.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/[0.04] px-5 py-3">
          <div className="flex items-center gap-2">
            <span className="text-[13px] font-medium text-white">Lens Combo</span>
            <span className="hidden text-[11px] text-zinc-500 sm:inline">
              Cinematic shot controls
            </span>
          </div>
          <button
            type="button"
            onClick={reset}
            disabled={!hasValues}
            className={cn(
              'inline-flex h-7 items-center gap-1.5 rounded-full border border-white/[0.06] bg-[#141414] px-2.5 text-[11px] transition-colors',
              hasValues
                ? 'text-zinc-300 hover:text-white hover:border-[rgba(249,115,22,0.20)]'
                : 'cursor-not-allowed text-zinc-600'
            )}
            aria-label="Reset cinematic controls"
          >
            <RotateCcw className="h-3 w-3" /> Reset
          </button>
        </div>

        {/* Lens Kit Summary strip — desktop only */}
        {!isMobile ? (
          <div className="grid grid-cols-4 divide-x divide-white/[0.04] border-b border-white/[0.04] bg-[#0B0B0B]/70">
            <SummaryCell
              label="Body"
              value={shot.cameraBody}
              glyph={
                <CameraGlyph
                  name={shot.cameraBody}
                  className={shot.cameraBody ? 'text-[#fdba74]' : 'text-zinc-700'}
                  active={Boolean(shot.cameraBody)}
                />
              }
              onClick={() => bodyRef.current?.focus()}
            />
            <SummaryCell
              label="Lens"
              value={shot.lensFamily}
              glyph={
                <LensGlyph
                  name={shot.lensFamily}
                  className={shot.lensFamily ? 'text-[#fdba74]' : 'text-zinc-700'}
                  active={Boolean(shot.lensFamily)}
                />
              }
              onClick={() => lensRef.current?.focus()}
            />
            <SummaryCell
              label="Focal"
              value={shot.focalLength}
              glyph={
                <FocalGlyph
                  value={shot.focalLength}
                  className={shot.focalLength ? 'text-[#fdba74]' : 'text-zinc-700'}
                  active={Boolean(shot.focalLength)}
                />
              }
              onClick={() => focalRef.current?.focus()}
            />
            <SummaryCell
              label="Aperture"
              value={shot.aperture}
              glyph={
                <ApertureGlyph
                  value={shot.aperture}
                  className={shot.aperture ? 'text-[#fdba74]' : 'text-zinc-700'}
                  active={Boolean(shot.aperture)}
                />
              }
              onClick={() => apertureRef.current?.focus()}
            />
          </div>
        ) : null}

        {/* On mobile, fall back to chip layout for usability */}
        {isMobile ? (
          <div className="space-y-3 p-4">
            <Section title="Camera body">
              {CAMERA_BODY_OPTIONS.map((b) => (
                <button
                  key={b}
                  type="button"
                  className={chipClasses(shot.cameraBody === b)}
                  onClick={() => set('cameraBody', b)}
                >
                  {b}
                </button>
              ))}
            </Section>
            <Section title="Lens family">
              {LENS_FAMILY_OPTIONS.map((l) => (
                <button
                  key={l}
                  type="button"
                  className={chipClasses(shot.lensFamily === l)}
                  onClick={() => set('lensFamily', l)}
                >
                  {l}
                </button>
              ))}
            </Section>
            <Section title="Focal length">
              {FOCAL_LENGTH_OPTIONS.map((f) => (
                <button
                  key={f}
                  type="button"
                  className={chipClasses(shot.focalLength === f)}
                  onClick={() => set('focalLength', f)}
                >
                  {f}
                </button>
              ))}
            </Section>
            <Section title="Aperture">
              {APERTURE_OPTIONS.map((a) => (
                <button
                  key={a}
                  type="button"
                  className={chipClasses(shot.aperture === a)}
                  onClick={() => set('aperture', a)}
                >
                  {a}
                </button>
              ))}
            </Section>
          </div>
        ) : (
          /* Desktop: 4-column carousel */
          <div className="relative px-3 pb-3 pt-3">
            <div className="flex items-stretch divide-x divide-white/[0.025]">
              <div className="flex-1 px-1.5">
                <LensWheel
                  ref={bodyRef}
                  label="Body"
                  options={CAMERA_BODY_OPTIONS}
                  value={shot.cameraBody as (typeof CAMERA_BODY_OPTIONS)[number] | undefined}
                  onChange={(next) => set('cameraBody', next)}
                  renderGlyph={(name, active) => (
                    <CameraGlyph
                      name={name}
                      className={active ? 'text-[#fdba74]' : 'text-zinc-500'}
                      active={active}
                    />
                  )}
                />
              </div>
              <div className="flex-1 px-1.5">
                <LensWheel
                  ref={lensRef}
                  label="Lens"
                  options={LENS_FAMILY_OPTIONS}
                  value={shot.lensFamily as (typeof LENS_FAMILY_OPTIONS)[number] | undefined}
                  onChange={(next) => set('lensFamily', next)}
                  renderGlyph={(name, active) => (
                    <LensGlyph
                      name={name}
                      className={active ? 'text-[#fdba74]' : 'text-zinc-500'}
                      active={active}
                    />
                  )}
                />
              </div>
              <div className="flex-1 px-1.5">
                <LensWheel
                  ref={focalRef}
                  label="Focal"
                  options={FOCAL_LENGTH_OPTIONS}
                  value={shot.focalLength as (typeof FOCAL_LENGTH_OPTIONS)[number] | undefined}
                  onChange={(next) => set('focalLength', next)}
                  renderGlyph={(value, active) => (
                    <FocalGlyph
                      value={value}
                      className={active ? 'text-[#fdba74]' : 'text-zinc-500'}
                      active={active}
                    />
                  )}
                />
              </div>
              <div className="flex-1 px-1.5">
                <LensWheel
                  ref={apertureRef}
                  label="Aperture"
                  options={APERTURE_OPTIONS}
                  value={shot.aperture as (typeof APERTURE_OPTIONS)[number] | undefined}
                  onChange={(next) => set('aperture', next)}
                  renderGlyph={(value, active) => (
                    <ApertureGlyph
                      value={value}
                      className={active ? 'text-[#fdba74]' : 'text-zinc-500'}
                      active={active}
                    />
                  )}
                />
              </div>
            </div>
          </div>
        )}

        {/* Secondary controls (Shot size · Movement · Mood) — collapsible */}
        <div className="border-t border-white/[0.04]">
          <button
            type="button"
            onClick={() => setShowMore((v) => !v)}
            className="flex w-full items-center justify-between px-5 py-2.5 text-[11px] uppercase tracking-[0.22em] text-zinc-500 transition-colors hover:text-zinc-300"
          >
            <span>Framing · {mediaType === 'video' ? 'Movement · ' : ''}Mood</span>
            {showMore ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          </button>
          {showMore ? (
            <div className="space-y-3 px-5 pb-4 pt-1">
              <Section title="Shot size">
                {SHOT_SIZE_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    className={chipClasses(shot.shotSize === opt.value)}
                    onClick={() => set('shotSize', opt.value as ShotSize)}
                  >
                    {opt.label}
                  </button>
                ))}
              </Section>

              {mediaType === 'video' ? (
                <Section title="Movement">
                  {MOVEMENT_OPTIONS.map((mv) => (
                    <button
                      key={mv}
                      type="button"
                      className={chipClasses(shot.movement === mv)}
                      onClick={() => set('movement', mv)}
                    >
                      {mv}
                    </button>
                  ))}
                </Section>
              ) : null}

              <Section title="Mood">
                {MOOD_OPTIONS.map((mood) => (
                  <button
                    key={mood}
                    type="button"
                    className={chipClasses(shot.mood === mood)}
                    onClick={() => set('mood', mood)}
                  >
                    {mood}
                  </button>
                ))}
              </Section>
            </div>
          ) : null}
        </div>
      </PopoverContent>
    </Popover>
  );
}

export default ShotCameraControl;
