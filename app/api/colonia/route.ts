import { NextResponse } from 'next/server';
import { estadoColonia } from '@/lib/colonia';

/** Estado da colônia para o Mundo ao vivo (obras, estação, problema do dia, itens nas casas). */
export async function GET() {
  try {
    return NextResponse.json(await estadoColonia(), {
      headers: { 'Cache-Control': 'public, s-maxage=20, stale-while-revalidate=60' },
    });
  } catch (e) {
    console.error('colonia', e);
    return NextResponse.json({ erro: 'Erro ao carregar a colônia.' }, { status: 500 });
  }
}
