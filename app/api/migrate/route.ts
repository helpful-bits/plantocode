import { NextRequest, NextResponse } from 'next/server';
import { setupDatabase } from '@/lib/db/setup';

// Initialize database on server startup
setupDatabase();

// POST /api/migrate
export async function POST(request: NextRequest) {
  // Migration from localStorage is no longer needed
  return NextResponse.json({ success: true, message: "Migration from localStorage is no longer needed" });
} 