/** Perfis da série nas redes sociais (o mesmo endereço que as copies e as bios usam). */
export const REDES = [
  { id: 'instagram', nome: 'Instagram', arroba: '@operacaomartezero', url: 'https://www.instagram.com/operacaomartezero/', cor: '#e1306c' },
  { id: 'tiktok', nome: 'TikTok', arroba: '@operacaomartezero', url: 'https://www.tiktok.com/@operacaomartezero', cor: '#25f4ee' },
  { id: 'youtube', nome: 'YouTube', arroba: 'Operação Marte Zero', url: 'https://www.youtube.com/channel/UCKSkHV2WKpfezCBBi6BeFUQ', cor: '#ff3d3d' },
] as const;
export type RedeId = (typeof REDES)[number]['id'];
