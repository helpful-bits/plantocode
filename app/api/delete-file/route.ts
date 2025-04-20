import { NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';

export async function POST(request: Request) {
  try {
    const { filePath } = await request.json();
    
    if (!filePath) {
      return NextResponse.json(
        { error: 'File path is required' },
        { status: 400 }
      );
    }

    // Security check: ensure the file path is within the allowed directories
    // For example, only allow files in the patches directory
    if (!filePath.includes('/patches/') && !filePath.includes('\\patches\\')) {
      return NextResponse.json(
        { error: 'File deletion is only allowed in the patches directory' },
        { status: 403 }
      );
    }

    try {
      // Check if file exists before attempting to delete
      await fs.access(filePath);
      
      // Delete the file
      await fs.unlink(filePath);
      
      return NextResponse.json({ 
        success: true, 
        message: `File ${path.basename(filePath)} successfully deleted` 
      });
    } catch (error) {
      console.error('Error deleting file:', error);
      
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return NextResponse.json(
          { error: 'File not found' },
          { status: 404 }
        );
      }
      
      return NextResponse.json(
        { error: `Failed to delete file: ${(error as Error).message}` },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error('Error in delete-file API route:', error);
    return NextResponse.json(
      { error: 'Invalid request' },
      { status: 400 }
    );
  }
} 