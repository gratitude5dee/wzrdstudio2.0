import { useEffect, useRef, useState, memo } from 'react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

interface StreamingTextAnimateProps {
  /** The full text to display so far (grows as streaming appends) */
  text: string;
  /** Whether streaming is still in progress (shows cursor when true) */
  isStreaming?: boolean;
  className?: string;
}

/**
 * A progressive typewriter / blur-in component for streamed text.
 *
 * Animates newly-arrived words in batches of 3-5 for a natural typing feel.
 * Previously revealed words are rendered instantly (no re-animation flicker).
 * Paragraph-aware: adds a brief pause at paragraph breaks.
 */
function StreamingTextAnimateBase({
  text,
  isStreaming = false,
  className,
}: StreamingTextAnimateProps) {
  // Split into paragraphs first, then words within each paragraph
  const paragraphs = text.split(/\n\n+/);
  
  // Flatten to word tokens while tracking paragraph boundaries
  const tokens: Array<{ word: string; isParagraphBreak: boolean }> = [];
  paragraphs.forEach((para, pIdx) => {
    if (pIdx > 0) {
      tokens.push({ word: '\n\n', isParagraphBreak: true });
    }
    const words = para.split(/(\s+)/);
    words.forEach(word => {
      tokens.push({ word, isParagraphBreak: false });
    });
  });

  // Track how many tokens have already been revealed so they don't re-animate
  const revealedCountRef = useRef(0);
  const [revealedCount, setRevealedCount] = useState(0);

  useEffect(() => {
    if (tokens.length > revealedCountRef.current) {
      const timer = requestAnimationFrame(() => {
        revealedCountRef.current = tokens.length;
        setRevealedCount(tokens.length);
      });
      return () => cancelAnimationFrame(timer);
    }
  }, [tokens.length]);

  // Group new words into batches of 3 for smoother animation
  const newStartIdx = revealedCount;
  const batchSize = 3;

  return (
    <div className={cn('leading-relaxed', className)}>
      {tokens.map((token, i) => {
        if (token.isParagraphBreak) {
          return <div key={`pb-${i}`} className="h-4" />;
        }

        const alreadyRevealed = i < revealedCount;

        if (alreadyRevealed) {
          return (
            <span key={`w-${i}`} className="inline whitespace-pre-wrap">
              {token.word}
            </span>
          );
        }

        // New word — animate in batches with subtle blur
        const batchIndex = Math.floor((i - newStartIdx) / batchSize);
        return (
          <motion.span
            key={`w-${i}`}
            className="inline whitespace-pre-wrap"
            initial={{ opacity: 0, filter: 'blur(2px)' }}
            animate={{ opacity: 1, filter: 'blur(0px)' }}
            transition={{
              duration: 0.2,
              delay: batchIndex * 0.06,
              ease: 'easeOut',
            }}
          >
            {token.word}
          </motion.span>
        );
      })}

      {/* Thin vertical cursor while streaming */}
      {isStreaming && (
        <motion.span
          className="inline-block w-[2px] h-5 bg-primary ml-0.5 align-middle rounded-full"
          animate={{ opacity: [1, 0.2, 1] }}
          transition={{ duration: 1, repeat: Infinity, ease: 'easeInOut' }}
        />
      )}

      {/* Completion glow on last sentence when streaming finishes */}
      {!isStreaming && tokens.length > 0 && revealedCount === tokens.length && (
        <motion.span
          className="inline"
          initial={{ textShadow: '0 0 8px rgba(139, 92, 246, 0.4)' }}
          animate={{ textShadow: '0 0 0px transparent' }}
          transition={{ duration: 0.5, delay: 0.2 }}
        />
      )}
    </div>
  );
}

export const StreamingTextAnimate = memo(StreamingTextAnimateBase);
