
# Proactive Voice Agent Flow

## Problem
The voice agent waits passively for explicit commands instead of driving the flow. On the concept page, it should take any rough idea, craft a logline, fill it in, and ask to advance — all within seconds.

## Changes

### 1. Rewrite voice instructions in `src/voice/agent.ts`

Replace the `# Conversation Flow` and `# Examples` sections with proactive, page-specific instructions:

**Add new section: `# Pacing — Move Fast`**
- Act immediately when the user provides enough info — fill fields, then ask one short confirmation to advance.
- Never wait for explicit "fill the field" commands. If you have data, fill it.
- Treat "yes", "sure", "go ahead", "next" as immediate confirmation to advance.
- Goal: each page should take seconds, not minutes.

**Add `# Page-Specific Flow — Be Proactive`** with subsections:

- **Concept Page**: When the user describes ANY idea, immediately craft a polished logline, call `set_project_setup_fields` with `{ concept, title }`, read it back, and ask "Want me to move to storyline?" If confirmed, call `project_setup_next`. Target: under 30 seconds.

- **Storyline Page**: After generation completes, summarize key beats in 1-2 sentences and ask to advance to Settings & Cast.

- **Settings & Cast Page**: Announce characters briefly, ask if user wants edits or to move on. On "next", advance immediately.

- **Breakdown Page**: Summarize scene count, ask "Ready to storyboard?" On confirmation, call `breakdown_start_storyboard`.

- **Timeline Page**: Ask if user wants to generate all images or review individual shots. Act on response immediately.

**Update examples** to show the proactive pattern:
- User: "a story about a lonely robot chef" -> Agent immediately crafts logline, fills concept+title, reads it back, asks to advance.
- User: "yes" -> `project_setup_next` called instantly.

**Add explicit English language instruction**: "ALWAYS speak in English."

### 2. No backend or action handler changes needed

The GPT-4o Realtime model itself generates the logline from the user's raw idea — it's a text transformation the model does natively. The existing `set_project_setup_fields` action already accepts `concept` and `title` fields. The existing `project_setup_next` action already handles page advancement. No new edge functions or action registrations are required.

## Outcome
The voice agent becomes a fast, proactive operator that drives users through each page in seconds rather than waiting for explicit step-by-step commands. The concept page flow becomes: user speaks idea -> agent fills logline -> user confirms -> agent advances to storyline.
