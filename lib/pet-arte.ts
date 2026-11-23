/**
 * Desenho do Pet do Colono no site: a arte e a animação ficam em fabrica/pet.js, o MESMO arquivo que o vídeo
 * usa (render.html). Aqui só damos tipos a ele.
 */
import '@/fabrica/pet.js';
import type { PosePet } from '@/lib/pet';

export type EspeciePet = 'cachorro' | 'gato' | 'macaco';
type OpcoesPet = { pose: PosePet; dir: 1 | -1; t: number; seed: number; pulo?: number; escala?: number; especie?: EspeciePet };
type Api = {
  desenhar: (c: CanvasRenderingContext2D, x: number, y: number, o: OpcoesPet) => void;
  desenharBola: (c: CanvasRenderingContext2D, x: number, y: number, alt: number) => void;
};
const api = () => (globalThis as unknown as { PetArte: Api }).PetArte;

export const desenharPet = (c: CanvasRenderingContext2D, x: number, y: number, o: OpcoesPet) => api().desenhar(c, x, y, o);
export const desenharBola = (c: CanvasRenderingContext2D, x: number, y: number, alt: number) => api().desenharBola(c, x, y, alt);
