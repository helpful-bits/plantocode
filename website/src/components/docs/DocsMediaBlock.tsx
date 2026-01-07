'use client';

import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import Image from 'next/image';
import { cdnUrl } from '@/lib/cdn';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Maximize2 } from 'lucide-react';

interface DocsMediaBlockProps {
  title?: string;
  description?: string;
  imageSrc?: string;
  imageAlt?: string;
  videoSrc?: string;
  posterSrc?: string;
  caption?: string;
  className?: string;
}

export function DocsMediaBlock({
  title,
  description,
  imageSrc,
  imageAlt,
  videoSrc,
  posterSrc,
  caption,
  className,
}: DocsMediaBlockProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Close on escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsExpanded(false);
      }
    };
    if (isExpanded) {
      document.addEventListener('keydown', handleEscape);
      document.body.style.overflow = 'hidden';
    }
    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.body.style.overflow = '';
    };
  }, [isExpanded]);

  // Images served locally from public folder, videos from CDN
  const resolvedImageSrc = typeof imageSrc === 'string' && imageSrc.trim().length > 0
    ? imageSrc
    : null;
  const resolvedVideoSrc = typeof videoSrc === 'string' && videoSrc.trim().length > 0
    ? cdnUrl(videoSrc)
    : null;
  const resolvedPosterSrc = typeof posterSrc === 'string' && posterSrc.trim().length > 0
    ? posterSrc
    : undefined;
  const resolvedTitle = typeof title === 'string' ? title : '';
  const resolvedDescription = typeof description === 'string' ? description : '';
  const resolvedCaption = typeof caption === 'string' ? caption : '';
  const resolvedAlt = typeof imageAlt === 'string' ? imageAlt : '';

  if (!resolvedImageSrc && !resolvedVideoSrc) {
    return null;
  }

  return (
    <>
      <div className={cn('space-y-4', className)}>
        {(resolvedTitle || resolvedDescription) ? (
          <div className="space-y-2">
            {resolvedTitle ? (
              <h3 className="text-lg font-semibold">{resolvedTitle}</h3>
            ) : null}
            {resolvedDescription ? (
              <p className="text-sm text-muted-foreground leading-relaxed">
                {resolvedDescription}
              </p>
            ) : null}
          </div>
        ) : null}

        {resolvedImageSrc ? (
          <figure className="space-y-3">
            <div
              className="group relative overflow-hidden rounded-xl border border-border/40 bg-background/60 cursor-pointer transition-all hover:border-primary/40 hover:shadow-lg hover:shadow-primary/5"
              onClick={() => setIsExpanded(true)}
            >
              <Image
                src={resolvedImageSrc}
                alt={resolvedAlt}
                width={1600}
                height={900}
                className="h-auto w-full transition-transform duration-300 group-hover:scale-[1.02]"
              />
              {/* Expand overlay */}
              <div className="absolute inset-0 bg-gradient-to-t from-background/70 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-end justify-center pb-4">
                <div className="bg-background/95 backdrop-blur-xl rounded-full px-4 py-2 shadow-xl border border-primary/40 flex items-center gap-2">
                  <Maximize2 className="w-4 h-4 text-primary" />
                  <span className="text-sm font-medium text-foreground">Click to expand</span>
                </div>
              </div>
            </div>
            {resolvedCaption ? (
              <figcaption className="text-xs text-muted-foreground">
                {resolvedCaption}
              </figcaption>
            ) : null}
          </figure>
        ) : null}

        {resolvedVideoSrc ? (
          <figure className="space-y-3">
            <div className="relative overflow-hidden rounded-xl border border-border/40 bg-background/60">
              <video
                className="h-auto w-full"
                controls
                preload="metadata"
                poster={resolvedPosterSrc}
              >
                <source src={resolvedVideoSrc} type="video/mp4" />
              </video>
            </div>
            {resolvedCaption ? (
              <figcaption className="text-xs text-muted-foreground">
                {resolvedCaption}
              </figcaption>
            ) : null}
          </figure>
        ) : null}
      </div>

      {/* Lightbox Modal */}
      {mounted && isExpanded && resolvedImageSrc && createPortal(
        <AnimatePresence>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-background/98 backdrop-blur-xl"
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              width: '100vw',
              height: '100vh'
            }}
            onClick={() => setIsExpanded(false)}
          >
            {/* Close Button */}
            <button
              onClick={() => setIsExpanded(false)}
              className="fixed top-4 right-4 p-3 rounded-full bg-background/80 border border-border/60 hover:border-primary/50 hover:bg-background transition-all z-[101] shadow-lg"
              style={{ position: 'fixed', top: '1rem', right: '1rem' }}
              aria-label="Close expanded image"
            >
              <X className="w-6 h-6 text-foreground" />
            </button>

            {/* Caption in expanded view */}
            {resolvedTitle && (
              <div
                className="fixed top-4 left-4 max-w-md z-[101]"
                style={{ position: 'fixed', top: '1rem', left: '1rem' }}
              >
                <h3 className="text-lg font-semibold text-foreground bg-background/80 backdrop-blur-xl px-4 py-2 rounded-lg border border-border/40">
                  {resolvedTitle}
                </h3>
              </div>
            )}

            {/* Image Container */}
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="relative w-full h-full flex items-center justify-center p-8"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="relative w-full h-full max-w-7xl">
                <Image
                  src={resolvedImageSrc}
                  alt={resolvedAlt}
                  fill
                  className="object-contain"
                  sizes="100vw"
                  quality={100}
                />
              </div>
            </motion.div>

            {/* Footer caption */}
            {resolvedCaption && (
              <div
                className="fixed bottom-4 left-1/2 -translate-x-1/2 max-w-2xl z-[101]"
                style={{ position: 'fixed', bottom: '1rem' }}
              >
                <p className="text-sm text-muted-foreground bg-background/80 backdrop-blur-xl px-4 py-2 rounded-lg border border-border/40 text-center">
                  {resolvedCaption}
                </p>
              </div>
            )}
          </motion.div>
        </AnimatePresence>,
        document.body
      )}
    </>
  );
}
