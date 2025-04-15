import { NextRequest, NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import { sessionRepository } from '@/lib/db/repository';
import { setupDatabase } from '@/lib/db/setup';

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

    // Security check: Ensure the requested path is within the allowed 'patches' directory
    const patchesDir = path.resolve(process.cwd(), 'patches');
    const resolvedFilePath = path.resolve(filePath); // Resolve user-provided path

    if (!resolvedFilePath.startsWith(patchesDir)) {
      console.warn(`Attempted access outside patches dir: ${filePath} (resolved: ${resolvedFilePath})`);
      return NextResponse.json({ error: 'Unauthorized file path' }, { status: 403 });
    }

    // Security check: ensure the requested path matches the session's recorded path OR session is in progress
    // This prevents accessing arbitrary patch files even within the patches dir if session is completed.
    if (session.geminiPatchPath !== resolvedFilePath && session.geminiStatus === 'completed') {
      console.warn(`Unauthorized access attempt: Session ${sessionId} tried to access ${resolvedFilePath} but expected ${session.geminiPatchPath}`);
      return NextResponse.json({ error: 'Unauthorized access to patch file' }, { status: 403 });
    }

    // Try to read the file
    try {
      const content = await fs.readFile(resolvedFilePath, 'utf8');
      return NextResponse.json({ content });
    } catch (readError) {
      // Handle file not found specifically for streaming UX
      if ((readError as NodeJS.ErrnoException).code === 'ENOENT') {
        // Return empty content if file not found (expected during initial streaming)
        return NextResponse.json({ content: '' }, { status: 200 });
      }
      throw readError; // Re-throw other read errors
    }
  } catch (error) {
    console.error('Error fetching patch content:', error);
    return NextResponse.json({ error: 'Failed to fetch patch content' }, { status: 500 });
  }
}
