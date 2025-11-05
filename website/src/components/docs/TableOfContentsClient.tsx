'use client';

import { useState, useEffect, useRef } from 'react';
import { usePathname } from '@/i18n/navigation';

interface TocItem {
  id: string;
  text: string;
  level: number;
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

export function TableOfContentsClient() {
  const [toc, setToc] = useState<TocItem[]>([]);
  const [activeId, setActiveId] = useState<string>('');
  const pathname = usePathname();
  const activeIdRef = useRef<string>('');

  useEffect(() => {
    let ticking = false;
    let headings: { id: string; top: number }[] = [];

    const collect = () => {
      const container = document.getElementById('doc-content');
      const nodes = container ? Array.from(container.querySelectorAll('h2, h3')).filter(
        heading => !heading.closest('pre') && !heading.closest('code')
      ) as HTMLElement[] : [];
      
      headings = nodes
        .filter((el) => el.id)
        .map((el) => ({ id: el.id, top: el.getBoundingClientRect().top + window.scrollY }));

      // Build TOC items
      const tocItems: TocItem[] = [];
      nodes.forEach((heading) => {
        let id = heading.id;
        if (!id) {
          id = slugify(heading.textContent || '');
          let counter = 1;
          while (document.getElementById(id)) {
            id = `${slugify(heading.textContent || '')}-${counter}`;
            counter++;
          }
          heading.id = id;
        }

        const cleanText = (heading.textContent || '')
          .replace(/[\u{1F300}-\u{1F9FF}]/gu, '')
          .replace(/[⚡💡🚀✨🔥💰📈🎯]/g, '')
          .replace(/^\d+\.\s*/, '')
          .replace(/^•\s*/, '')
          .trim();

        if (cleanText) {
          tocItems.push({
            id,
            text: cleanText,
            level: parseInt(heading.tagName.charAt(1)),
          });
        }
      });
      setToc(tocItems);
    };

    const HEADER_OFFSET = 96; // ~6rem for sticky header
    const HYSTERESIS = 12;

    const onScroll = () => {
      if (!ticking) {
        window.requestAnimationFrame(() => {
          const anchorY = window.scrollY + HEADER_OFFSET;
          let current = headings[0]?.id;
          for (let i = 0; i < headings.length; i++) {
            const heading = headings[i];
            if (heading && heading.top <= anchorY + HYSTERESIS) {
              current = heading.id;
            } else {
              break;
            }
          }
          if (current && current !== activeIdRef.current) {
            activeIdRef.current = current;
            setActiveId(current);
          }
          ticking = false;
        });
        ticking = true;
      }
    };

    collect();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', collect);
    const t = setTimeout(collect, 100);

    return () => {
      clearTimeout(t);
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', collect);
    };
  }, [pathname]);

  const handleClick = (id: string) => {
    const element = document.getElementById(id);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'start' });
      window.history.replaceState(null, '', `#${id}`);
      setActiveId(id);
    }
  };

  if (toc.length === 0) {
    return (
      <div className="text-sm text-muted-foreground">
        No headings found
      </div>
    );
  }

  const groupedItems: Array<{ item: TocItem; children: TocItem[] }> = [];
  let currentH2: { item: TocItem; children: TocItem[] } | null = null;
  
  toc.forEach((item) => {
    if (item.level === 2) {
      currentH2 = { item, children: [] };
      groupedItems.push(currentH2);
    } else if (item.level === 3 && currentH2) {
      currentH2.children.push(item);
    }
  });

  return (
    <div className="space-y-0">
      {groupedItems.map((group) => (
        <div key={group.item.id}>
          <a
            href={`#${group.item.id}`}
            onClick={(e) => {
              e.preventDefault();
              handleClick(group.item.id);
            }}
            className={`
              block py-1 pl-3 pr-2 text-sm border-l-2 -ml-[2px] transition-all
              ${activeId === group.item.id
                ? 'text-foreground font-medium border-primary'
                : 'text-muted-foreground hover:text-foreground border-transparent hover:border-muted-foreground/30'
              }
            `}
            aria-current={activeId === group.item.id ? 'true' : undefined}
          >
            {group.item.text}
          </a>
          
          {group.children.length > 0 && (
            <div className="space-y-0">
              {group.children.map((child) => (
                <a
                  key={child.id}
                  href={`#${child.id}`}
                  onClick={(e) => {
                    e.preventDefault();
                    handleClick(child.id);
                  }}
                  className={`
                    block py-1 pl-3 pr-2 ml-4 text-sm border-l-2 -ml-[2px] transition-all
                    ${activeId === child.id
                      ? 'text-foreground font-medium border-primary'
                      : 'text-muted-foreground hover:text-foreground border-transparent hover:border-muted-foreground/30'
                    }
                  `}
                  aria-current={activeId === child.id ? 'true' : undefined}
                >
                  {child.text}
                </a>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}