import { useState, useEffect } from 'react';
import { isApprovedRegion } from '@/lib/territories';

export function useUserRegion() {
  const [region, setRegion] = useState<'eu' | 'us' | null>(null);
  const [country, setCountry] = useState<string | null>(null);

  useEffect(() => {
    // Try to get country from various sources
    async function detectRegion() {
      try {
        // First check if we have a country header from middleware
        const response = await fetch('/api/geo', { 
          method: 'HEAD',
          cache: 'no-store' 
        });
        const userCountry = response.headers.get('X-User-Country');
        
        if (userCountry) {
          setCountry(userCountry);
          // Determine region based on country
          if (userCountry === 'US') {
            setRegion('us');
          } else if (isApprovedRegion(userCountry)) {
            setRegion('eu'); // EU/UK/EEA
          }
        } else {
          // Fallback to EU as default for legal pages
          setRegion('eu');
        }
      } catch {
        // Default to EU on error
        setRegion('eu');
      }
    }

    detectRegion();
  }, []);

  return { region, country };
}