import { NextRequest, NextResponse } from 'next/server';

// POST /api/migrate
export async function POST(request: NextRequest) {
  // Migration from localStorage is no longer needed or supported
  return NextResponse.json({ success: true, message: "Migration from localStorage is no longer supported/needed" });
} 