'use client';

import { Link } from '@/i18n/navigation';
import { BRAND_X_URL, FEATUREBASE_BASE_URL, CALENDLY_URL } from '@/lib/brand';
import { trackCTA } from '@/lib/track';
import { useMessages } from '@/components/i18n/useMessages';

export function Footer() {
  const { t } = useMessages();

  return (
    <footer className="relative mt-24">
      {/* Gradient border */}
      <div className="absolute inset-x-0 top-0 h-px">
        <div className="w-full h-full bg-gradient-to-r from-transparent via-primary/50 to-transparent" />
      </div>

      {/* Glass background with subtle effect */}
      <div className="relative glass border-t border-primary/10">
        <div className="container mx-auto px-4">
          {/* Main footer content */}
          <div className="py-16 grid grid-cols-1 md:grid-cols-12 gap-8 lg:gap-12">
            {/* Brand section */}
            <div className="md:col-span-5 lg:col-span-6">
              <Link className="inline-block mb-4" href="/">
                <h3 className="text-2xl font-bold text-primary-emphasis">
                  PlanToCode
                </h3>
              </Link>
              <p className="text-foreground/60 dark:text-foreground/50 mb-6 max-w-md text-sm leading-relaxed">
                {t('footer.tagline')}
              </p>

              {/* Social Links */}
              <div className="flex items-center gap-3">
                <a
                  aria-label="X"
                  className="group relative w-10 h-10 rounded-lg glass border border-primary/20 flex items-center justify-center hover:border-primary/40"
                  href={BRAND_X_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <div className="absolute inset-0 rounded-lg bg-gradient-to-br from-primary/0 to-primary/20 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                  <svg className="w-5 h-5 text-foreground/70 dark:text-foreground/85 group-hover:text-primary transition-colors relative z-10" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                  </svg>
                </a>
              </div>
            </div>

            {/* Links Grid - Streamlined to 3 columns */}
            <div className="md:col-span-7 lg:col-span-6 grid grid-cols-1 sm:grid-cols-3 gap-8">
              {/* Product */}
              <div>
                <h4 className="font-semibold text-foreground mb-4 text-sm uppercase tracking-wide">
                  {t('footer.product', 'Product')}
                </h4>
                <ul className="space-y-3">
                  <li>
                    <Link
                      className="text-foreground/80 dark:text-foreground/90 hover:text-primary text-sm font-medium transition-colors duration-200 clickable-text-underline"
                      href="/demo"
                      onClick={() => trackCTA('footer', 'Interactive Demo', '/demo')}
                    >
                      {t('footer.interactiveDemo')}
                    </Link>
                  </li>
                  <li>
                    <Link className="text-foreground/80 dark:text-foreground/90 hover:text-primary text-sm font-medium transition-colors duration-200 clickable-text-underline" href="/how-it-works">
                      {t('footer.howItWorks')}
                    </Link>
                  </li>
                  <li>
                    <Link className="text-foreground/80 dark:text-foreground/90 hover:text-primary text-sm font-medium transition-colors duration-200 clickable-text-underline" href="#pricing">
                      {t('footer.pricing')}
                    </Link>
                  </li>
                  <li>
                    <Link
                      className="text-foreground/80 dark:text-foreground/90 hover:text-primary text-sm font-medium transition-colors duration-200 clickable-text-underline"
                      href="/downloads"
                      onClick={() => trackCTA('footer', 'Downloads', '/downloads')}
                    >
                      {t('footer.downloads')}
                    </Link>
                  </li>
                  <li>
                    <Link className="text-foreground/80 dark:text-foreground/90 hover:text-primary text-sm font-medium transition-colors duration-200 clickable-text-underline" href="/changelog">
                      {t('footer.changelog')}
                    </Link>
                  </li>
                </ul>
              </div>

              {/* Resources */}
              <div>
                <h4 className="font-semibold text-foreground mb-4 text-sm uppercase tracking-wide">
                  {t('footer.resources', 'Resources')}
                </h4>
                <ul className="space-y-3">
                  <li>
                    <Link className="text-foreground/80 dark:text-foreground/90 hover:text-primary text-sm font-medium transition-colors duration-200 clickable-text-underline" href="/docs">
                      {t('footer.documentation')}
                    </Link>
                  </li>
                  <li>
                    <Link className="text-foreground/80 dark:text-foreground/90 hover:text-primary text-sm font-medium transition-colors duration-200 clickable-text-underline" href="/support">
                      {t('footer.support')}
                    </Link>
                  </li>
                  <li>
                    <Link className="text-foreground/80 dark:text-foreground/90 hover:text-primary text-sm font-medium transition-colors duration-200 clickable-text-underline" href="/docs/architecture">
                      {t('footer.architecture')}
                    </Link>
                  </li>
                  <li>
                    <a
                      className="text-foreground/80 dark:text-foreground/90 hover:text-primary text-sm font-medium transition-colors duration-200 clickable-text-underline"
                      href={FEATUREBASE_BASE_URL}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {t('footer.feedback')}
                    </a>
                  </li>
                </ul>
              </div>

              {/* Company */}
              <div>
                <h4 className="font-semibold text-foreground mb-4 text-sm uppercase tracking-wide">
                  {t('footer.company', 'Company')}
                </h4>
                <ul className="space-y-3">
                  <li>
                    <a className="text-foreground/80 dark:text-foreground/90 hover:text-primary text-sm font-medium transition-colors duration-200 clickable-text-underline" href={CALENDLY_URL} target="_blank" rel="noopener noreferrer">
                      {t('footer.talkToArchitect')}
                    </a>
                  </li>
                  <li>
                    <Link className="text-foreground/80 dark:text-foreground/90 hover:text-primary text-sm font-medium transition-colors duration-200 clickable-text-underline" href="/about">
                      {t('footer.about')}
                    </Link>
                  </li>
                  <li>
                    <Link className="text-foreground/80 dark:text-foreground/90 hover:text-primary text-sm font-medium transition-colors duration-200 clickable-text-underline" href="/privacy">
                      {t('footer.privacy')}
                    </Link>
                  </li>
                  <li>
                    <Link className="text-foreground/80 dark:text-foreground/90 hover:text-primary text-sm font-medium transition-colors duration-200 clickable-text-underline" href="/terms">
                      {t('footer.terms')}
                    </Link>
                  </li>
                  <li>
                    <Link className="text-foreground/80 dark:text-foreground/90 hover:text-primary text-sm font-medium transition-colors duration-200 clickable-text-underline" href="/legal/eu/imprint">
                      {t('footer.imprint')}
                    </Link>
                  </li>
                  <li>
                    <Link className="text-foreground/80 dark:text-foreground/90 hover:text-primary text-sm font-medium transition-colors duration-200 clickable-text-underline" href="/legal">
                      {t('footer.legal')}
                    </Link>
                  </li>
                </ul>
              </div>
            </div>
          </div>

          {/* Bottom bar */}
          <div className="py-6 border-t border-primary/10">
            <div className="flex flex-col items-center gap-2">
              <div className="flex items-center gap-2 text-muted-foreground text-xs">
                <span>🇩🇪</span>
                <span>{t('footer.madeInGermany')}</span>
              </div>
              <p className="text-muted-foreground text-xs text-center mb-2">
                {t('footer.notAffiliated')}
              </p>
              <p className="text-muted-foreground text-xs">
                {t('footer.copyright').replace('{year}', new Date().getFullYear().toString())}
              </p>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}