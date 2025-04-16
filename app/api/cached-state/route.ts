import { NextRequest, NextResponse } from 'next/server';
import { sessionRepository } from '@/lib/db/repository';
import { setupDatabase } from '@/lib/db/setup';
import { hashString } from '@/lib/hash';

setupDatabase(); // Ensure database connection is initialized

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const projectDirectory = searchParams.get('projectDirectory');
  const key = searchParams.get('key');

  if ((!projectDirectory && projectDirectory !== 'global') || !key) {
    return NextResponse.json({ error: 'Missing required parameters: projectDirectory (or global), key' }, { status: 400 });
  }

  try {
    const value = await sessionRepository.getCachedState(projectDirectory, key);
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
    
    const { projectDirectory, key, value } = requestData;

    // Allow 'global' project directory for general settings
    if ((!projectDirectory && projectDirectory !== 'global') || key === undefined) {
      return NextResponse.json(
        { error: 'Missing required parameters: projectDirectory, key' }, // Updated error message
        { status: 400 }
      );
    }

    // Ensure value is a string
    const safeValue = value === undefined || value === null ? "" : String(value); 
    
    await sessionRepository.saveCachedState(projectDirectory, key, safeValue);
    return NextResponse.json({ success: true }); // Return success status
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
