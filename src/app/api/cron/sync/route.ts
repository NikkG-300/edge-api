const x: string = 123;
export const runtime = 'edge';

export async function GET() {
  console.log('Cron sync triggered at', new Date().toISOString());

  return new Response(
    JSON.stringify({ ok: true, ranAt: new Date().toISOString() }),
    { status: 200, headers: { 'Content-Type': 'application/json' } }
  );
}