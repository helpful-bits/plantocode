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
                AI-powered context curation for large codebases. Find relevant files instantly and create implementation plans that combine internet knowledge with your architecture.
              </p>

              {/* Social Links */}
              <div className="flex items-center gap-3">
                <a
                  aria-label="GitHub"
                  className="group relative w-10 h-10 rounded-lg glass border border-primary/20 flex items-center justify-center hover:border-primary/40 transition-all duration-300"
                  href="https://github.com/vibemanager"
                >
                  <div className="absolute inset-0 rounded-lg bg-gradient-to-br from-primary/0 to-primary/20 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                  <svg className="w-5 h-5 text-muted-foreground group-hover:text-primary transition-colors relative z-10" fill="currentColor" viewBox="0 0 24 24">
                    <path clipRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" fillRule="evenodd" />
                  </svg>
                </a>
                <a
                  aria-label="Twitter"
                  className="group relative w-10 h-10 rounded-lg glass border border-primary/20 flex items-center justify-center hover:border-primary/40 transition-all duration-300"
                  href="https://twitter.com/vibemanager"
                >
                  <div className="absolute inset-0 rounded-lg bg-gradient-to-br from-primary/0 to-primary/20 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                  <svg className="w-5 h-5 text-muted-foreground group-hover:text-primary transition-colors relative z-10" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M8.29 20.251c7.547 0 11.675-6.253 11.675-11.675 0-.178 0-.355-.012-.53A8.348 8.348 0 0022 5.92a8.19 8.19 0 01-2.357.646 4.118 4.118 0 001.804-2.27 8.224 8.224 0 01-2.605.996 4.107 4.107 0 00-6.993 3.743 11.65 11.65 0 01-8.457-4.287 4.106 4.106 0 001.27 5.477A4.072 4.072 0 012.8 9.713v.052a4.105 4.105 0 003.292 4.022 4.095 4.095 0 01-1.853.07 4.108 4.108 0 003.834 2.85A8.233 8.233 0 012 18.407a11.616 11.616 0 006.29 1.84" />
                  </svg>
                </a>
              </div>
            </div>

            {/* Links Grid */}
            <div className="md:col-span-7 lg:col-span-6 grid grid-cols-2 sm:grid-cols-3 gap-8">
              {/* Product */}
              <div>
                <h4 className="font-semibold text-foreground mb-4 text-sm uppercase tracking-wide">
                  Product
                </h4>
                <ul className="space-y-3">
                  <li>
                    <Link className="text-muted-foreground hover:text-primary text-sm transition-colors duration-200 relative group inline-flex items-center" href="#features">
                      <span className="relative">
                        Features
                        <span className="clickable-text-underline" />
                      </span>
                    </Link>
                  </li>
                  <li>
                    <Link className="text-muted-foreground hover:text-primary text-sm transition-colors duration-200 relative group inline-flex items-center" href="#how-it-works">
                      <span className="relative">
                        How It Works
                        <span className="clickable-text-underline" />
                      </span>
                    </Link>
                  </li>
                  <li>
                    <Link className="text-muted-foreground hover:text-primary text-sm transition-colors duration-200 relative group inline-flex items-center" href="#pricing">
                      <span className="relative">
                        Pricing
                        <span className="clickable-text-underline" />
                      </span>
                    </Link>
                  </li>
                  <li>
                    <Link className="text-muted-foreground hover:text-primary text-sm transition-colors duration-200 relative group inline-flex items-center" href="/download">
                      <span className="relative">
                        Download
                        <span className="clickable-text-underline" />
                      </span>
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
                    <Link className="text-muted-foreground hover:text-primary text-sm transition-colors duration-200 relative group inline-flex items-center" href="/docs">
                      <span className="relative">
                        Documentation
                        <span className="absolute -bottom-0.5 left-0 w-0 h-px bg-primary group-hover:w-full transition-all duration-300" />
                      </span>
                    </Link>
                  </li>
                  <li>
                    <Link className="text-muted-foreground hover:text-primary text-sm transition-colors duration-200 relative group inline-flex items-center" href="/api">
                      <span className="relative">
                        API Reference
                        <span className="absolute -bottom-0.5 left-0 w-0 h-px bg-primary group-hover:w-full transition-all duration-300" />
                      </span>
                    </Link>
                  </li>
                  <li>
                    <Link className="text-muted-foreground hover:text-primary text-sm transition-colors duration-200 relative group inline-flex items-center" href="/changelog">
                      <span className="relative">
                        Changelog
                        <span className="absolute -bottom-0.5 left-0 w-0 h-px bg-primary group-hover:w-full transition-all duration-300" />
                      </span>
                    </Link>
                  </li>
                  <li>
                    <Link className="text-muted-foreground hover:text-primary text-sm transition-colors duration-200 relative group inline-flex items-center" href="/support">
                      <span className="relative">
                        Support
                        <span className="absolute -bottom-0.5 left-0 w-0 h-px bg-primary group-hover:w-full transition-all duration-300" />
                      </span>
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
                    <Link className="text-muted-foreground hover:text-primary text-sm transition-colors duration-200 relative group inline-flex items-center" href="/about">
                      <span className="relative">
                        About
                        <span className="absolute -bottom-0.5 left-0 w-0 h-px bg-primary group-hover:w-full transition-all duration-300" />
                      </span>
                    </Link>
                  </li>
                  <li>
                    <Link className="text-muted-foreground hover:text-primary text-sm transition-colors duration-200 relative group inline-flex items-center" href="/blog">
                      <span className="relative">
                        Blog
                        <span className="absolute -bottom-0.5 left-0 w-0 h-px bg-primary group-hover:w-full transition-all duration-300" />
                      </span>
                    </Link>
                  </li>
                  <li>
                    <Link className="text-muted-foreground hover:text-primary text-sm transition-colors duration-200 relative group inline-flex items-center" href="/careers">
                      <span className="relative">
                        Careers
                        <span className="absolute -bottom-0.5 left-0 w-0 h-px bg-primary group-hover:w-full transition-all duration-300" />
                      </span>
                    </Link>
                  </li>
                  <li>
                    <Link className="text-muted-foreground hover:text-primary text-sm transition-colors duration-200 relative group inline-flex items-center" href="/contact">
                      <span className="relative">
                        Contact
                        <span className="absolute -bottom-0.5 left-0 w-0 h-px bg-primary group-hover:w-full transition-all duration-300" />
                      </span>
                    </Link>
                  </li>
                </ul>
              </div>
            </div>
          </div>

          {/* Bottom bar */}
          <div className="py-6 border-t border-primary/10">
            <div className="flex flex-col sm:flex-row justify-between items-center gap-4">
              <p className="text-muted-foreground text-xs">
                © 2024 Vibe Manager. All rights reserved.
              </p>
              <div className="flex items-center gap-6">
                <Link className="text-muted-foreground hover:text-primary text-xs transition-colors duration-200 relative group" href="/privacy">
                  <span className="relative">
                    Privacy Policy
                    <span className="absolute -bottom-0.5 left-0 w-0 h-px bg-primary group-hover:w-full transition-all duration-300" />
                  </span>
                </Link>
                <Link className="text-muted-foreground hover:text-primary text-xs transition-colors duration-200 relative group" href="/terms">
                  <span className="relative">
                    Terms of Service
                    <span className="absolute -bottom-0.5 left-0 w-0 h-px bg-primary group-hover:w-full transition-all duration-300" />
                  </span>
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}