import { NextResponse } from 'next/server';

export async function GET() {
  // Redirect to the latest Mac DMG download (ARM/Apple Silicon)
  const downloadUrl = 'https://d2tyb0wucqqf48.cloudfront.net/desktop/mac/Vibe%20Manager_1.0.12_aarch64.dmg';

  return NextResponse.redirect(downloadUrl, {
    status: 302,
    headers: {
      'Cache-Control': 'no-cache, no-store, must-revalidate',
    },
  });
}