## Replace text "WZRD" with logo image in landing nav and footers

Three files need updates to swap the plain-text logo for the actual WZRD logo image (`/lovable-uploads/wzrdtechlogo.png`):

### 1. Landing page nav (`src/pages/Landing.tsx`)

- **Desktop header** (line 130): Replace `<span className="text-2xl font-bold text-white tracking-tight">WZRD</span>` with an `<img>` tag using the logo, height ~32px.
- **Mobile header** (line 152): Same replacement, height ~24px.

### 2. MassiveFooter (`src/components/landing/MassiveFooter.tsx`)

- Lines 14-17: Replace the "W" square div + "WZRD.tech" text span with the logo `<img>` at ~28px height, keeping the existing layout.

### 3. CinematicFooter (`src/components/landing/CinematicFooter.tsx`)

- Lines 7-9: Replace the "W" square div with the logo `<img>` at ~24px height, keeping the copyright text.

No new files, no database changes. Only visual updates to use the existing logo asset consistently.