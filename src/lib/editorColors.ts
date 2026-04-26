export const EDITOR_COLORS = {
  // Backgrounds
  bgPrimary: 'hsl(0, 0%, 4%)',       // #0a0a0a - gray-950
  bgSecondary: 'hsl(0, 0%, 10%)',    // #1a1a1a - gray-900
  bgTertiary: 'hsl(0, 0%, 16%)',     // #2a2a2a - gray-800
  
  // Borders
  border: 'hsl(0, 0%, 16%)',         // #2a2a2a
  borderLight: 'hsl(0, 0%, 23%)',    // #3a3a3a
  
  // Text
  textPrimary: 'hsl(0, 0%, 100%)',   // #ffffff
  textSecondary: 'hsl(220, 9%, 68%)', // #9ca3af
  textMuted: 'hsl(220, 9%, 46%)',    // #6b7280
  
  // Accents
  accentOrange: 'hsl(25, 95%, 53%)',   // #f97316 - Export button
  activeOrange: 'hsl(25, 95%, 53%)',   // #f97316 - Active text color
  activePurple: 'hsl(14, 100%, 64%)', // #FF6B4A - Active fill color (coral)
  playheadOrange: 'hsl(25, 95%, 53%)', // #f97316 - Timeline playhead
  
  // States
  hover: 'hsla(0, 0%, 100%, 0.05)',
  selected: 'hsl(25, 95%, 53%)',       // #f97316
} as const;
