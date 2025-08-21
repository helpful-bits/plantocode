import { NextRequest, NextResponse } from 'next/server';
import { cdnUrl } from '@/lib/cdn';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const os = searchParams.get('os');

  const osUrlMap: Record<string, string> = {
    'mac': cdnUrl('/desktop/mac/Vibe%20Manager_1.0.17_aarch64.dmg'),
    'mac-dmg': cdnUrl('/desktop/mac/Vibe%20Manager_1.0.17_aarch64.dmg'),
    'mac-zip': cdnUrl('/desktop/mac/Vibe%20Manager_1.0.17_aarch64.app.tar.gz'),
  };

  // Default to mac download if no OS specified
  const downloadUrl = osUrlMap[os || ''] || osUrlMap['mac'];

  // Ensure we always have a valid URL
  if (!downloadUrl) {
    return NextResponse.redirect(cdnUrl('/desktop/mac/Vibe%20Manager_1.0.17_aarch64.dmg'), {
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