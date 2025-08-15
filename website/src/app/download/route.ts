import { NextRequest, NextResponse } from 'next/server';
import { cdnUrl } from '@/lib/cdn';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const os = searchParams.get('os');

  const osUrlMap: Record<string, string> = {
    'mac': cdnUrl('/desktop/mac/Vibe%20Manager_1.0.15_aarch64.dmg'),
    'mac-dmg': cdnUrl('/desktop/mac/Vibe%20Manager_1.0.15_aarch64.dmg'),
    'mac-zip': cdnUrl('/desktop/mac/Vibe%20Manager_1.0.15_aarch64.app.tar.gz'),
  };

  const downloadUrl = osUrlMap[os || ''] || '/';

  return NextResponse.redirect(downloadUrl, {
    status: 302,
    headers: {
      'Cache-Control': 'no-cache, no-store, must-revalidate',
    },
  });
}