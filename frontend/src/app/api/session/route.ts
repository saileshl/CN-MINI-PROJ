import { NextResponse } from 'next/server';

function generatePairingCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

export async function POST() {
  const sessionId = crypto.randomUUID();
  const pairingCode = generatePairingCode();
  const expiresAt = Date.now() + 5 * 60 * 1000; // 5 minutes

  return NextResponse.json(
    {
      sessionId,
      pairingCode,
      expiresAt,
    },
    { status: 201 }
  );
}

export async function GET() {
  const sessionId = crypto.randomUUID();
  const pairingCode = generatePairingCode();
  const expiresAt = Date.now() + 5 * 60 * 1000;

  return NextResponse.json({
    sessionId,
    pairingCode,
    expiresAt,
  });
}
