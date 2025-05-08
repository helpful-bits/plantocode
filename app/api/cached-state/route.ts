import { NextRequest, NextResponse } from 'next/server';
import { getCachedState, saveCachedState } from '@/lib/db';
import { 
  handleRateLimit, 
  createDefaultRateLimiterConfig, 
  getClientId 
} from '@/lib/api/middleware/rate-limiter';

// Create a rate limiter config specific to the cached state API
const rateLimiterConfig = createDefaultRateLimiterConfig();
// Customize for this endpoint's needs
rateLimiterConfig.standardCooldown = 8000; // 8 second cooldown
rateLimiterConfig.criticalKeyCooldown = 15000; // 15 second cooldown for critical keys
rateLimiterConfig.abusiveRequestsPerMinute = 50;

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const key = url.searchParams.get('key');
  const projectDirectory = url.searchParams.get('projectDirectory');
  
  if (!key) {
    return NextResponse.json({ error: 'Key is required' }, { status: 400 });
  }
  
  // Get client ID for rate limiting
  const clientId = getClientId(request);
  
  // Check rate limiting
  const rateLimitResult = handleRateLimit(request, key, projectDirectory, rateLimiterConfig);
  if (rateLimitResult.isRateLimited) {
    return rateLimitResult.response!;
  }
  
  try {
    const data = await getCachedState(projectDirectory, key);
    return NextResponse.json(data || {});
  } catch (error) {
    console.error(`[API cached-state GET] Error fetching state for key ${key}:`, error);
    return NextResponse.json(
      { error: 'Failed to fetch state' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  const url = new URL(request.url);
  const key = url.searchParams.get('key');
  const projectDirectory = url.searchParams.get('projectDirectory');
  
  if (!key) {
    return NextResponse.json({ error: 'Key is required' }, { status: 400 });
  }
  
  const clientId = getClientId(request);
  
  // Check rate limiting
  const rateLimitResult = handleRateLimit(request, key, projectDirectory, rateLimiterConfig);
  if (rateLimitResult.isRateLimited) {
    return rateLimitResult.response!;
  }
  
  try {
    const data = await request.json();
    await saveCachedState(projectDirectory, key, JSON.stringify(data));
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error(`[API cached-state POST] Error saving state for key ${key}:`, error);
    return NextResponse.json(
      { error: 'Failed to save state' },
      { status: 500 }
    );
  }
}