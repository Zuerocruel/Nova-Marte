/** Leva ao último post (carrossel do episódio) do Instagram para comentar. Ver app/comentar/route.ts. */
export default function BotaoComentar({ texto = 'Comente no nosso Instagram' }: { texto?: string }) {
  return (
    <a className="btn btn-ig" href="/comentar" target="_blank" rel="noopener">
      💬 {texto}
    </a>
  );
}
