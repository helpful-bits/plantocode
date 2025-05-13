import { NextResponse } from 'next/server';

/**
 * Simple heartbeat endpoint that just returns a 200 OK response.
 * Used to create a synchronous XHR request that gives time for
 * asynchronous operations to complete during beforeunload events.
 */
export async function GET() { // Keep function signature
    return NextResponse.json({status: 'ok'}, {status: 200}); // Keep return statement
}