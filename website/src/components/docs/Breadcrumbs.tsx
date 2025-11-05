import { buildBreadcrumbs } from '@/lib/docs-nav';
import { Link } from '@/i18n/navigation';

interface BreadcrumbsProps {
  currentPath: string;
}

export function Breadcrumbs({ currentPath }: BreadcrumbsProps) {
  const crumbs = buildBreadcrumbs(currentPath);
  
  if (crumbs.length === 0) return null;
  
  return (
    <nav aria-label="Breadcrumb" className="glass rounded-lg px-6 py-2 mb-2 hidden sm:block">
      <ol className="flex items-center space-x-2 text-sm">
        <li>
          <Link 
            href="/docs" 
            className="text-muted-foreground hover:text-primary transition-colors duration-200"
          >
            Docs
          </Link>
        </li>
        {crumbs.map((crumb, index) => (
          <li key={crumb.slug} className="flex items-center space-x-2">
            <span className="text-muted-foreground/50" aria-hidden="true">/</span>
            {index === crumbs.length - 1 ? (
              <span className="text-foreground font-medium" aria-current="page">
                {crumb.title}
              </span>
            ) : crumb.slug ? (
              <Link 
                href={crumb.slug} 
                className="text-muted-foreground hover:text-primary transition-colors duration-200"
              >
                {crumb.title}
              </Link>
            ) : (
              <span className="text-muted-foreground">{crumb.title}</span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}