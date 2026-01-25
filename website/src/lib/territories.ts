/**
 * Centralized territory configuration for geo-restrictions
 * Used across middleware, API, and client-side checks
 */

// EU/EEA regions - used for determining which legal documents to show
export const EU_REGIONS = new Set([
  'GB', // United Kingdom
  // EU Member States (27)
  'AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR', 'DE', 'GR',
  'HU', 'IE', 'IT', 'LV', 'LT', 'LU', 'MT', 'NL', 'PL', 'PT', 'RO', 'SK',
  'SI', 'ES', 'SE',
  // EEA but not EU
  'IS', 'LI', 'NO',
]);

// Sanctioned regions - legally required restrictions due to OFAC/international sanctions
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
export function isSanctionedRegion(country: string): boolean {
  return SANCTIONED_REGIONS.has(country);
}

// Used for determining which legal documents to show (EU vs US)
export function isApprovedRegion(country: string): boolean {
  return country === 'US' || EU_REGIONS.has(country);
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