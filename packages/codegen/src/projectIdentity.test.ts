import { describe, expect, it } from 'vitest';
import { specWithEveryKind } from './fixtures.js';

/**
 * Estas assertivas moraram em `compiledVisual.e2e.test.ts` ate o split das
 * suites. Nao dependem do artefato compilado — so da identidade que a spec
 * carrega — e ficariam presas ao gate de ~15 s sem motivo, ou pior, sairiam
 * da suite rapida sem ninguem notar.
 */
describe('identidade entre projetos', () => {
  /**
   * RN-01 / C-03: dois visuais precisam coexistir no mesmo relatorio. GUID
   * repetido faz o segundo import sobrescrever o primeiro — foi o erro 2 do
   * Anexo A, e a compilacao real nao o dissolve sozinha.
   */
  it('dois projetos novos nunca compartilham GUID', () => {
    const a = specWithEveryKind('Vendas');
    const b = specWithEveryKind('Vendas');
    expect(a.project.id).not.toBe(b.project.id);
  });

  it('o mesmo projeto reexportado mantem o id', () => {
    const spec = specWithEveryKind('Vendas');
    const reexport = { ...spec, project: { ...spec.project, packageVersion: '1.0.0.1' as const } };
    expect(reexport.project.id).toBe(spec.project.id);
  });
});
