'use client';

import { getSidebarData } from '@/lib/docs-nav';
import type { DocItem, DocGroup } from '@/docs/docs-manifest';
import { SidebarNavClient } from './SidebarNavClient';
import { Link } from '@/i18n/navigation';
import SearchButton from './SearchButton';
import { cn } from '@/lib/utils';
import { useTranslations } from 'next-intl';

interface SidebarNavServerProps {
  currentPath: string;
}

type SidebarItem = DocItem | DocGroup;

function SidebarSection({ item, currentPath, level = 0, td }: { item: SidebarItem; currentPath: string; level?: number; td: any }) {
  const isDocItem = 'slug' in item;
  const isActive = isDocItem && currentPath === (item as DocItem).slug;
  const hasChildren = 'items' in item && item.items && item.items.length > 0;
  
  return (
    <li className={`${level === 0 ? 'mb-4' : ''}`}>
      {level === 0 && hasChildren ? (
        <div>
          <h3 className="mt-6 mb-2 pr-4 text-[0.65rem] font-semibold uppercase tracking-wider text-muted-foreground/70">
            {'id' in item ? td(`sections.${(item as DocGroup).id}.title`) : ''}
          </h3>
          <ul className="space-y-0.5">
            {'items' in item && item.items?.map((child) => (
              <SidebarSection
                key={'slug' in child ? child.slug : child.id}
                item={child}
                currentPath={currentPath}
                level={level + 1}
                td={td}
              />
            ))}
          </ul>
        </div>
      ) : hasChildren ? (
        <details className="group" open={true}>
          <summary 
            className={cn(
              "py-1.5 pl-4 pr-3 text-sm cursor-pointer flex items-center justify-between border-l-2 transition-all duration-200",
              isActive
                ? "text-foreground font-medium border-primary bg-primary/5 dark:bg-primary/10"
                : "text-muted-foreground hover:text-foreground border-transparent hover:border-muted-foreground/30 hover:bg-muted/20"
            )}
          >
            <span>{isDocItem ? td(`items.${(item as DocItem).slug.replace('/docs/', '')}.title`) : (item as DocGroup).title}</span>
            <svg 
              className="w-4 h-4 transition-transform duration-200 group-open:rotate-90 text-muted-foreground" 
              fill="none" 
              viewBox="0 0 24 24" 
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </summary>
          <ul className="mt-1 ml-4 pl-3 border-l border-border/30 space-y-0.5">
            {'items' in item && item.items?.map((child) => (
              <SidebarSection
                key={'slug' in child ? child.slug : child.id}
                item={child}
                currentPath={currentPath}
                level={level + 1}
                td={td}
              />
            ))}
          </ul>
        </details>
      ) : (
        <Link 
          href={'slug' in item ? item.slug : '#'}
          className={cn(
            "block py-1.5 pl-4 pr-3 text-sm border-l-2 transition-all duration-200",
            isActive
              ? "text-foreground font-medium border-primary bg-primary/5 dark:bg-primary/10"
              : "text-muted-foreground hover:text-foreground border-transparent hover:border-muted-foreground/30 hover:bg-muted/20"
          )}
          aria-current={isActive ? 'page' : undefined}
        >
          {isDocItem ? td(`items.${(item as DocItem).slug.replace('/docs/', '')}.title`) : ''}
        </Link>
      )}
    </li>
  );
}

export function SidebarNavServer({ currentPath }: SidebarNavServerProps) {
  const data = getSidebarData();
  const td = useTranslations('docs');

  return (
    <nav className="h-full overflow-y-auto">
      <div className="mb-4 px-4">
        <h2 className="text-lg font-bold text-foreground mb-3">{td('sidebar.title')}</h2>
        <SearchButton type="desktop" />
      </div>
      <ul className="space-y-0 pl-4">
        {data.map((item) => (
          <SidebarSection
            key={item.id}
            item={item}
            currentPath={currentPath}
            td={td}
          />
        ))}
      </ul>
      <SidebarNavClient data={data} currentPath={currentPath} />
    </nav>
  );
}