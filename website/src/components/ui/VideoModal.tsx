'use client';

import { useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';
import { cdnUrl } from '@/lib/cdn';
import { useMessages } from '@/components/i18n/useMessages';

interface VideoModalProps {
  isOpen: boolean;
  onClose: () => void;
  videoPath?: string;
}

export function VideoModal({
  isOpen,
  onClose,
  videoPath = '/assets/videos/hero-section-16by9.mp4'
}: VideoModalProps) {
  const { t } = useMessages();
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (isOpen && videoRef.current) {
      const timeout = setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.requestFullscreen?.() ||
          (videoRef.current as any).webkitRequestFullscreen?.() ||
          (videoRef.current as any).mozRequestFullScreen?.() ||
          (videoRef.current as any).msRequestFullscreen?.();
          videoRef.current.play();
        }
      }, 100);

      return () => clearTimeout(timeout);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  return createPortal(
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[100] bg-black"
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          width: '100vw',
          height: '100vh',
        }}
      >
        <button
          onClick={onClose}
          className="absolute top-4 right-4 z-[110] p-3 rounded-full bg-black/50 hover:bg-black/70 text-white transition-all duration-200"
          aria-label={t('videoModal.closeLabel')}
        >
          <X className="w-6 h-6" />
        </button>

        <video
          ref={videoRef}
          className="w-full h-full object-contain"
          controls
          autoPlay
          onClick={(e) => e.stopPropagation()}
        >
          <source src={cdnUrl(videoPath)} type="video/mp4" />
          {t('videoModal.unsupported')}
        </video>
      </motion.div>
    </AnimatePresence>,
    document.body
  );
}
