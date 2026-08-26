import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json({
    status: 'ok',
    version: '1.0.0',
    mode: 'vercel-serverless',
    timestamp: Date.now(),
  });
}
