
# Voice Selection UI Integration for Storyboard Timeline

## What's already done

All voice bridges, action handlers, prompt, registry, transport, and GA API format are fully implemented. Glow rings work on CharacterCard and BreakdownTab scene cards. The `VoiceSelectionContext` values (`expandedShotId`, `selectedTargets`, `isSelected`) are imported in `ShotsRow` but never consumed.

## What's missing

The storyboard timeline doesn't visually reflect voice selection state:
1. **ShotCard** has no `isVoiceSelected` prop or glow ring styling
2. **ShotsRow** imports voice selection but never passes it to ShotCard or uses `expandedShotId` to auto-expand a shot
3. Shot cards have no `data-voice-shot-id` attribute for scroll-into-view targeting

## Changes

### 1. ShotCard -- Add voice glow ring

File: `src/components/storyboard/shot/ShotCard.tsx`

- Add `isVoiceSelected?: boolean` prop
- Add `data-voice-shot-id={shot.id}` attribute to the root element
- When `isVoiceSelected` is true, apply an orange glow ring (matching the CharacterCard pattern: `ring-2 ring-orange-500/60 shadow-[0_0_12px_rgba(249,115,22,0.3)]`)

### 2. ShotsRow -- Wire voice state to ShotCard

File: `src/components/storyboard/ShotsRow.tsx`

- Pass `isVoiceSelected={selectedTargets.shot?.id === shot.id}` to each ShotCard
- Use `expandedShotId` to auto-expand the voice-selected shot (if the component has an expand/detail mechanism)
- Use `selectTarget` to set voice selection when a shot is clicked (if not already handled by the page bridge)

### 3. Scroll-into-view targeting

The `scrollVoiceTargetIntoView` calls in the StoryboardPage bridge already reference `[data-voice-shot-id="..."]` -- adding that data attribute to ShotCard completes the wiring.

## Outcome

When the voice assistant selects a shot (e.g. "select shot 3"), the corresponding ShotCard will glow orange, scroll into view, and auto-expand if applicable.
