import {
  isV1Config,
  migrateV1ToV2,
  validateSpec,
  type VisualSpec,
} from '@vislow/component-registry';
import { validateConfig } from '@vislow/config-schema';

/**
 * Persistencia local do projeto (RF-08).
 *
 * A chave carrega a versao do formato de ARMAZENAMENTO — distinta do
 * `schemaVersion` da spec. A v2 e a arvore do ADR-08; a v1 e o config plano do
 * editor antigo, que ainda esta no `localStorage` de quem ja usou o produto.
 */
const STORAGE_KEY = 'vislow:project:v2';
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
 * bloqueia o export.
 *
 * A migracao NAO apaga a chave v1. Se a arvore migrada tiver algum problema que
 * so aparece depois, o original ainda esta la para diagnosticar — e o custo e
 * alguns KB de `localStorage`.
 */
export function loadProject(): VisualSpec | null {
  if (typeof window === 'undefined') return null;

  try {
    const current = readJson(STORAGE_KEY);
    if (current !== null) {
      const result = validateSpec(current);
      return result.kind === 'valid' ? result.spec : null;
    }

    const legacy = readJson(LEGACY_KEY);
    if (legacy === null || !isV1Config(legacy)) return null;

    // Migrar preserva o `project.id`, e com ele a capacidade de ATUALIZAR o
    // visual no Power BI em vez de duplicar (RF-10). E a unica parte
    // insubstituivel do projeto antigo.
    const config = validateConfig(legacy);
    if (config.kind === 'invalid') return null;

    const migrated = validateSpec(migrateV1ToV2(config.config));
    return migrated.kind === 'valid' ? migrated.spec : null;
  } catch {
    return null;
  }
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
