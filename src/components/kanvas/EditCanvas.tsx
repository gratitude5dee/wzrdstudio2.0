import { useEffect, useRef, useCallback, forwardRef, useImperativeHandle } from 'react';
import { Tldraw, Editor, createShapeId, DefaultColorStyle, Box } from 'tldraw';
import 'tldraw/tldraw.css';

export interface EditCanvasHandle {
  /** Export drawn strokes as a white-on-black mask PNG data URL */
  getMaskDataUrl: () => Promise<string | null>;
  /** Export the base image (without mask strokes) as a PNG data URL */
  getCanvasImageDataUrl: () => Promise<string | null>;
  /** Add a result image to the canvas beside the original */
  addResultImage: (url: string) => void;
  /** Set the active tool */
  setTool: (tool: 'select' | 'draw' | 'eraser' | 'hand') => void;
  /** Undo / redo */
  undo: () => void;
  redo: () => void;
}

interface EditCanvasProps {
  imageUrl: string | null;
  className?: string;
}

const IMAGE_SHAPE_ID = createShapeId('base-image');

const EditCanvas = forwardRef<EditCanvasHandle, EditCanvasProps>(({ imageUrl, className }, ref) => {
  const editorRef = useRef<Editor | null>(null);
  const loadedUrlRef = useRef<string | null>(null);

  /* ── Load image onto canvas ── */
  const loadImage = useCallback(async (editor: Editor, url: string) => {
    if (loadedUrlRef.current === url) return;
    loadedUrlRef.current = url;

    // Remove old base image if present
    if (editor.getShape(IMAGE_SHAPE_ID)) {
      editor.deleteShapes([IMAGE_SHAPE_ID]);
    }

    // Probe natural dimensions
    const img = new Image();
    img.crossOrigin = 'anonymous';
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('Image load failed'));
      img.src = url;
    });

    const w = img.naturalWidth;
    const h = img.naturalHeight;

    // Create asset
    const assetId = `asset:base-image` as any;
    editor.createAssets([
      {
        id: assetId,
        type: 'image',
        typeName: 'asset',
        props: {
          name: 'base-image',
          src: url,
          w,
          h,
          mimeType: 'image/png',
          isAnimated: false,
        },
        meta: {},
      },
    ]);

    // Create shape centered at origin
    editor.createShape({
      id: IMAGE_SHAPE_ID,
      type: 'image',
      x: -w / 2,
      y: -h / 2,
      isLocked: true,
      props: {
        assetId,
        w,
        h,
      },
    });

    // Zoom to fit
    editor.zoomToFit({ animation: { duration: 300 } });
    editor.setCurrentTool('draw');
  }, []);

  /* ── Editor mount ── */
  const handleMount = useCallback(
    (editor: Editor) => {
      editorRef.current = editor;

      // Dark mode
      editor.user.updateUserPreferences({ colorScheme: 'dark' });

      // Set draw color to lime for masking visibility
      editor.setStyleForNextShapes(DefaultColorStyle, 'yellow');

      // Hide debug
      editor.updateInstanceState({ isDebugMode: false });

      if (imageUrl) {
        loadImage(editor, imageUrl);
      }
    },
    [imageUrl, loadImage]
  );

  /* ── Sync image URL changes ── */
  useEffect(() => {
    const editor = editorRef.current;
    if (editor && imageUrl && imageUrl !== loadedUrlRef.current) {
      loadImage(editor, imageUrl);
    }
  }, [imageUrl, loadImage]);

  /* ── Imperative handle ── */
  useImperativeHandle(ref, () => ({
    getMaskDataUrl: async () => {
      const editor = editorRef.current;
      if (!editor) return null;

      // Get all non-image shapes (the drawn mask strokes)
      const maskShapes = editor
        .getCurrentPageShapes()
        .filter((s) => s.type !== 'image');

      if (maskShapes.length === 0) return null;

      // Get the base image bounds to know mask dimensions
      const baseShape = editor.getShape(IMAGE_SHAPE_ID);
      if (!baseShape) return null;
      const bounds = editor.getShapeGeometry(baseShape).bounds;

      // Export mask shapes as SVG, then rasterize to black/white
      const svg = await editor.getSvgString(maskShapes.map((s) => s.id), {
        bounds: new Box(bounds.x, bounds.y, bounds.w, bounds.h),
        background: false,
        padding: 0,
      });

      if (!svg) return null;

      // Rasterize SVG to canvas, then produce black bg + white strokes
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(bounds.w);
      canvas.height = Math.round(bounds.h);
      const ctx = canvas.getContext('2d')!;

      // Black background
      ctx.fillStyle = '#000000';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Draw SVG strokes as white
      const svgBlob = new Blob([svg.svg], { type: 'image/svg+xml' });
      const svgUrl = URL.createObjectURL(svgBlob);
      const svgImg = new Image();
      await new Promise<void>((resolve) => {
        svgImg.onload = () => resolve();
        svgImg.src = svgUrl;
      });

      // Draw with compositing to make strokes white
      ctx.globalCompositeOperation = 'source-over';
      ctx.drawImage(svgImg, 0, 0, canvas.width, canvas.height);

      // Convert all non-black pixels to white
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const data = imageData.data;
      for (let i = 0; i < data.length; i += 4) {
        if (data[i] > 10 || data[i + 1] > 10 || data[i + 2] > 10) {
          data[i] = 255;
          data[i + 1] = 255;
          data[i + 2] = 255;
          data[i + 3] = 255;
        }
      }
      ctx.putImageData(imageData, 0, 0);

      URL.revokeObjectURL(svgUrl);
      return canvas.toDataURL('image/png');
    },

    getCanvasImageDataUrl: async () => {
      const editor = editorRef.current;
      if (!editor) return null;

      const baseShape = editor.getShape(IMAGE_SHAPE_ID);
      if (!baseShape) return null;

      const bounds = editor.getShapeGeometry(baseShape).bounds;
      const result = await editor.getSvgString([IMAGE_SHAPE_ID], {
        bounds: new Box(bounds.x, bounds.y, bounds.w, bounds.h),
        background: false,
        padding: 0,
      });

      if (!result) return null;

      // Rasterize
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(bounds.w);
      canvas.height = Math.round(bounds.h);
      const ctx = canvas.getContext('2d')!;
      const svgBlob = new Blob([result.svg], { type: 'image/svg+xml' });
      const svgUrl = URL.createObjectURL(svgBlob);
      const img = new Image();
      await new Promise<void>((resolve) => {
        img.onload = () => resolve();
        img.src = svgUrl;
      });
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(svgUrl);
      return canvas.toDataURL('image/png');
    },

    addResultImage: (url: string) => {
      const editor = editorRef.current;
      if (!editor) return;

      const baseShape = editor.getShape(IMAGE_SHAPE_ID);
      const baseW = baseShape ? (baseShape.props as any).w || 512 : 512;
      const baseX = baseShape ? baseShape.x : 0;

      const id = createShapeId();
      // Place result image to the right of the base
      editor.createAssets([
        {
          id: `asset:${id}` as any,
          type: 'image',
          typeName: 'asset',
          props: {
            name: 'result',
            src: url,
            w: baseW,
            h: baseW,
            mimeType: 'image/png',
            isAnimated: false,
          },
          meta: {},
        },
      ]);

      editor.createShape({
        id,
        type: 'image',
        x: baseX + baseW + 40,
        y: baseShape ? baseShape.y : 0,
        props: {
          assetId: `asset:${id}` as any,
          w: baseW,
          h: baseW,
        },
      });

      editor.zoomToFit({ animation: { duration: 300 } });
    },

    setTool: (tool) => {
      editorRef.current?.setCurrentTool(tool);
    },

    undo: () => editorRef.current?.undo(),
    redo: () => editorRef.current?.redo(),
  }));

  return (
    <div className={`w-full h-full edit-canvas-container ${className ?? ''}`}>
      <style>{`
        .edit-canvas-container .tl-background { background: #0e0e0e !important; }
        .edit-canvas-container .tlui-layout { background: transparent !important; }
        .edit-canvas-container .tlui-layout__top,
        .edit-canvas-container .tlui-navigation-zone,
        .edit-canvas-container .tlui-help-menu,
        .edit-canvas-container .tlui-debug-panel,
        .edit-canvas-container .tlui-menu-zone,
        .edit-canvas-container .tlui-style-panel,
        .edit-canvas-container [data-testid="main.page-menu"],
        .edit-canvas-container .tlui-toolbar { display: none !important; }
      `}</style>
      <Tldraw hideUi onMount={handleMount} />
    </div>
  );
});

EditCanvas.displayName = 'EditCanvas';
export default EditCanvas;
