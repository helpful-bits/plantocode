import { NextRequest, NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const filePath = searchParams.get('path');

  if (!filePath) {
    return NextResponse.json({ error: 'Patch file path is required' }, { status: 400 });
  }

  try {
    // Security check: ensure it's in the patches directory
    const patchesDir = path.resolve(process.cwd(), 'patches'); // Use path.resolve for canonical path
    const resolvedFilePath = path.resolve(filePath); // Resolve user-provided path

    if (!resolvedFilePath.startsWith(patchesDir)) {
      console.warn(`Attempted access outside patches dir: ${filePath} (resolved: ${resolvedFilePath})`);
      return NextResponse.json({ error: 'Unauthorized file path' }, { status: 403 });
    }

    // Read file
    const content = await fs.readFile(resolvedFilePath, 'utf8');
    const filename = path.basename(resolvedFilePath);

    // Return as downloadable file
    return new NextResponse(content, {
      headers: {
        'Content-Type': 'text/plain',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    console.error('Error downloading patch file:', error);
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return NextResponse.json({ error: 'File not found' }, { status: 404 });
    }
    return NextResponse.json({ error: 'Failed to download file' }, { status: 500 });
  }
