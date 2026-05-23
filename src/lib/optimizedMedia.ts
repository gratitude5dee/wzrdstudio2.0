/** Optimized media contract for UI consumption */

export interface OptimizedSource {
  type: string; // MIME type e.g. 'image/avif', 'video/mp4'
  src: string;
  width?: number;
  height?: number;
}

export interface OptimizedMediaEntry {
  id: string;
  kind: 'image' | 'video' | 'logo';
  alt: string;
  width: number;
  height: number;
  /** Base64 or CSS gradient placeholder for blur-up */
  placeholder?: string;
  /** Available sources in priority order (modern formats first) */
  sources: OptimizedSource[];
  /** For responsive images */
  srcSet?: string;
  sizes?: string;
  /** For video entries */
  poster?: string;
  previewLoop?: OptimizedSource[];
  /** Role metadata from the original asset */
  role?: string;
  title?: string;
}

export type OptimizedMediaManifest = Record<string, OptimizedMediaEntry>;
