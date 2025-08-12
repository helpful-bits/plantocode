import { Metadata } from 'next';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { getCountryFromRequest, isApprovedRegion } from '@/lib/territories';

export const metadata: Metadata = {
  title: 'Privacy Policy - Vibe Manager',
  description: 'Privacy Policy for Vibe Manager - How we protect and handle your data',
};

export default async function PrivacyRedirectPage() {
  // Get the user's country from headers
  const headersList = await headers();
  const country = getCountryFromRequest(headersList);
  
  // Determine the appropriate region
  let region: 'eu' | 'us';
  
  if (country === 'US') {
    region = 'us';
  } else if (isApprovedRegion(country)) {
    // EU/UK/EEA countries
    region = 'eu';
  } else {
    // For non-approved regions or unknown, default to EU (more protective)
    region = 'eu';
  }
  
  // Server-side redirect to the appropriate regional privacy page
  redirect(`/legal/${region}/privacy`);
}