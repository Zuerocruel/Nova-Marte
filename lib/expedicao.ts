import exp from '@/fabrica/expedicao.json';

/**
 * Expedição Norte (fabrica/expedicao.json, o mesmo arquivo que a fábrica de vídeos usa): quem está fora da colônia.
 * No Mundo ao vivo eles não aparecem andando (a casa continua, de luz apagada) e a ficha diz onde estão.
 * Quando eles voltarem na história, a fábrica marca "ativa": false e eles reaparecem.
 */
export const EM_EXPEDICAO: ReadonlySet<string> = new Set(exp.ativa ? exp.membros : []);
export const TEXTO_EXPEDICAO = 'em expedição ao norte de Marte, longe da colônia';
