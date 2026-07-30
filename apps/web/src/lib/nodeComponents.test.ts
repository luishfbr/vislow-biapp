import { NODE_DESCRIPTORS, NODE_KINDS } from '@vislow/component-registry';
import { describe, expect, it } from 'vitest';
import { COMPONENT_NAMES, NODE_COMPONENTS } from './nodeComponents';

/**
 * A guarda do ADR-04 depois do pivo.
 *
 * O preview e o visual compilado tem que renderizar o MESMO componente. O
 * codegen chega la por texto (`descriptor.component` vira import nomeado); o
 * preview chega por referencia (o mapa deste modulo). Nada no compilador liga os
 * dois caminhos — este teste liga.
 */
describe('mapa de componentes do preview', () => {
  it('cobre todo tipo de no do registro', () => {
    expect(Object.keys(NODE_COMPONENTS).sort()).toEqual([...NODE_KINDS].sort());
  });

  it('aponta para o mesmo componente que o codegen importa', () => {
    for (const kind of NODE_KINDS) {
      // Se este teste falhar, o preview esta desenhando um componente e o
      // pacote entregue esta desenhando outro — que e exatamente a divergencia
      // que o ADR-04 existe para tornar impossivel.
      expect(COMPONENT_NAMES[kind].name).toBe(NODE_DESCRIPTORS[kind].component);
    }
  });

  it('toda entrada e renderizavel', () => {
    for (const kind of NODE_KINDS) {
      expect(typeof NODE_COMPONENTS[kind]).toBe('function');
    }
  });
});
