<p align="center"> <img src="/public/wzrdtechlogo.png" alt="WZRD Studio" width="280" /> </p> <h1 align="center">WZRD — AI Creative Studio</h1> <p align="center"> <strong>End-to-end video production: concept → storyline → studio → editor</strong> </p> <p align="center"> <a href="#whats-built">What's Built</a> • <a href="#architecture">Architecture</a> • <a href="#tech-stack">Tech Stack</a> • <a href="#environment-setup">Setup</a> • <a href="#development">Development</a> </p> <p align="center"> <img src="https://img.shields.io/badge/frontend-React%2018%20+%20Vite-blue" alt="Frontend" /> <img src="https://img.shields.io/badge/3D-Three.js-orange" alt="Three.js" /> <img src="https://img.shields.io/badge/video-Remotion-purple" alt="Remotion" /> <img src="https://img.shields.io/badge/backend-Supabase-green" alt="Supabase" /> <img src="https://img.shields.io/badge/AI%20models-66%2B-red" alt="AI Models" /> </p>

Overview
WZRD is an AI-powered creative studio platform for end-to-end video and content production. The platform combines a cinematic WebGL landing experience, a multi-step project setup wizard, a node-based studio editor with 66+ AI models, and a Remotion-powered video editor — all backed by Supabase (Postgres, Auth, Edge Functions, Storage).

Built with React + Vite, Three.js, Remotion, React Flow, and Tailwind CSS, WZRD delivers a cohesive creative workflow from concept to final cut with a unified orange/amber accent theme throughout.

Table of Contents
* What's Built
* Key Features
* Architecture
* Tech Stack
* Environment Setup
* Development
* Contributing

<a id="whats-built"></a>
What's Built — Foundation, Generation Pipeline & Editor
This mission delivered the core creative production pipeline end-to-end:

**Cinematic Landing Experience**
* WebGL intro animation built with Three.js / React Three Fiber with particle fields, caustic overlays, and ember effects
* Video background hero section with card-based feature showcase
* Global orange/amber accent theme applied across all surfaces

**Project Setup Wizard (5-Step Flow)**
1. **Concept** — Genre selection, tone, dynamic concept form with AI-assisted generation
2. **Storyline** — AI-generated storylines with document upload support (PDF, DOCX, MD, TXT via `document-parse` edge function)
3. **Settings & Cast** — Format selection, character management with voice cloning integration (ElevenLabs `elevenlabs-voices` / `elevenlabs-tts`)
4. **Breakdown** — Scene breakdown with editable scene cards, location/clothing/sound sections
5. **Timeline** — Shot timeline with BPM detection for music videos (`web-audio-beat-detector`)

**Studio — Node Editor**
* React Flow-based node editor with 66+ AI model integrations (Fal.ai, Gemini, Luma, ElevenLabs, WorldLabs)
* Node types: image generation, video generation, audio/SFX, text-to-speech, image editing, 3D, compute (FFmpeg), upload, output
* Edge validation with visual error feedback (glowing/compute edge variants)
* Prompt-to-workflow generation with autocomplete (`generate-workflow` edge function)
* Model marketplace (Flora) for browsing and selecting AI models

**Video Editor**
* Remotion-based preview and composition rendering
* Multi-track timeline with clips, transitions, waveform rendering
* Media library with drag-and-drop asset management
* Properties panel, effects, text overlays, and final export
* Unified generation service layer (`unifiedGenerationService.ts`) across all generation endpoints

Key Features
* **Cinematic WebGL Intro** — Three.js-powered intro animation with particle systems and post-processing effects
* **Document Upload** — PDF/DOCX/MD/TXT parsing for storyline input via Supabase Edge Functions
* **BPM Detection** — Automatic tempo detection for music video shot timing using Web Audio API
* **Voice Cloning** — ElevenLabs integration for character voice-over generation
* **66+ AI Models** — Image, video, audio, 3D, and text generation models accessible from the studio node editor
* **Edge Validation** — Real-time connection validation with visual feedback in the node editor
* **Prompt-to-Workflow** — Natural language workflow generation with autocomplete suggestions
* **Remotion Video Editor** — Frame-accurate preview, multi-track timeline, transitions, and export
* **Unified Generation Service** — Single service layer routing to Fal.ai, Gemini, ElevenLabs, and Luma backends
* **Orange/Amber Theme** — Consistent accent color system across all UI surfaces

<a id="architecture"></a>
Architecture
┌─────────────────────────────────────────────────────────────────────┐
│                         WZRD PLATFORM                               │
│                                                                     │
│  ┌──────────────┐   ┌──────────────────┐   ┌────────────────────┐  │
│  │  React + Vite │   │  Supabase Edge   │   │  AI Providers      │  │
│  │  (Frontend)   │◄─►│  Functions       │◄─►│  Fal.ai / Gemini / │  │
│  │  Three.js /   │   │  (Deno)          │   │  ElevenLabs / Luma │  │
│  │  Remotion /   │   │                  │   │  WorldLabs         │  │
│  │  React Flow   │   │                  │   │                    │  │
│  └──────┬───────┘   └────────┬─────────┘   └────────────────────┘  │
│         │                    │                                      │
│  ┌──────▼────────────────────▼───────────────────────────────────┐  │
│  │                    SUPABASE CORE                               │  │
│  │                                                                │  │
│  │  ┌─────────────┐  ┌────────────┐  ┌────────────┐  ┌────────┐ │  │
│  │  │  Postgres    │  │  Auth +    │  │  Realtime   │  │Storage │ │  │
│  │  │             │  │  RLS       │  │             │  │(Assets)│ │  │
│  │  └─────────────┘  └────────────┘  └────────────┘  └────────┘ │  │
│  └────────────────────────────────────────────────────────────────┘  │
│                                                                     │
│  ┌────────────────────────────────────────────────────────────────┐  │
│  │              GENERATION PIPELINE                               │  │
│  │                                                                │  │
│  │  ┌──────────┐  ┌───────────┐  ┌───────────┐  ┌────────────┐  │  │
│  │  │ Unified  │  │ Job Queue │  │ Document  │  │ Asset      │  │  │
│  │  │ Gen Svc  │  │ + Worker  │  │ Parser    │  │ Processor  │  │  │
│  │  └──────────┘  └───────────┘  └───────────┘  └────────────┘  │  │
│  └────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘

<a id="tech-stack"></a>
Stack Summary
Layer	Technology	Role
Frontend	React 18 + Vite + TypeScript	SPA with Tailwind CSS, Radix UI, Framer Motion
3D / WebGL	Three.js, React Three Fiber, Drei	Cinematic intro animation, particle effects
Node Editor	React Flow (@xyflow/react)	Studio canvas with custom nodes, edges, and validation
Video Editor	Remotion	Frame-accurate preview, multi-track timeline, export
State	Zustand + React Query	Client state and server-cache management
API	Supabase Edge Functions (Deno)	Generation routing, document parsing, auth, billing
Database	Supabase Postgres	Projects, storylines, shots, studio graphs, credits
Auth	Supabase Auth	JWT-based with Row-Level Security
Storage	Supabase Storage	Asset uploads, generated media, style references
AI Providers	Fal.ai, Google Gemini, ElevenLabs, Luma, WorldLabs	Image/video/audio/3D generation and voice cloning
<a id="edge-functions"></a>
Edge Functions (Supabase)
The backend is composed of ~40 Supabase Edge Functions covering generation, parsing, and platform services:

**Generation**
`falai-execute` · `falai-image-generation` · `falai-video-generation` · `gemini-image-generation` · `gemini-video-generation` · `gemini-text-generation` · `gemini-storyline-generation` · `gemini-image-analysis` · `elevenlabs-tts` · `elevenlabs-sfx` · `elevenlabs-music` · `elevenlabs-voices` · `worldlabs-proxy` · `luma-webhook` · `generate-shot-image` · `generate-shot-audio` · `generate-video-from-image` · `generate-visual-prompt` · `generate-character-image` · `generate-thumbnail` · `generate-concept-examples` · `generate-workflow` · `generate-storylines` · `compute-execute`

**Project & Document**
`create-project` · `finalize-project-setup` · `document-parse` · `asset-upload` · `asset-processor` · `director-cut` · `gen-shots`

**Platform**
`auth-middleware` · `store-api-keys` · `get-api-keys` · `billing-checkout` · `billing-portal` · `billing-webhook` · `billing-catalog` · `admin-add-credits` · `job-queue` · `job-worker` · `studio-save-state` · `studio-load-state`


<a id="environment-setup"></a>
Environment Setup
Prerequisites
* Node.js 20+ (or Bun)
* A Supabase project (for auth, database, storage, and edge functions)

Local Development
```bash
# Install dependencies (includes Three.js, web-audio-beat-detector, Remotion, React Flow, etc.)
npm install

# Create .env file with your Supabase credentials
cp .env.example .env   # or create manually:
```

Environment Variables (`.env`):
```
VITE_SUPABASE_URL=https://<project-ref>.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...
```

Start the dev server:
```bash
npm run dev
```

<a id="development"></a>
Development
```bash
# Run unit tests
npm run test

# Lint
npm run lint

# Type-check
npx tsc --noEmit

# Run E2E tests (Playwright)
npm run test:e2e

# Remotion preview
npm run remotion:preview
```

Contributing
1. Fork the repository.
2. Create a feature branch: `git checkout -b feat/your-feature`.
3. Commit with conventional commits: `feat:`, `fix:`, `docs:`, `refactor:`.
4. Ensure `npm run lint`, `npx tsc --noEmit`, and `npm run test` pass.
5. Open a Pull Request against `master`.

<p align="center"> <strong>WZRD Studio</strong> — AI-powered creative production, concept to final cut.<br/> Built with React, Three.js, Remotion, React Flow & Supabase. </p>
