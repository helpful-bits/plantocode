import { Metadata } from 'next';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { getCountryFromRequest, isApprovedRegion } from '@/lib/territories';

export const metadata: Metadata = {
  title: 'Terms of Service - Vibe Manager',
  description: 'Terms of Service for Vibe Manager AI-powered workflow automation',
};

export default async function TermsRedirectPage() {
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
  
  // Server-side redirect to the appropriate regional terms page
  redirect(`/legal/${region}/terms`);
}