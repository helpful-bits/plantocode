import { NextResponse } from 'next/server';
import { headers } from 'next/headers';

export async function HEAD() {
  const headersList = await headers();
  const country = headersList.get('X-User-Country') || 'XX';
  
  const response = new NextResponse(null, { status: 204 });
  response.headers.set('X-User-Country', country);
  return response;
}

export async function GET() {
  return HEAD();
}