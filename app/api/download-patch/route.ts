import { NextRequest, NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import { existsSync } from 'fs';
import { getAppPatchesDirectory, getPatchFilename } from '@/lib/path-utils'; // Keep path-utils import

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const filePath = searchParams.get('path');

  if (!filePath) {
    return NextResponse.json({ error: 'Patch file path is required' }, { status: 400 });
  }

  try {
    // First attempt to use the provided path directly, which should already be absolute
    if (existsSync(filePath)) {
      // File exists at the provided path, which could be either in the project directory 
      // or the app's patches directory
      
      // Read file
      const content = await fs.readFile(filePath, 'utf8');
      const filename = getPatchFilename(filePath);

      // Return as downloadable file
      return new NextResponse(content, {
        headers: { // Keep headers
          'Content-Type': 'text/plain',
          'Content-Disposition': `attachment; filename="${filename}"`,
        },
      });
    }
    
    // If we get here, the file doesn't exist at the provided path.
    // This could happen if the database has an old path or the file was moved
    
    // Try to find it by filename in the app's patches directory as a fallback
    const filename = getPatchFilename(filePath);
    const fallbackPath = path.join(getAppPatchesDirectory(), filename);
    
    if (existsSync(fallbackPath)) {
      // Found in the fallback location
      const content = await fs.readFile(fallbackPath, 'utf8');
      
      return new NextResponse(content, {
        headers: {
          'Content-Type': 'text/plain',
          'Content-Disposition': `attachment; filename="${filename}"`,
        },
      });
    }
    
    // File not found in either location
    return NextResponse.json({ error: 'File not found' }, { status: 404 });
  } catch (error) {
    console.error('Error downloading patch file:', error);
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return NextResponse.json({ error: 'File not found' }, { status: 404 });
    }
    return NextResponse.json({ error: 'Failed to download file' }, { status: 500 });
  }
}
