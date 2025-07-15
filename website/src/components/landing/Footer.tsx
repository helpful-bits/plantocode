'use client';

import { useState, useEffect } from 'react';
import Image from 'next/image';
import { useTheme } from 'next-themes';
import Link from 'next/link';

export function Footer() {
  const [mounted, setMounted] = useState(false);
  const { resolvedTheme } = useTheme();

  useEffect(() => {
    setMounted(true);
  }, []);

  return (
    <footer className="relative overflow-hidden">
      {/* Top gradient border */}
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-emerald-600/50 to-transparent" />
      
      {/* Background image - changes based on theme */}
      <Image
        src={resolvedTheme === 'dark' ? "/images/features-background-dark.png" : "/images/features-background.png"}
        alt="Footer background"
        fill
        quality={100}
        className="object-cover object-bottom z-0 opacity-30"
      />
      
      {/* Gradient overlay with emerald tint */}
      <div className="absolute inset-0 z-1 bg-gradient-to-t from-background via-background/95 to-background/80" />
      
      {/* Emerald gradient accent */}
      <div className="absolute inset-0 z-2 bg-gradient-to-t from-emerald-900/10 via-transparent to-transparent dark:from-emerald-600/5" />
      
      {/* Glass morphism overlay */}
      <div className="absolute inset-0 z-5 bg-gradient-to-t from-background/20 to-transparent backdrop-blur-sm" />
      
      <div className="container mx-auto px-4 relative z-10">
        {/* Main footer content */}
        <div className="py-16 border-b border-emerald-600/10 dark:border-emerald-400/10">
          <div className="grid md:grid-cols-4 gap-8">
            {/* Brand section */}
            <div className="md:col-span-2">
              <h3 className="font-bold text-2xl mb-4 bg-gradient-to-r from-emerald-600 to-teal-600 bg-clip-text text-transparent">
                Vibe Manager
              </h3>
              <p className="text-gray-700 dark:text-gray-300 mb-6 max-w-md leading-relaxed font-medium">
                AI-powered context curation for large codebases. Find relevant files instantly and create implementation plans that combine internet knowledge with your architecture.
              </p>
              <div className="flex gap-4">
                <a 
                  href="https://github.com/vibemanager" 
                  className="w-10 h-10 rounded-lg bg-gradient-to-br from-emerald-600/10 to-teal-600/10 backdrop-blur-sm ring-1 ring-emerald-600/20 dark:ring-emerald-400/20 flex items-center justify-center hover:from-emerald-600/20 hover:to-teal-600/20 hover:ring-emerald-600/40 dark:hover:ring-emerald-400/40 transition-all duration-300 group"
                  aria-label="GitHub"
                >
                  <svg className="w-5 h-5 text-emerald-700 dark:text-emerald-400 group-hover:text-emerald-600 dark:group-hover:text-emerald-300 transition-colors" fill="currentColor" viewBox="0 0 24 24">
                    <path fillRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" clipRule="evenodd" />
                  </svg>
                </a>
                <a 
                  href="https://twitter.com/vibemanager" 
                  className="w-10 h-10 rounded-lg bg-gradient-to-br from-emerald-600/10 to-teal-600/10 backdrop-blur-sm ring-1 ring-emerald-600/20 dark:ring-emerald-400/20 flex items-center justify-center hover:from-emerald-600/20 hover:to-teal-600/20 hover:ring-emerald-600/40 dark:hover:ring-emerald-400/40 transition-all duration-300 group"
                  aria-label="Twitter"
                >
                  <svg className="w-5 h-5 text-emerald-700 dark:text-emerald-400 group-hover:text-emerald-600 dark:group-hover:text-emerald-300 transition-colors" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M8.29 20.251c7.547 0 11.675-6.253 11.675-11.675 0-.178 0-.355-.012-.53A8.348 8.348 0 0022 5.92a8.19 8.19 0 01-2.357.646 4.118 4.118 0 001.804-2.27 8.224 8.224 0 01-2.605.996 4.107 4.107 0 00-6.993 3.743 11.65 11.65 0 01-8.457-4.287 4.106 4.106 0 001.27 5.477A4.072 4.072 0 012.8 9.713v.052a4.105 4.105 0 003.292 4.022 4.095 4.095 0 01-1.853.07 4.108 4.108 0 003.834 2.85A8.233 8.233 0 012 18.407a11.616 11.616 0 006.29 1.84" />
                  </svg>
                </a>
              </div>
            </div>

            {/* Quick Links */}
            <div>
              <h4 className="font-semibold mb-4 text-gray-900 dark:text-white relative">
                Product
                <span className="absolute -bottom-1 left-0 w-8 h-0.5 bg-gradient-to-r from-emerald-600 to-teal-600"></span>
              </h4>
              <ul className="space-y-2">
                <li><Link href="#features" className="text-gray-700 dark:text-gray-300 hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors inline-block py-1 font-medium">Features</Link></li>
                <li><Link href="#how-it-works" className="text-gray-700 dark:text-gray-300 hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors inline-block py-1 font-medium">How It Works</Link></li>
                <li><Link href="#pricing" className="text-gray-700 dark:text-gray-300 hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors inline-block py-1 font-medium">Pricing</Link></li>
                <li><Link href="/download" className="text-gray-700 dark:text-gray-300 hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors inline-block py-1 font-medium">Download</Link></li>
              </ul>
            </div>

            {/* Resources */}
            <div>
              <h4 className="font-semibold mb-4 text-gray-900 dark:text-white relative">
                Resources
                <span className="absolute -bottom-1 left-0 w-8 h-0.5 bg-gradient-to-r from-emerald-600 to-teal-600"></span>
              </h4>
              <ul className="space-y-2">
                <li><Link href="/docs" className="text-gray-700 dark:text-gray-300 hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors inline-block py-1 font-medium">Documentation</Link></li>
                <li><Link href="/api" className="text-gray-700 dark:text-gray-300 hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors inline-block py-1 font-medium">API Reference</Link></li>
                <li><Link href="/changelog" className="text-gray-700 dark:text-gray-300 hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors inline-block py-1 font-medium">Changelog</Link></li>
                <li><Link href="/support" className="text-gray-700 dark:text-gray-300 hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors inline-block py-1 font-medium">Support</Link></li>
              </ul>
            </div>
          </div>
        </div>

        {/* Bottom bar */}
        <div className="py-8">
          <div className="flex flex-col md:flex-row justify-between items-center gap-4">
            <p className="text-gray-700 dark:text-gray-300 text-sm font-medium">
              © 2024 Vibe Manager. All rights reserved.
            </p>
            <div className="flex gap-6">
              <Link href="/privacy" className="text-gray-700 dark:text-gray-300 hover:text-emerald-600 dark:hover:text-emerald-400 text-sm transition-colors relative group font-medium">
                Privacy Policy
                <span className="absolute bottom-0 left-0 w-0 h-px bg-gradient-to-r from-emerald-600 to-teal-600 group-hover:w-full transition-all duration-300"></span>
              </Link>
              <Link href="/terms" className="text-gray-700 dark:text-gray-300 hover:text-emerald-600 dark:hover:text-emerald-400 text-sm transition-colors relative group font-medium">
                Terms of Service
                <span className="absolute bottom-0 left-0 w-0 h-px bg-gradient-to-r from-emerald-600 to-teal-600 group-hover:w-full transition-all duration-300"></span>
              </Link>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}