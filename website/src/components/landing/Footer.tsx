'use client';

import Link from 'next/link';

export function Footer() {
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
                  Vibe Manager
                </h3>
              </Link>
              <p className="text-muted-foreground mb-6 max-w-md text-sm leading-relaxed">
                The AI coding assistant that acts as a middle-manager for your LLMs. We curate the perfect context from your codebase and the web, so your agents can build correctly the first time.
              </p>

              {/* Social Links */}
              <div className="flex items-center gap-3">
                <a
                  aria-label="X"
                  className="group relative w-10 h-10 rounded-lg glass border border-primary/20 flex items-center justify-center hover:border-primary/40"
                  href="https://x.com/vibemanagerapp"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <div className="absolute inset-0 rounded-lg bg-gradient-to-br from-primary/0 to-primary/20 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                  <svg className="w-5 h-5 text-muted-foreground group-hover:text-primary transition-colors relative z-10" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                  </svg>
                </a>
              </div>
            </div>

            {/* Links Grid */}
            <div className="md:col-span-7 lg:col-span-6 grid grid-cols-2 sm:grid-cols-4 gap-8">
              {/* Product */}
              <div>
                <h4 className="font-semibold text-foreground mb-4 text-sm uppercase tracking-wide">
                  Product
                </h4>
                <ul className="space-y-3">
                  <li>
                    <Link className="text-muted-foreground hover:text-primary text-sm transition-colors duration-200 clickable-text-underline" href="#features">
                      Features
                    </Link>
                  </li>
                  <li>
                    <Link className="text-muted-foreground hover:text-primary text-sm transition-colors duration-200 clickable-text-underline" href="#how-it-works">
                      How It Works
                    </Link>
                  </li>
                  <li>
                    <Link className="text-muted-foreground hover:text-primary text-sm transition-colors duration-200 clickable-text-underline" href="#pricing">
                      Pricing
                    </Link>
                  </li>
                  <li>
                    <Link className="text-muted-foreground hover:text-primary text-sm transition-colors duration-200 clickable-text-underline" href="/download">
                      Download for Mac
                    </Link>
                  </li>
                </ul>
              </div>

              {/* Resources */}
              <div>
                <h4 className="font-semibold text-foreground mb-4 text-sm uppercase tracking-wide">
                  Resources
                </h4>
                <ul className="space-y-3">
                  <li>
                    <Link className="text-muted-foreground hover:text-primary text-sm transition-colors duration-200 clickable-text-underline" href="/changelog">
                      Changelog
                    </Link>
                  </li>
                  <li>
                    <a 
                      className="text-muted-foreground hover:text-primary text-sm transition-colors duration-200 clickable-text-underline" 
                      href="https://vibemanager.featurebase.app"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Support
                    </a>
                  </li>
                </ul>
              </div>

              {/* Legal */}
              <div>
                <h4 className="font-semibold text-foreground mb-4 text-sm uppercase tracking-wide">
                  Legal
                </h4>
                <ul className="space-y-3">
                  <li>
                    <Link className="text-muted-foreground hover:text-primary text-sm transition-colors duration-200 clickable-text-underline" href="/legal">
                      Legal Docs
                    </Link>
                  </li>
                </ul>
              </div>

              {/* Company */}
              <div>
                <h4 className="font-semibold text-foreground mb-4 text-sm uppercase tracking-wide">
                  Company
                </h4>
                <ul className="space-y-3">
                  <li>
                    <Link className="text-muted-foreground hover:text-primary text-sm transition-colors duration-200 clickable-text-underline" href="/about">
                      About
                    </Link>
                  </li>
                  <li>
                    <Link className="text-muted-foreground hover:text-primary text-sm transition-colors duration-200 clickable-text-underline" href="/contact">
                      Contact
                    </Link>
                  </li>
                </ul>
              </div>
            </div>
          </div>

          {/* Bottom bar */}
          <div className="py-6 border-t border-primary/10">
            <div className="flex justify-center">
              <p className="text-muted-foreground text-xs">
                © 2025 helpful bits GmbH
              </p>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}