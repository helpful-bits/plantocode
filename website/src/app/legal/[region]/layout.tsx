'use client';

import Link from 'next/link';
import { useParams, usePathname, useRouter } from 'next/navigation';
import { ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

export default function RegionalLegalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const params = useParams();
  const pathname = usePathname();
  const router = useRouter();
  const region = params.region as string;
  
  const handleRegionChange = (newRegion: string) => {
    // Get the current page (terms, privacy, etc.)
    const pathParts = pathname.split('/');
    const currentPage = pathParts[pathParts.length - 1];
    
    // Navigate to same page in different region
    router.push(`/legal/${newRegion}/${currentPage}`);
  };
  
  return (
    <>
      <header className="border-b border-border/40">
        <div className="container mx-auto max-w-3xl px-6 py-4">
          <div className="flex justify-between items-center">
            <Link
              href="/"
              className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
              Back to PlanToCode
            </Link>
            
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="min-w-[160px] justify-between">
                  {region === 'eu' ? '🇪🇺 EU/UK' : '🇺🇸 United States'}
                  <ChevronDown className="ml-2 h-4 w-4 opacity-50" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-[160px]">
                <DropdownMenuRadioGroup value={region} onValueChange={handleRegionChange}>
                  <DropdownMenuRadioItem value="eu" className="cursor-pointer">
                    <span className="flex items-center">🇪🇺 EU/UK</span>
                  </DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="us" className="cursor-pointer">
                    <span className="flex items-center whitespace-nowrap">🇺🇸 United States</span>
                  </DropdownMenuRadioItem>
                </DropdownMenuRadioGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </header>
      
      {/* Legal documents navigation - styled like desktop app navbar */}
      <nav className="bg-background/95 backdrop-blur-sm border-b border-border/60 shadow-soft sticky top-0 z-40">
        <div className="container mx-auto max-w-3xl px-6 flex items-center">
          <div className="flex">
            <Link 
              href={`/legal/${region}/terms`}
              className={`
                flex items-center px-4 py-3 text-sm font-medium transition-all duration-200 relative cursor-pointer
                focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/70 rounded-t-md
                ${pathname.includes('/terms')
                  ? "text-primary border-b-2 border-primary bg-teal-500/20" 
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                }
              `}
            >
              Terms of Service
            </Link>
            <Link 
              href={`/legal/${region}/privacy`}
              className={`
                flex items-center px-4 py-3 text-sm font-medium transition-all duration-200 relative cursor-pointer
                focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/70 rounded-t-md
                ${pathname.includes('/privacy')
                  ? "text-primary border-b-2 border-primary bg-teal-500/20" 
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                }
              `}
            >
              Privacy Policy
            </Link>
            <Link 
              href={`/legal/${region}/subprocessors`}
              className={`
                flex items-center px-4 py-3 text-sm font-medium transition-all duration-200 relative cursor-pointer
                focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/70 rounded-t-md
                ${pathname.includes('/subprocessors')
                  ? "text-primary border-b-2 border-primary bg-teal-500/20" 
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                }
              `}
            >
              Sub-processors
            </Link>
            {region === 'eu' && (
              <>
                <Link 
                  href={`/legal/${region}/imprint`}
                  className={`
                    flex items-center px-4 py-3 text-sm font-medium transition-all duration-200 relative cursor-pointer
                    focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/70 rounded-t-md
                    ${pathname.includes('/imprint')
                      ? "text-primary border-b-2 border-primary bg-teal-500/20" 
                      : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                    }
                  `}
                >
                  Imprint
                </Link>
                <Link 
                  href={`/legal/${region}/withdrawal-policy`}
                  className={`
                    flex items-center px-4 py-3 text-sm font-medium transition-all duration-200 relative cursor-pointer
                    focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/70 rounded-t-md
                    ${pathname.includes('/withdrawal-policy')
                      ? "text-primary border-b-2 border-primary bg-teal-500/20" 
                      : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                    }
                  `}
                >
                  Withdrawal Policy
                </Link>
              </>
            )}
          </div>
        </div>
      </nav>
      
      <main className="container mx-auto max-w-3xl px-6 py-12 sm:py-16">
        {children}
      </main>
    </>
  );
}