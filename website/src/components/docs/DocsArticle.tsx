'use client';

import Link from 'next/link';
import { ArrowLeft, Calendar, Clock, Share2, Copy, CheckCircle } from 'lucide-react';
import { GlassCard } from '@/components/ui/GlassCard';
import { Button } from '@/components/ui/button';
import { useState } from 'react';
// Removed Reveal to fix initial content visibility issues

interface DocsArticleProps {
  title: string;
  description: string;
  date: string;
  readTime: string;
  category: string;
  children: React.ReactNode;
}

export function DocsArticle({ title, description, date, readTime, category, children }: DocsArticleProps) {
  const [copied, setCopied] = useState(false);

  const handleShare = async () => {
    const url = window.location.href;
    if (navigator.share) {
      try {
        await navigator.share({
          title,
          text: description,
          url,
        });
      } catch (err) {
        // User cancelled share
      }
    } else {
      // Fallback to copy URL
      handleCopyLink();
    }
  };

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy link');
    }
  };

  return (
    <article className="relative pt-20 sm:pt-24 pb-16 sm:pb-20 lg:pb-24 animate-fade-in">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-5xl">
        {/* Back to Docs */}
        <Link 
            href="/docs" 
            className="inline-flex items-center gap-2 text-muted-foreground hover:text-primary transition-colors mb-12 group"
          >
            <ArrowLeft className="w-4 h-4 transition-transform group-hover:-translate-x-1" />
            <span>Back to Docs</span>
          </Link>

        {/* Article Header */}
        <header className="mb-12">
            <div className="flex items-center gap-3 mb-4">
              <span className="px-3 py-1 rounded-full bg-primary/10 text-primary text-sm font-medium">
                {category}
              </span>
            </div>
            
            <h1 className="text-3xl sm:text-4xl font-bold mb-4 leading-tight bg-gradient-to-r from-teal-500 via-cyan-500 to-blue-500 dark:from-teal-400 dark:via-cyan-400 dark:to-blue-400 bg-clip-text text-transparent">
              {title}
            </h1>
            
            <p className="text-lg text-muted-foreground mb-6 leading-relaxed">
              {description}
            </p>
            
            <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
              <div className="flex items-center gap-1">
                <Calendar className="w-4 h-4" />
                <time dateTime={date}>
                  {new Date(date).toLocaleDateString('en-US', { 
                    month: 'long', 
                    day: 'numeric', 
                    year: 'numeric' 
                  })}
                </time>
              </div>
              <span>•</span>
              <div className="flex items-center gap-1">
                <Clock className="w-4 h-4" />
                <span>{readTime} read</span>
              </div>
              <span>•</span>
              <button
                onClick={handleShare}
                className="flex items-center gap-1 hover:text-primary transition-colors"
              >
                <Share2 className="w-4 h-4" />
                <span>Share</span>
              </button>
              <button
                onClick={handleCopyLink}
                className="flex items-center gap-1 hover:text-primary transition-colors"
              >
                {copied ? (
                  <>
                    <CheckCircle className="w-4 h-4" />
                    <span>Copied!</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-4 h-4" />
                    <span>Copy Link</span>
                  </>
                )}
              </button>
            </div>
          </header>

        {/* Article Content */}
        <div className="prose prose-lg dark:prose-invert max-w-none 
            prose-headings:font-bold prose-headings:text-foreground
            prose-h2:text-2xl prose-h2:mt-12 prose-h2:mb-4
            prose-h3:text-xl prose-h3:mt-8 prose-h3:mb-4
            prose-h4:text-lg prose-h4:mt-6 prose-h4:mb-3
            prose-p:text-base prose-p:text-foreground/90 prose-p:leading-relaxed prose-p:mb-6
            prose-a:text-primary prose-a:no-underline hover:prose-a:underline
            prose-strong:text-foreground prose-strong:font-semibold
            prose-code:text-primary prose-code:bg-primary/10 prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded prose-code:font-medium
            prose-pre:bg-slate-900 dark:prose-pre:bg-slate-950 prose-pre:border prose-pre:border-slate-700 dark:prose-pre:border-slate-800
            prose-ul:my-6 prose-ul:space-y-4
            prose-li:text-base prose-li:text-foreground/90 prose-li:leading-relaxed
            prose-blockquote:border-l-4 prose-blockquote:border-primary/50 prose-blockquote:pl-4 prose-blockquote:italic prose-blockquote:text-muted-foreground
          ">
            {children}
          </div>

        {/* Article Footer */}
        <footer className="mt-12 pt-12 border-t border-border">
            <GlassCard className="p-6 space-y-6">
              <h3 className="text-xl font-bold mb-4 text-foreground">
                Ready to Get Started?
              </h3>
              <p className="text-base text-muted-foreground mb-6 leading-relaxed">
                Download Vibe Manager and enhance your Claude Code workflow with multi-model planning and intelligent context curation.
              </p>
              <div className="flex flex-col sm:flex-row gap-4">
                <Button asChild variant="cta" size="lg">
                  <Link href="/downloads">Download for Mac</Link>
                </Button>
                <Button asChild variant="gradient-outline" size="lg">
                  <Link href="/docs">View All Docs</Link>
                </Button>
              </div>
            </GlassCard>
          </footer>
      </div>
    </article>
  );
}