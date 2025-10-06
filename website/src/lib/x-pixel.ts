/**
 * X (Twitter) Pixel Event Tracking - Server-Side Implementation Notes
 *
 * IMPORTANT: Cookie-Free vs Cookie-Based Tracking
 * ===============================================
 *
 * Option 1: Client-Side Pixel (twq) - REQUIRES COOKIE CONSENT BANNER
 * - Uses cookies (personalization_id)
 * - Requires GDPR consent banner
 * - Can be blocked by ad blockers
 * - Easy to implement
 *
 * Option 2: Server-Side Conversion API - COOKIE-FREE ✅
 * - No cookies or client-side tracking
 * - Bypasses ad blockers
 * - GDPR-friendly (no consent needed if properly implemented)
 * - Complex setup - requires OAuth 1.0a authentication
 *
 * CURRENT STATUS:
 * - Pixel IDs configured in environment: NEXT_PUBLIC_X_PIXEL_ID=qd2ik
 * - Event ID configured: NEXT_PUBLIC_X_DOWNLOAD_EVENT_ID=qd2io
 * - NOT YET IMPLEMENTED: Requires X Ads API OAuth tokens
 *
 * TO IMPLEMENT SERVER-SIDE TRACKING:
 * ==================================
 *
 * 1. Get OAuth 1.0a tokens from X Developer Portal:
 *    - Apply for X Ads API access
 *    - Generate Consumer Key/Secret
 *    - Generate Access Token/Secret
 *    - Requires AD_MANAGER or ACCOUNT_ADMIN role
 *
 * 2. Add to environment variables:
 *    - X_ADS_API_KEY (Consumer Key)
 *    - X_ADS_API_SECRET (Consumer Secret)
 *    - X_ADS_ACCESS_TOKEN
 *    - X_ADS_ACCESS_TOKEN_SECRET
 *
 * 3. API Endpoint: POST https://ads-api.x.com/12/measurement/conversions/{pixel_id}
 *
 * 4. Required Request Format:
 * {
 *   "conversions": [{
 *     "conversion_time": "2025-09-30T12:00:00Z",
 *     "event_id": "qd2io",
 *     "identifiers": [{
 *       "hashed_email": "sha256_hash",  // Optional but improves matching
 *       "ip_address": "1.2.3.4",
 *       "user_agent": "Mozilla/5.0..."
 *     }],
 *     "conversion_id": "unique_event_id",  // For deduplication
 *     "value": "0.00",  // Optional: conversion value
 *     "currency": "USD"  // Optional
 *   }]
 * }
 *
 * RATE LIMITS:
 * - 60,000 events per account per 15-minute window
 *
 * REFERENCES:
 * - https://developer.x.com/en/docs/x-ads-api/measurement/web-conversions/conversion-api
 */

/**
 * Event mapping from internal events to X Pixel event IDs
 * Update these based on your X Ads Manager configuration
 */
export const X_EVENT_MAP = {
  // Download tracker event
  download_click: process.env.NEXT_PUBLIC_X_DOWNLOAD_EVENT_ID || 'qd2io',

  // Add more event mappings as configured in X Ads Manager
  // pageview: 'event_id',
  // purchase: 'event_id',
  // signup: 'event_id',
} as const;

/**
 * Get X Pixel ID from environment
 */
export function getXPixelId(): string | undefined {
  return process.env.NEXT_PUBLIC_X_PIXEL_ID;
}

/**
 * Get X Event ID for a given internal event name
 */
export function getXEventId(eventName: string): string | undefined {
  return X_EVENT_MAP[eventName as keyof typeof X_EVENT_MAP];
}

/**
 * Check if X Conversion API is configured with OAuth tokens
 */
export function isXConversionApiConfigured(): boolean {
  return !!(
    process.env.X_ADS_API_KEY &&
    process.env.X_ADS_API_SECRET &&
    process.env.X_ADS_ACCESS_TOKEN &&
    process.env.X_ADS_ACCESS_TOKEN_SECRET
  );
}

/**
 * Format event ID in X Pixel format: tw-{pixel_id}-{event_id}
 */
export function formatXEventId(pixelId: string, eventId: string): string {
  return `tw-${pixelId}-${eventId}`;
}