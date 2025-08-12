/**
 * Centralized territory configuration for geo-restrictions
 * Used across middleware, API, and client-side checks
 */

// Full list of approved regions (US, UK, EU, and EEA)
export const APPROVED_REGIONS = new Set([
  'US', // United States
  'GB', // United Kingdom
  
  // EU Member States (27)
  'AT', // Austria
  'BE', // Belgium
  'BG', // Bulgaria
  'HR', // Croatia
  'CY', // Cyprus
  'CZ', // Czech Republic
  'DK', // Denmark
  'EE', // Estonia
  'FI', // Finland
  'FR', // France
  'DE', // Germany
  'GR', // Greece
  'HU', // Hungary
  'IE', // Ireland
  'IT', // Italy
  'LV', // Latvia
  'LT', // Lithuania
  'LU', // Luxembourg
  'MT', // Malta
  'NL', // Netherlands
  'PL', // Poland
  'PT', // Portugal
  'RO', // Romania
  'SK', // Slovakia
  'SI', // Slovenia
  'ES', // Spain
  'SE', // Sweden
  
  // EEA but not EU
  'IS', // Iceland
  'LI', // Liechtenstein
  'NO', // Norway
]);

// Sanctioned regions (comprehensive embargo list)
export const SANCTIONED_REGIONS = new Set([
  'RU', // Russia
  'BY', // Belarus
  'IR', // Iran
  'KP', // North Korea
  'SY', // Syria
  'CU', // Cuba
  // Note: Sub-regions like Crimea, Donetsk, Luhansk cannot be detected 
  // by country code alone. Rely on payment processor KYC for those.
]);

// Helper functions
export function isApprovedRegion(country: string): boolean {
  return APPROVED_REGIONS.has(country);
}

export function isSanctionedRegion(country: string): boolean {
  return SANCTIONED_REGIONS.has(country);
}

export function getCountryFromRequest(headers: Headers, geo?: any): string {
  // Try multiple geo detection methods in order of preference
  return (
    headers.get('CF-IPCountry') ?? // Cloudflare
    headers.get('x-vercel-ip-country') ?? // Vercel
    geo?.country ?? // Vercel geo object
    'XX' // Unknown
  );
}

// List of paths that should be gated
export const GATED_PATHS = [
  '/api/',
  '/app',
  '/download',
];

export function shouldGatePath(pathname: string): boolean {
  return GATED_PATHS.some(path => pathname.startsWith(path));
}