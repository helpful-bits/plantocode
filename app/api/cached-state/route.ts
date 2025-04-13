import { NextRequest, NextResponse } from 'next/server';
import { sessionRepository } from '@/lib/db/repository';
import { OutputFormat } from '@/types';

// GET /api/cached-state?projectDirectory=...&outputFormat=...&key=...
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const projectDirectory = searchParams.get('projectDirectory');
  const outputFormat = searchParams.get('outputFormat') as OutputFormat;
  const key = searchParams.get('key');
  
  if (!projectDirectory || !outputFormat || !key) {
    return NextResponse.json({ error: 'Missing required parameters' }, { status: 400 });
  }
  
  try {
    const value = await sessionRepository.getCachedState(projectDirectory, outputFormat, key);
    return NextResponse.json({ value });
  } catch (error) {
    console.error('Error fetching cached state:', error);
    return NextResponse.json({ error: 'Failed to fetch cached state' }, { status: 500 });
  }
}

// POST /api/cached-state
export async function POST(request: NextRequest) {
  try {
    // Make sure we can read the request body
    const contentType = request.headers.get('content-type');
    if (!contentType || !contentType.includes('application/json')) {
      return NextResponse.json(
        { error: 'Content-Type must be application/json' }, 
        { status: 400 }
      );
    }
    
    // Try to parse the request data
    let requestData;
    try {
      requestData = await request.json();
    } catch (parseError) {
      console.error('Error parsing JSON request body:', parseError);
      return NextResponse.json(
        { error: 'Invalid JSON in request body' }, 
        { status: 400 }
      );
    }
    
    const { projectDirectory, outputFormat, key, value } = requestData;
    
    // Validate required fields
    if (!projectDirectory || !outputFormat || key === undefined) {
      return NextResponse.json(
        { error: 'Missing required parameters: projectDirectory, outputFormat, and key are required' }, 
        { status: 400 }
      );
    }
    
    // Ensure value is a string (convert to empty string if null or undefined)
    const safeValue = value === undefined || value === null ? "" : String(value);
    
    // Save to database
    await sessionRepository.saveCachedState(projectDirectory, outputFormat, key, safeValue);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error saving cached state:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to save cached state' }, 
      { status: 500 }
    );
  }
}