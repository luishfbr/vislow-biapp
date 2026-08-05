import { PROJECT_NAME_MAX_LENGTH, PROJECT_NAME_MIN_LENGTH } from '@vislow/component-registry';
import { z } from 'zod';

/**
 * O formulario do PROJETO — hoje, so o nome do visual.
 *
 * Ele nao substitui o `validateSpec`: quem decide se uma spec pode virar pacote
 * continua sendo o mesmo validador que a API aplica (RN-03), e o campo escreve
 * na store mesmo com valor invalido justamente para que aquele portao enxergue o
 * problema. O que este schema faz e antecipar a mensagem — dizer o que falta
 * enquanto se digita, em vez de deixar o export desabilitado sem explicacao.
 *
 * Os limites vem do `component-registry`, nao de literal daqui. Sao os mesmos
 * numeros que o JSON Schema aplica; escrever `3` de novo aqui seria a segunda
 * declaracao a divergir na primeira vez que alguem afrouxasse um lado.
 */

/**
 * A medida e do valor APARADO, e o JSON Schema mede o valor cru.
 *
 * A diferenca e deliberada e fecha um buraco que existia: `"   "` tem tres
 * caracteres, passa no `minLength: 3` e chega ate o `selectCanExport`, que apara
 * e reprova — resultado, o botao de export desabilitava e nada na tela dizia por
 * que. Aqui o campo acusa, no lugar onde da para corrigir.
 *
 * Aparar para VALIDAR, nunca para gravar: um `.transform(trim)` no caminho de
 * escrita comeria o espaco no meio da digitacao, e ninguem conseguiria escrever
 * "Painel de vendas" depois de "Painel".
 */
export const projectNameSchema = z
  .string()
  .refine((value) => value.trim().length >= PROJECT_NAME_MIN_LENGTH, {
    message: `Minimo de ${String(PROJECT_NAME_MIN_LENGTH)} caracteres.`,
  })
  .refine((value) => value.trim().length <= PROJECT_NAME_MAX_LENGTH, {
    message: `Maximo de ${String(PROJECT_NAME_MAX_LENGTH)} caracteres.`,
  });

export const projectFormSchema = z.object({ name: projectNameSchema });

export type ProjectFormValues = z.infer<typeof projectFormSchema>;
