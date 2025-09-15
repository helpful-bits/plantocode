'use client';

import { useState } from 'react';
import Link from 'next/link';
import { GlassCard } from '@/components/ui/GlassCard';
import { Button } from '@/components/ui/button';
import { PlatformDownloadSection } from '@/components/ui/PlatformDownloadSection';
import { SearchDialog } from '@/components/docs/SearchDialog';
import { docsManifest } from '@/docs/docs-manifest';
import { ArrowRight, FileCode, Zap, Brain, Search } from 'lucide-react';

// Metadata needs to be moved to a separate file or layout when using 'use client'

const getIconForSection = (slug: string) => {
  if (slug.includes('plan-mode') || slug.includes('plan')) return <Brain className="w-5 h-5" />;
  if (slug.includes('install') || slug === 'installation') return <FileCode className="w-5 h-5" />;
  if (slug.includes('workflow') || slug.includes('vs')) return <Zap className="w-5 h-5" />;
  return <FileCode className="w-5 h-5" />;
};

export default function DocsPage() {
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  
  return (
    <div className="relative pt-20 sm:pt-24 pb-16 sm:pb-20 lg:pb-24">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        {/* Hero Section */}
        <div className="text-center mb-12 sm:mb-16">
          <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold mb-6 sm:mb-8 leading-tight bg-gradient-to-r from-teal-500 via-cyan-500 to-blue-500 dark:from-teal-400 dark:via-cyan-400 dark:to-blue-400 bg-clip-text text-transparent">
            Enhance Claude Code & Cursor
          </h1>
          <p className="text-lg text-muted-foreground max-w-3xl mx-auto leading-relaxed mb-8">
            Learn how Vibe Manager transforms your Claude Code and Cursor workflows with intelligent context preparation, implementation planning, and productivity enhancements
          </p>
          
          {/* Search docs */}
          <div className="max-w-md mx-auto mb-4">
            <button
              onClick={() => setIsSearchOpen(true)}
              className="w-full glass rounded-xl p-4 border border-border/50 flex items-center gap-3 hover:bg-muted/30 transition-all duration-200 text-left"
              aria-label="Search documentation"
            >
              <Search className="w-5 h-5 text-muted-foreground flex-shrink-0" />
              <span className="text-muted-foreground">
                Search documentation...
              </span>
              <div className="flex items-center gap-1 text-xs text-muted-foreground ml-auto">
                <kbd className="px-2 py-1 bg-background/50 rounded border border-border/50 font-mono">
                  ⌘K
                </kbd>
              </div>
            </button>
          </div>
        </div>

        {/* Explore Documentation */}
        <div className="mb-12 sm:mb-16">
          <h2 className="text-2xl font-bold mb-8 text-foreground">Explore Documentation</h2>
          <div className="grid md:grid-cols-2 gap-6">
            {docsManifest.map((section) => (
              <GlassCard key={section.id} className="p-6 hover:shadow-xl hover:scale-[1.02] transition-all duration-300 border-primary/10">
                <div className="flex items-start gap-4 mb-6">
                  <div className="p-3 rounded-xl bg-gradient-to-br from-primary/20 to-primary/10 text-primary">
                    {getIconForSection(section.id)}
                  </div>
                  <div className="flex-1">
                    <h3 className="text-xl font-bold text-foreground">
                      {section.title}
                    </h3>
                  </div>
                </div>
                
                {/* Child links */}
                {'items' in section && section.items && (
                  <div className="space-y-3 border-t border-border/50 pt-6">
                    {section.items.slice(0, 3).map((item: any) => (
                      <Link
                        key={item.slug}
                        href={item.slug}
                        className="group flex items-center justify-between p-4 rounded-lg hover:bg-primary/10 transition-all duration-200"
                      >
                        <div className="flex-1">
                          <h4 className="text-base font-semibold text-foreground group-hover:text-primary transition-colors duration-200">
                            {item.shortTitle || item.title}
                          </h4>
                          {item.description && (
                            <p className="text-sm text-muted-foreground mt-1.5 line-clamp-2 leading-relaxed">
                              {item.description}
                            </p>
                          )}
                        </div>
                        <ArrowRight className="w-5 h-5 text-muted-foreground group-hover:text-primary transition-all duration-200 transform group-hover:translate-x-1 ml-3 flex-shrink-0" />
                      </Link>
                    ))}
                  </div>
                )}
              </GlassCard>
            ))}
          </div>
        </div>

        {/* CTA Section */}
        <div className="mt-16 sm:mt-20 lg:mt-24 text-center">
          <GlassCard className="p-8 sm:p-12" highlighted>
            <h2 className="text-2xl font-bold mb-6 text-foreground">
              Ready to Transform Your AI Workflow?
            </h2>
            <p className="text-lg text-muted-foreground mb-8 max-w-2xl mx-auto leading-relaxed">
              Download Vibe Manager and enhance both Claude Code and Cursor with intelligent context preparation, implementation planning, and workflow optimization
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <PlatformDownloadSection 
                location="docs_main"
                redirectToDownloadPage={true}
              />
              <Button asChild variant="outline" size="lg">
                <Link href="/">Learn More</Link>
              </Button>
            </div>
          </GlassCard>
        </div>
      </div>
      
      <SearchDialog 
        isOpen={isSearchOpen} 
        onClose={() => setIsSearchOpen(false)} 
      />
    </div>
  );
}