export const dynamic = 'force-dynamic';

export async function GET() {
  return new Response('Auth callback', { status: 200 });
}
