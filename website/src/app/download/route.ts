import { NextRequest, NextResponse } from 'next/server';
import { cdnUrl } from '@/lib/cdn';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const os = searchParams.get('os');

  const osUrlMap: Record<string, string> = {
    'mac': cdnUrl('/desktop/mac/stable/latest.dmg'),
    'mac-dmg': cdnUrl('/desktop/mac/stable/latest.dmg'),
    'mac-zip': cdnUrl('/desktop/mac/stable/latest.tar.gz'),
    'windows': cdnUrl('/desktop/windows/Vibe-Manager-1.0.18.exe'),
  };

  // Default to mac download if no OS specified
  const downloadUrl = osUrlMap[os || ''] || osUrlMap['mac'];

  // Ensure we always have a valid URL
  if (!downloadUrl) {
    return NextResponse.redirect(cdnUrl('/desktop/mac/stable/latest.dmg'), {
      status: 302,
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
      },
    });
  }

  return NextResponse.redirect(downloadUrl, {
    status: 302,
    headers: {
      'Cache-Control': 'no-cache, no-store, must-revalidate',
    },
  });
}