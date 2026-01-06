'use client';

import { useState } from 'react';
import { Link } from '@/i18n/navigation';
import { ArrowLeft, Calendar, Clock, Share2, Copy, CheckCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { GlassCard } from '@/components/ui/GlassCard';
import { useMessages } from '@/components/i18n/useMessages';
// Removed Reveal to fix initial content visibility issues

interface DocsArticleProps {
  title: string;
  description: string;
  date: string;
  readTime: string;
  category: string;
  children: React.ReactNode;
  showFooter?: boolean;
}

export function DocsArticle({ 
  title, 
  description, 
  date, 
  readTime, 
  category, 
  children,
  showFooter = true,
}: DocsArticleProps) {
  const [copied, setCopied] = useState(false);
  const { t, locale } = useMessages();
  const backToDocsLabel = t('docs.article.backToDocs');
  const shareLabel = t('docs.article.share');
  const copyLinkLabel = t('docs.article.copyLink');
  const copiedLabel = t('docs.article.copied');
  const viewAllDocsLabel = t('docs.article.viewAllDocs');
  const readSuffix = t('docs.article.readSuffix');
  const dateFormatter = new Intl.DateTimeFormat(locale, {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });

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
    <article className="relative pt-4 pb-16 sm:pb-20 lg:pb-24 animate-fade-in">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-5xl">
        <Link
          href="/docs"
          className="inline-flex items-center gap-2 text-muted-foreground hover:text-primary transition-colors mb-4 group"
        >
          <ArrowLeft className="w-4 h-4 transition-transform group-hover:-translate-x-1" />
          <span>{backToDocsLabel}</span>
        </Link>

        <GlassCard className="p-8 sm:p-10 lg:p-12">
          <header className="mb-10">
            <div className="flex items-center gap-3 mb-4">
              <span className="py-1 rounded-full bg-primary/10 text-primary text-sm font-medium">
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
                  {dateFormatter.format(new Date(date))}
                </time>
              </div>
              <span>•</span>
              <div className="flex items-center gap-1">
                <Clock className="w-4 h-4" />
                <span>{readTime} {readSuffix}</span>
              </div>
              <span>•</span>
              <Button variant="ghost" size="sm" onClick={handleShare} className="gap-2">
                <Share2 className="h-4 w-4" /> {shareLabel}
              </Button>
              <Button variant="ghost" size="sm" onClick={handleCopyLink} className="gap-2">
                {copied ? (
                  <>
                    <CheckCircle className="h-4 w-4" />
                    <span>{copiedLabel}</span>
                  </>
                ) : (
                  <>
                    <Copy className="h-4 w-4" />
                    <span>{copyLinkLabel}</span>
                  </>
                )}
              </Button>
            </div>
          </header>

          <div className="prose dark:prose-invert docs-prose mx-auto">
            {children}
          </div>

          {showFooter && (
            <footer className="mt-12 pt-8 border-t border-border/50">
              <div className="flex justify-center">
                <Button asChild variant="outline" size="sm">
                  <Link href="/docs">{viewAllDocsLabel}</Link>
                </Button>
              </div>
            </footer>
          )}
        </GlassCard>
      </div>
    </article>
  );
}
