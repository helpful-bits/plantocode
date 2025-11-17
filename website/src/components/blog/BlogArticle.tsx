'use client';

import { Link } from '@/i18n/navigation';
import { ArrowLeft, Calendar, Clock, Share2, Copy, CheckCircle, User } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PlatformDownloadSection } from '@/components/ui/PlatformDownloadSection';
import { useState } from 'react';

interface BlogArticleProps {
  title: string;
  description: string;
  date: string;
  readTime?: string;
  category: string;
  author?: string;
  children: React.ReactNode;
  showFooter?: boolean;
}

export function BlogArticle({
  title,
  description,
  date,
  readTime = '10 min',
  category,
  author = 'PlanToCode Team',
  children,
  showFooter = true,
}: BlogArticleProps) {
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
    <article className="relative pt-8 pb-20 sm:pb-24 lg:pb-32 animate-fade-in">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-[850px]">
        {/* Back to Blog */}
        <Link
          href="/blog"
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-primary transition-colors mb-10 group font-medium"
        >
          <ArrowLeft className="w-4 h-4 transition-transform group-hover:-translate-x-1" />
          <span>Back to Blog</span>
        </Link>

        {/* Article Header - More breathing room */}
        <header className="mb-16 pb-10 border-b border-border/30">
          {/* Category badge */}
          <div className="flex items-center gap-3 mb-6">
            <span className="px-4 py-1.5 rounded-full bg-primary/10 text-primary text-sm font-semibold tracking-wide uppercase">
              {category}
            </span>
          </div>

          {/* Title - Larger, more prominent */}
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold mb-8 leading-[1.1] tracking-tight bg-gradient-to-r from-teal-500 via-cyan-500 to-blue-500 dark:from-teal-400 dark:via-cyan-400 dark:to-blue-400 bg-clip-text text-transparent">
            {title}
          </h1>

          {/* Description - More readable */}
          <p className="text-xl sm:text-2xl text-muted-foreground mb-10 leading-relaxed font-light max-w-3xl">
            {description}
          </p>

          {/* Metadata row - Better spacing */}
          <div className="flex flex-wrap items-center gap-x-6 gap-y-3 text-sm text-muted-foreground pt-2">
            <div className="flex items-center gap-2">
              <User className="w-4 h-4" />
              <span className="font-medium">{author}</span>
            </div>
            <span className="text-border">•</span>
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4" />
              <time dateTime={date} className="font-medium">
                {new Date(date).toLocaleDateString('en-US', {
                  month: 'long',
                  day: 'numeric',
                  year: 'numeric'
                })}
              </time>
            </div>
            <span className="text-border">•</span>
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4" />
              <span className="font-medium">{readTime} read</span>
            </div>

            {/* Share buttons - separated */}
            <div className="flex items-center gap-2 ml-auto">
              <Button variant="ghost" size="sm" onClick={handleShare} className="gap-2 h-9 px-3">
                <Share2 className="h-4 w-4" />
                <span className="hidden sm:inline">Share</span>
              </Button>
              <Button variant="ghost" size="sm" onClick={handleCopyLink} className="gap-2 h-9 px-3">
                {copied ? (
                  <>
                    <CheckCircle className="h-4 w-4 text-green-500" />
                    <span className="hidden sm:inline">Copied!</span>
                  </>
                ) : (
                  <>
                    <Copy className="h-4 w-4" />
                    <span className="hidden sm:inline">Copy</span>
                  </>
                )}
              </Button>
            </div>
          </div>
        </header>

        {/* Article Content - Professional blog typography with proper spacing */}
        <div className="prose dark:prose-invert prose-xl max-w-none
            prose-headings:font-bold prose-headings:text-foreground prose-headings:tracking-tight
            prose-h2:text-3xl sm:prose-h2:text-4xl prose-h2:mt-20 prose-h2:mb-8 prose-h2:leading-[1.15]
            prose-h3:text-2xl sm:prose-h3:text-3xl prose-h3:mt-14 prose-h3:mb-6 prose-h3:leading-[1.2]
            prose-h4:text-xl sm:prose-h4:text-2xl prose-h4:mt-12 prose-h4:mb-5 prose-h4:leading-[1.3]
            prose-p:text-[1.125rem] sm:prose-p:text-[1.1875rem] prose-p:text-foreground prose-p:leading-[1.85] prose-p:mb-8 prose-p:mt-0 prose-p:font-normal
            prose-a:text-primary prose-a:font-medium prose-a:no-underline prose-a:underline-offset-4
            hover:prose-a:underline prose-a:transition-all
            prose-strong:text-foreground prose-strong:font-semibold prose-strong:tracking-tight
            prose-code:text-primary prose-code:bg-primary/10 prose-code:px-2 prose-code:py-1
            prose-code:rounded-md prose-code:font-medium prose-code:text-[0.9em]
            prose-code:before:content-[''] prose-code:after:content-['']
            prose-pre:bg-slate-900 dark:prose-pre:bg-slate-950
            prose-pre:border prose-pre:border-slate-700 dark:prose-pre:border-slate-800
            prose-pre:rounded-xl prose-pre:my-8 prose-pre:p-6 prose-pre:leading-relaxed
            prose-pre:shadow-lg prose-pre:overflow-x-auto
            prose-ul:my-8 prose-ul:space-y-4 prose-ul:list-disc prose-ul:pl-6
            prose-ol:my-8 prose-ol:space-y-4 prose-ol:list-decimal prose-ol:pl-6
            prose-li:text-[1.125rem] sm:prose-li:text-[1.1875rem] prose-li:text-foreground prose-li:leading-[1.85] prose-li:pl-2
            prose-li:marker:text-primary/80 prose-li:font-normal
            prose-li>ul:mt-4 prose-li>ul:mb-2
            prose-li>ol:mt-4 prose-li>ol:mb-2
            prose-blockquote:border-l-4 prose-blockquote:border-primary/50
            prose-blockquote:pl-6 prose-blockquote:pr-4 prose-blockquote:py-4
            prose-blockquote:italic prose-blockquote:text-muted-foreground
            prose-blockquote:my-8 prose-blockquote:bg-primary/5 prose-blockquote:rounded-r-lg
            prose-table:w-full prose-table:my-10 prose-table:border-collapse prose-table:text-base
            prose-thead:border-b-2 prose-thead:border-border
            prose-th:px-5 prose-th:py-4 prose-th:text-left prose-th:font-bold prose-th:text-foreground prose-th:text-base
            prose-td:px-5 prose-td:py-4 prose-td:text-foreground prose-td:align-top prose-td:text-base prose-td:leading-relaxed
            prose-tr:border-b prose-tr:border-border/30
            prose-tbody>tr:last-child:border-0
            prose-tbody>tr:hover:bg-primary/5
            prose-img:rounded-xl prose-img:shadow-lg prose-img:my-10
            prose-hr:border-border/50 prose-hr:my-12
          ">
          {children}
        </div>

        {/* Article Footer */}
        {showFooter && (
          <footer className="mt-24 pt-12 border-t border-border/40">
            {/* Download Section */}
            <div className="mb-12 p-8 glass rounded-xl border border-border/50">
              <h3 className="text-2xl font-bold text-center mb-4">Try PlanToCode</h3>
              <p className="text-center text-muted-foreground mb-8 max-w-2xl mx-auto">
                Experience planning-first development with deep research, file discovery, and implementation plans.
              </p>
              <PlatformDownloadSection location="blog_footer" />
            </div>

            <div className="flex flex-col sm:flex-row justify-between items-center gap-6">
              <div className="flex flex-col sm:flex-row items-center gap-4">
                <Button asChild variant="outline" size="default" className="min-w-[180px]">
                  <Link href="/blog" className="flex items-center gap-2">
                    <ArrowLeft className="w-4 h-4" />
                    View All Posts
                  </Link>
                </Button>
              </div>
              <div className="flex flex-wrap justify-center gap-3">
                <Button asChild variant="ghost" size="default">
                  <Link href="/docs">Documentation</Link>
                </Button>
                <Button asChild variant="ghost" size="default">
                  <Link href="/features">Features</Link>
                </Button>
              </div>
            </div>

            {/* Additional footer info */}
            <div className="mt-10 pt-8 border-t border-border/20 text-center text-sm text-muted-foreground">
              <p>Found this helpful? Share it with your team!</p>
            </div>
          </footer>
        )}
      </div>
    </article>
  );
}
