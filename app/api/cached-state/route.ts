import { NextRequest, NextResponse } from 'next/server';
import { sessionRepository } from '@/lib/db/repository';
import { setupDatabase } from '@/lib/db/setup';
import { OutputFormat } from '@/types';
import { hashString } from '@/lib/hash';
setupDatabase();

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const projectDirectory = searchParams.get('projectDirectory');
  const outputFormat = searchParams.get('outputFormat');
  const key = searchParams.get('key');

  if (!projectDirectory || !outputFormat || !key) {
    return NextResponse.json({ error: 'Missing required parameters: projectDirectory, outputFormat, key' }, { status: 400 });
  }

  try {
    const value = await sessionRepository.getCachedState(projectDirectory, outputFormat as OutputFormat, key); // Removed as any
    return NextResponse.json({ value });
  } catch (error) {
    console.error('Error fetching cached state:', error);
    return NextResponse.json({ error: 'Failed to fetch cached state' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const contentType = request.headers.get('content-type');
    if (!contentType || !contentType.includes('application/json')) {
      return NextResponse.json(
        { error: 'Content-Type must be application/json' }, 
        { status: 400 }
      );
    }
    
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

    // Allow 'global' project directory for general settings
    if ((!projectDirectory && projectDirectory !== 'global') || !outputFormat || key === undefined) {
      return NextResponse.json(
        { error: 'Missing required parameters: projectDirectory, outputFormat, key' },
        { status: 400 }
      );
    }

    // Ensure value is a string
    const safeValue = value === undefined || value === null ? "" : String(value);
    
    await sessionRepository.saveCachedState(projectDirectory, outputFormat as OutputFormat, key, safeValue); // Pass validated params
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error saving cached state:', error);
    
    let errorMessage = 'Failed to save cached state';
    if (error instanceof Error) {
      errorMessage = error.message;
    }
    
    return NextResponse.json(
      { error: errorMessage }, 
      { status: 500 }
    );
  }
}
