import {
  isV1Config,
  isV2Spec,
  migrateV1,
  migrateV2ToV3,
  validateSpec,
  type VisualSpec,
} from '@vislow/component-registry';
import { validateConfig } from '@vislow/config-schema';

/**
 * Persistencia local do projeto (RF-08).
 *
 * A chave carrega a versao do formato de ARMAZENAMENTO — distinta do
 * `schemaVersion` da spec. A v1 e o config plano do editor antigo; a v2 e a
 * arvore do ADR-08, com `dataRoles`; a v3 troca os papeis pela tabela de
 * exemplo. As tres ainda podem estar no `localStorage` de quem ja usou o
 * produto.
 *
 * A CHAVE DA v2 CONTINUA SENDO LIDA, e nao renomeada: quem tem projeto salvo
 * la precisa que ele abra. A v3 escreve na chave propria, entao um downgrade do
 * app nao encontra uma spec que ele nao entende.
 */
const STORAGE_KEY = 'vislow:project:v3';
const V2_KEY = 'vislow:project:v2';
const LEGACY_KEY = 'vislow:project:v1';
const SAVE_DEBOUNCE_MS = 300;

let timer: ReturnType<typeof setTimeout> | undefined;

export function saveProjectDebounced(spec: VisualSpec): void {
  if (typeof window === 'undefined') return;
  if (timer !== undefined) clearTimeout(timer);
  timer = setTimeout(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(spec));
    } catch {
      // Cota cheia ou modo privativo. Perder o autosave e aceitavel; travar o
      // editor por causa dele nao e.
    }
  }, SAVE_DEBOUNCE_MS);
}

function readJson(key: string): unknown {
  const raw = window.localStorage.getItem(key);
  return raw === null ? null : JSON.parse(raw);
}

/**
 * Le o projeto salvo, migrando o formato antigo quando for o caso.
 *
 * Uma spec invalida — schema evoluiu, storage adulterado — e DESCARTADA em
 * silencio: e melhor comecar limpo do que abrir num estado que nao valida e
 * bloqueia o export. O preco disso e que uma migracao quebrada nao da erro na
 * tela: ela APAGA o projeto de quem abriu o editor. E por isso que
 * `migrate.test.ts` congela uma spec v2 real e a valida ponta a ponta.
 *
 * A migracao NAO apaga a chave antiga. Se a arvore migrada tiver algum problema
 * que so aparece depois, o original ainda esta la para diagnosticar — e o custo
 * e alguns KB de `localStorage`.
 */
export function loadProject(): VisualSpec | null {
  if (typeof window === 'undefined') return null;

  try {
    const current = readJson(STORAGE_KEY);
    if (current !== null) {
      const result = validateSpec(current);
      return result.kind === 'valid' ? result.spec : null;
    }

    // Migrar preserva o `project.id`, e com ele a capacidade de ATUALIZAR o
    // visual no Power BI em vez de duplicar (RF-10). E a unica parte
    // insubstituivel de um projeto antigo.
    const v2 = readJson(V2_KEY);
    if (v2 !== null) return migrated(isV2Spec(v2) ? migrateV2ToV3(v2) : null);

    const legacy = readJson(LEGACY_KEY);
    if (legacy === null || !isV1Config(legacy)) return null;

    const config = validateConfig(legacy);
    if (config.kind === 'invalid') return null;

    return migrated(migrateV1(config.config));
  } catch {
    return null;
  }
}

function migrated(spec: VisualSpec | null): VisualSpec | null {
  if (!spec) return null;
  const result = validateSpec(spec);
  return result.kind === 'valid' ? result.spec : null;
}

export function downloadJson(spec: VisualSpec): void {
  const blob = new Blob([JSON.stringify(spec, null, 2)], { type: 'application/json' });
  triggerDownload(blob, `${slugForFile(spec.project.name)}.vislow.json`);
}

export function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function slugForFile(name: string): string {
  return (
    name
      .normalize('NFD')
      .replace(/\p{Diacritic}/gu, '')
      .replace(/[^A-Za-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .toLowerCase() || 'visual'
  );
}
