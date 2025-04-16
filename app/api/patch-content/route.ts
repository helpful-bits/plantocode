import { NextRequest, NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import { existsSync } from 'fs';
import { sessionRepository } from '@/lib/db/repository'; // Keep sessionRepository import
import { setupDatabase } from '@/lib/db/setup';
import { getAppPatchesDirectory, getPatchFilename } from '@/lib/path-utils'; // Keep path-utils import

export async function GET(request: NextRequest) {
  // Ensure database is initialized
  await setupDatabase();

  const searchParams = request.nextUrl.searchParams;
  const filePath = searchParams.get('path');
  const sessionId = searchParams.get('sessionId');

  if (!filePath) {
    return NextResponse.json({ error: 'Patch file path is required' }, { status: 400 });
  }

  if (!sessionId) {
    return NextResponse.json({ error: 'Session ID is required' }, { status: 400 });
  }

  try {
    // Verify the session exists
    const session = await sessionRepository.getSession(sessionId);

    if (!session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }

    // Try to find the file at its primary location
    let resolvedFilePath = filePath;
    let content;

    if (existsSync(resolvedFilePath)) {
      // File exists at the provided path
      content = await fs.readFile(resolvedFilePath, 'utf8');
    } else {
      // Try fallback location - the app's patches directory
      const filename = getPatchFilename(filePath);
      const fallbackPath = path.join(getAppPatchesDirectory(), filename);
      
      if (existsSync(fallbackPath)) {
        // Found in fallback location
        resolvedFilePath = fallbackPath;
      } else { // Keep else block for fallback location
        // Create patches directory if it doesn't exist
        const patchesDir = getAppPatchesDirectory();
        if (!existsSync(patchesDir)) {
          await fs.mkdir(patchesDir, { recursive: true });
        }
        
        // Return detailed error for debugging
        return NextResponse.json({
          error: `Patch file not found. Searched locations: ${resolvedFilePath}, ${fallbackPath}`,
          attempted_paths: [resolvedFilePath, fallbackPath]
        }, { status: 404 });
      }
    }

    // Read content from the finally resolved path
    content = await fs.readFile(resolvedFilePath, 'utf8');
    
    // Return the content
    return new NextResponse(content, {
      headers: {
        'Content-Type': 'text/plain',
      },
    });
  } catch (error) {
    console.error('Error retrieving patch content:', error);
    return NextResponse.json({ 
      error: error instanceof Error ? error.message : 'Failed to retrieve patch content' 
    }, { status: 500 });
  }
}
