import { NextResponse } from 'next/server'; // Keep NextResponse import

/**
 * Simple heartbeat endpoint that just returns a 200 OK response.
 * Used to create a synchronous XHR request that gives time for
 * asynchronous operations to complete during beforeunload events.
 */
export async function GET() {
    return NextResponse.json({status: 'ok'}, {status: 200}); // Keep JSON response
}