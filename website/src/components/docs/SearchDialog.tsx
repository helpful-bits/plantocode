'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Search, Command, X, File, Loader2 } from 'lucide-react';
import type Fuse from 'fuse.js';
import { docsManifest, type DocGroup, type DocItem } from '@/docs/docs-manifest';

interface SearchResult {
  title: string;
  excerpt: string;
  url: string;
  category?: string;
}

type DocArticle = {
  slug: string;
  title: string;
  shortTitle?: string;
  description?: string;
  category: string;
  tags?: string[];
};

interface PagefindResult {
  id: string;
  score: number;
  words: number[];
  data: () => Promise<{
    url: string;
    excerpt: string;
    meta: {
      title: string;
    };
  }>;
}

interface PagefindAPI {
  search: (query: string) => Promise<{
    results: PagefindResult[];
    unfilteredResultCount: number;
  }>;
}

declare global {
  interface Window {
    pagefind?: PagefindAPI;
  }
}

const buildDocArticles = (groups: DocGroup[]): DocArticle[] => {
  const articles: DocArticle[] = [];

  const traverse = (items: (DocItem | DocGroup)[], category: string) => {
    for (const item of items) {
      if ('slug' in item) {
        articles.push({
          slug: item.slug,
          title: item.title,
          ...(item.shortTitle !== undefined && { shortTitle: item.shortTitle }),
          ...(item.description !== undefined && { description: item.description }),
          category,
          ...(item.tags !== undefined && { tags: item.tags }),
        });
      } else if ('items' in item && item.items) {
        traverse(item.items, item.title);
      }
    }
  };

  for (const group of groups) {
    traverse(group.items, group.title);
  }

  return articles;
};

const docArticles = buildDocArticles(docsManifest);

interface SearchDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

export function SearchDialog({ isOpen, onClose }: SearchDialogProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [resultCount, setResultCount] = useState(0);
  const [searchEngine, setSearchEngine] = useState<'pagefind' | 'fuse' | null>(null);
  
  const inputRef = useRef<HTMLInputElement>(null);
  const resultsRef = useRef<HTMLDivElement>(null);
  const fuseRef = useRef<Fuse<DocArticle> | null>(null);

  const initializeFuse = useCallback(async () => {
    if (fuseRef.current) return fuseRef.current;

    try {
      const Fuse = (await import('fuse.js')).default;
      fuseRef.current = new Fuse(docArticles, {
        keys: [
          { name: 'title', weight: 0.4 },
          { name: 'shortTitle', weight: 0.3 },
          { name: 'description', weight: 0.2 },
          { name: 'tags', weight: 0.1 }
        ],
        threshold: 0.3,
        includeScore: true,
        includeMatches: true,
      });
      return fuseRef.current;
    } catch (error) {
      console.error('Failed to initialize Fuse.js:', error);
      return null;
    }
  }, []);

  const searchWithPagefind = useCallback(async (searchQuery: string) => {
    if (!window.pagefind || !searchQuery.trim()) return [];

    try {
      const search = await window.pagefind.search(searchQuery);
      const searchResults: SearchResult[] = [];

      for (const result of search.results.slice(0, 10)) {
        try {
          const data = await result.data();
          searchResults.push({
            title: data.meta.title,
            excerpt: data.excerpt,
            url: data.url,
          });
        } catch (error) {
          console.warn('Failed to fetch result data:', error);
        }
      }

      return searchResults;
    } catch (error) {
      console.error('Pagefind search failed:', error);
      return [];
    }
  }, []);

  const searchWithFuse = useCallback(async (searchQuery: string) => {
    if (!searchQuery.trim()) return [];

    const fuse = await initializeFuse();
    if (!fuse) return [];

    const fuseResults = fuse.search(searchQuery).slice(0, 10);
    return fuseResults.map(result => ({
      title: result.item.title,
      excerpt: result.item.description || '',
      url: result.item.slug,
      category: result.item.category,
    }));
  }, [initializeFuse]);

  const performSearch = useCallback(async (searchQuery: string) => {
    if (!searchQuery.trim()) {
      setResults([]);
      setResultCount(0);
      setActiveIndex(-1);
      return;
    }

    setIsLoading(true);
    let searchResults: SearchResult[] = [];

    try {
      if (!window.pagefind && !searchEngine) {
        try {
          // @ts-ignore - Pagefind is loaded dynamically
          await import(/* webpackIgnore: true */ '/pagefind/pagefind.js');
          setSearchEngine('pagefind');
        } catch {
          setSearchEngine('fuse');
        }
      }

      if (window.pagefind || searchEngine === 'pagefind') {
        searchResults = await searchWithPagefind(searchQuery);
        if (searchResults.length === 0) {
          searchResults = await searchWithFuse(searchQuery);
        }
      } else {
        searchResults = await searchWithFuse(searchQuery);
      }
    } catch (error) {
      console.error('Search failed:', error);
      searchResults = await searchWithFuse(searchQuery);
    }

    setResults(searchResults);
    setResultCount(searchResults.length);
    setActiveIndex(searchResults.length > 0 ? 0 : -1);
    setIsLoading(false);
  }, [searchEngine, searchWithPagefind, searchWithFuse]);

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      performSearch(query);
    }, 200);

    return () => clearTimeout(timeoutId);
  }, [query, performSearch]);

  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setActiveIndex(prev => 
          prev < results.length - 1 ? prev + 1 : prev
        );
        break;
      case 'ArrowUp':
        e.preventDefault();
        setActiveIndex(prev => prev > 0 ? prev - 1 : prev);
        break;
      case 'Enter':
        if (activeIndex >= 0 && results[activeIndex]) {
          e.preventDefault();
          window.location.href = results[activeIndex].url;
        }
        break;
      case 'Escape':
        onClose();
        break;
    }
  }, [activeIndex, results, onClose]);

  useEffect(() => {
    if (activeIndex >= 0 && resultsRef.current) {
      const activeElement = resultsRef.current.children[activeIndex] as HTMLElement;
      if (activeElement) {
        activeElement.scrollIntoView({
          block: 'nearest',
        });
      }
    }
  }, [activeIndex]);

  if (!isOpen) return null;

  const dialogContent = (
    <div
      className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-start justify-center pt-20"
      onClick={onClose}
    >
      <div
        className="glass w-full max-w-2xl mx-4 rounded-xl p-6 shadow-xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="search-title"
        aria-describedby="search-description"
      >
        <div className="mb-4">
          <div className="relative">
            <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 w-5 h-5 text-muted-foreground" />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Search documentation..."
              className="w-full px-4 py-3 pl-12 pr-20 bg-background border border-border rounded-lg text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary transition-all duration-200"
              role="searchbox"
              aria-label="Search documentation"
              aria-describedby="search-results-status"
            />
            <div className="absolute right-3 top-1/2 transform -translate-y-1/2 flex items-center gap-2 text-xs text-muted-foreground">
              <kbd className="px-2 py-1 bg-muted rounded flex items-center">
                <Command className="w-3 h-3 mr-1" />K
              </kbd>
              <button
                onClick={onClose}
                className="p-1 hover:bg-muted rounded transition-colors duration-200"
                aria-label="Close search"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        <div className="max-h-96 overflow-y-auto rounded-lg">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-5 h-5 animate-spin text-primary" />
              <span className="ml-3 text-sm text-muted-foreground">Searching...</span>
            </div>
          ) : results.length > 0 ? (
            <>
              <div
                id="search-results-status"
                className="sr-only"
                aria-live="polite"
                aria-atomic="true"
              >
                {resultCount} result{resultCount !== 1 ? 's' : ''} found
              </div>
              <div
                ref={resultsRef}
                role="listbox"
                aria-label="Search results"
                className="space-y-1"
              >
                {results.map((result, index) => (
                  <a
                    key={result.url}
                    href={result.url}
                    className={`block px-4 py-3 rounded-lg hover:bg-muted/50 dark:hover:bg-muted/30 transition-all duration-200 ${
                      index === activeIndex ? 'bg-primary/10 dark:bg-primary/20' : ''
                    }`}
                    role="option"
                    aria-selected={index === activeIndex}
                    id={`search-result-${index}`}
                  >
                    <div className="flex items-start gap-3">
                      <File className="w-4 h-4 text-primary mt-1 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <h3 className="text-foreground font-medium truncate mb-1">
                          {result.title}
                        </h3>
                        <p className="text-muted-foreground text-sm line-clamp-2 leading-relaxed">
                          {result.excerpt}
                        </p>
                        {result.category && (
                          <span className="inline-block text-xs text-primary bg-primary/10 px-2 py-1 rounded-full mt-2">
                            {result.category}
                          </span>
                        )}
                      </div>
                    </div>
                  </a>
                ))}
              </div>
            </>
          ) : query ? (
            <div className="text-center py-12">
              <p className="text-muted-foreground">
                No results found for "{query}"
              </p>
              <p className="text-muted-foreground/80 text-sm mt-2">
                Try different keywords or check spelling
              </p>
            </div>
          ) : (
            <div className="py-6">
              <p className="text-muted-foreground mb-4 font-medium">
                Popular searches:
              </p>
              <div className="flex flex-wrap gap-2">
                {['text improvement', 'implementation plans', 'file discovery', 'terminal sessions', 'voice transcription'].map((term) => (
                  <button
                    key={term}
                    onClick={() => setQuery(term)}
                    className="px-3 py-1.5 text-xs bg-primary/10 hover:bg-primary/20 text-primary rounded-full transition-all duration-200 hover:scale-105"
                  >
                    {term}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="mt-4 pt-4 border-t border-border">
          <p className="text-xs text-muted-foreground text-center flex items-center justify-center gap-2">
            <span>Use</span>
            <kbd className="px-2 py-1 bg-muted rounded text-xs font-mono">↑↓</kbd>
            <span>to navigate,</span>
            <kbd className="px-2 py-1 bg-muted rounded text-xs font-mono">Enter</kbd>
            <span>to select,</span>
            <kbd className="px-2 py-1 bg-muted rounded text-xs font-mono">Esc</kbd>
            <span>to close</span>
          </p>
        </div>
      </div>
    </div>
  );

  return typeof document !== 'undefined' 
    ? createPortal(dialogContent, document.body)
    : null;
}