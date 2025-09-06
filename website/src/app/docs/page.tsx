import type { Metadata } from 'next';
import Link from 'next/link';
import { GlassCard } from '@/components/ui/GlassCard';
import { Button } from '@/components/ui/button';
import { Calendar, Clock, ArrowRight, FileCode, Zap, Brain } from 'lucide-react';

export const metadata: Metadata = {
  title: 'Docs - Vibe Manager: Enhance Claude Code & Cursor Workflows',
  description: 'Learn how Vibe Manager enhances Claude Code and Cursor with intelligent context curation, implementation planning, and workflow optimization.',
  keywords: ['vibe manager', 'claude code enhancement', 'cursor companion', 'ai workflow optimization', 'implementation planning'],
};

const docArticles = [
  {
    slug: 'vibe-manager-architecture',
    title: 'How Vibe Manager Enhances Claude Code & Cursor',
    excerpt: 'Desktop companion app that prepares context, plans implementations, and researches solutions to enhance your Claude Code and Cursor workflows.',
    date: '2025-09-05',
    readTime: '9 min',
    category: 'Integration Guide',
    icon: <Brain className="w-5 h-5" />,
    featured: true,
    keywords: ['claude code integration', 'cursor enhancement', 'ai workflow companion', 'implementation planning'],
  },
  {
    slug: 'claude-code-install',
    title: 'Complete Claude Code Installation Guide',
    excerpt: 'Step-by-step guide to install Claude Code and enhance it with Vibe Manager - desktop app that complements CLI/IDE workflows; not an IDE plugin. Learn Claude Code setup and advanced tips.',
    date: '2025-09-04',
    readTime: '10 min',
    category: 'Installation Guide',
    icon: <FileCode className="w-5 h-5" />,
    featured: true,
    keywords: ['claude code install', 'install claude code', 'claudecode', 'claude code setup'],
  },
  {
    slug: 'claude-code-vs-cursor',
    title: 'Maximizing Claude Code & Cursor with Vibe Manager',
    excerpt: 'Learn how Vibe Manager acts as the perfect companion for both Claude Code and Cursor, providing intelligent context preparation and implementation planning.',
    date: '2025-09-03',
    readTime: '8 min',
    category: 'Workflow Enhancement',
    icon: <Zap className="w-5 h-5" />,
    featured: true,
    keywords: ['claude code companion', 'cursor workflow', 'ai tool enhancement', 'context preparation'],
  },
  {
    slug: 'claude-code-alternative',
    title: 'Supercharge Claude Code with Vibe Manager Extensions',
    excerpt: 'Discover how Vibe Manager extends Claude Code capabilities with MCP integrations, agent workflows, and intelligent context management for enhanced productivity.',
    date: '2025-09-02',
    readTime: '6 min',
    category: 'Extensions',
    icon: <Brain className="w-5 h-5" />,
    keywords: ['claude code extension', 'mcp integration', 'agent workflows', 'context management'],
  },
];

export default function DocsPage() {
  return (
    <div className="relative pt-20 sm:pt-24 pb-16 sm:pb-20 lg:pb-24">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        {/* Hero Section */}
        <div className="text-center mb-12 sm:mb-16">
          <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold mb-6 sm:mb-8 leading-tight bg-gradient-to-r from-teal-500 via-cyan-500 to-blue-500 dark:from-teal-400 dark:via-cyan-400 dark:to-blue-400 bg-clip-text text-transparent">
            Enhance Claude Code & Cursor
          </h1>
          <p className="text-lg text-muted-foreground max-w-3xl mx-auto leading-relaxed">
            Learn how Vibe Manager transforms your Claude Code and Cursor workflows with intelligent context preparation, implementation planning, and productivity enhancements
          </p>
        </div>

        {/* Featured Posts */}
        <div className="mb-12 sm:mb-16">
          <h2 className="text-2xl font-bold mb-6 sm:mb-8 text-foreground">Featured Enhancement Guides</h2>
          <div className="grid md:grid-cols-2 gap-6 mb-8">
            {docArticles.filter(post => post.featured).map((post) => (
              <Link 
                key={post.slug} 
                href={`/docs/${post.slug}`}
                className="group block"
              >
                <GlassCard className="h-full p-6 transition-all duration-300 hover:border-primary/40 hover:shadow-xl hover:shadow-primary/10">
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-lg bg-primary/10 text-primary group-hover:bg-primary/20 transition-colors">
                        {post.icon}
                      </div>
                      <span className="text-sm font-medium text-primary">{post.category}</span>
                    </div>
                    <ArrowRight className="w-5 h-5 text-muted-foreground group-hover:text-primary transition-all transform group-hover:translate-x-1" />
                  </div>
                  
                  <h3 className="text-lg font-bold mb-3 text-foreground group-hover:text-primary transition-colors">
                    {post.title}
                  </h3>
                  
                  <p className="text-base text-muted-foreground mb-4 line-clamp-2 leading-relaxed">
                    {post.excerpt}
                  </p>
                  
                  <div className="flex items-center gap-4 text-sm text-muted-foreground">
                    <div className="flex items-center gap-1">
                      <Calendar className="w-4 h-4" />
                      <span>{new Date(post.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Clock className="w-4 h-4" />
                      <span>{post.readTime}</span>
                    </div>
                  </div>

                  {/* Keywords tags */}
                  <div className="mt-4 flex flex-wrap gap-2">
                    {post.keywords.slice(0, 3).map((keyword) => (
                      <span 
                        key={keyword}
                        className="inline-block px-3 py-1 text-xs font-medium rounded-full bg-primary/10 text-primary"
                      >
                        {keyword}
                      </span>
                    ))}
                  </div>
                </GlassCard>
              </Link>
            ))}
          </div>
        </div>

        {/* All Posts */}
        <div className="mt-16 sm:mt-20">
          <h2 className="text-2xl font-bold mb-6 sm:mb-8 text-foreground">All Articles</h2>
          <div className="grid gap-4">
            {docArticles.map((post) => (
              <Link 
                key={post.slug} 
                href={`/docs/${post.slug}`}
                className="group block"
              >
                <GlassCard className="p-4 sm:p-6 transition-all duration-300 hover:border-primary/40 hover:shadow-lg hover:shadow-primary/5">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <div className="p-1.5 rounded-lg bg-primary/10 text-primary">
                          {post.icon}
                        </div>
                        <span className="text-sm font-medium text-primary">{post.category}</span>
                        <span className="text-sm text-muted-foreground">•</span>
                        <span className="text-sm text-muted-foreground">{post.readTime}</span>
                      </div>
                      
                      <h3 className="text-lg font-bold mb-2 text-foreground group-hover:text-primary transition-colors">
                        {post.title}
                      </h3>
                      
                      <p className="text-base text-muted-foreground line-clamp-1">
                        {post.excerpt}
                      </p>
                    </div>
                    
                    <div className="flex items-center gap-2 sm:gap-4">
                      <span className="text-sm text-muted-foreground">
                        {new Date(post.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                      </span>
                      <ArrowRight className="w-5 h-5 text-muted-foreground group-hover:text-primary transition-all transform group-hover:translate-x-1" />
                    </div>
                  </div>
                </GlassCard>
              </Link>
            ))}
          </div>
        </div>

        {/* CTA Section */}
        <div className="mt-16 sm:mt-20 lg:mt-24 text-center">
          <GlassCard className="p-8 sm:p-12 border-primary/20">
            <h2 className="text-2xl font-bold mb-4 sm:mb-6 text-foreground">
              Ready to Transform Your AI Workflow?
            </h2>
            <p className="text-lg text-muted-foreground mb-6 sm:mb-8 max-w-2xl mx-auto leading-relaxed">
              Download Vibe Manager and enhance both Claude Code and Cursor with intelligent context preparation, implementation planning, and workflow optimization
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Button asChild variant="cta" size="lg">
                <Link href="/download">Download for Mac</Link>
              </Button>
              <Button asChild variant="outline" size="lg">
                <Link href="/">Learn More</Link>
              </Button>
            </div>
          </GlassCard>
        </div>
      </div>
    </div>
  );
}