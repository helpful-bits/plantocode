'use client';

import Link from 'next/link';
import { Home, ArrowLeft, Compass } from 'lucide-react';
import GlassCard from '@/components/ui/GlassCard';
import { Button } from '@/components/ui/button';
import { motion } from 'framer-motion';

export default function NotFoundContent() {
  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <GlassCard className="max-w-lg w-full p-8">
        <div className="flex flex-col items-center gap-6 text-center">
          {/* Animated 404 Icon */}
          <motion.div 
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.5, ease: "easeOut" }}
          >
            <motion.div
              animate={{ rotate: [0, 10, -10, 0] }}
              transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
            >
              <Compass className="w-20 h-20 text-primary/60" />
            </motion.div>
          </motion.div>
          
          {/* 404 Text */}
          <div>
            <motion.h1 
              className="text-6xl font-bold text-primary mb-2"
              initial={{ y: -20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.2 }}
            >
              404
            </motion.h1>
            <motion.h2 
              className="text-2xl font-semibold text-foreground mb-3"
              initial={{ y: -20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.3 }}
            >
              Page Not Found
            </motion.h2>
            <motion.p 
              className="text-foreground/70"
              initial={{ y: -20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.4 }}
            >
              Looks like you've ventured into uncharted territory.
            </motion.p>
          </div>

          {/* Helpful Message */}
          <GlassCard className="w-full p-6 bg-primary/5 border-primary/20">
            <p className="text-sm text-foreground/80 mb-4">
              The page you're looking for doesn't exist or has been moved.
            </p>
            <div className="space-y-2 text-left">
              <p className="text-xs text-muted-foreground">
                This might happen because:
              </p>
              <ul className="text-xs text-muted-foreground space-y-1 ml-4">
                <li>• The URL was typed incorrectly</li>
                <li>• The page has been removed or relocated</li>
                <li>• You followed an outdated link</li>
              </ul>
            </div>
          </GlassCard>

          {/* Action Buttons */}
          <motion.div 
            className="flex flex-col sm:flex-row gap-3 justify-center"
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.5 }}
          >
            <Button 
              asChild 
              variant="default" 
              size="lg"
            >
              <Link href="/" className="inline-flex items-center gap-2">
                <Home className="w-4 h-4" />
                Go Home
              </Link>
            </Button>
            
            <Button 
              asChild
              variant="outline" 
              size="lg"
            >
              <Link href="/" className="inline-flex items-center gap-2">
                <ArrowLeft className="w-4 h-4" />
                Go Back
              </Link>
            </Button>
          </motion.div>

          {/* Help Link */}
          <p className="text-sm text-muted-foreground">
            Need help? <Link href="/support" className="link-primary">Contact support</Link>
          </p>
        </div>
      </GlassCard>
    </div>
  );
}