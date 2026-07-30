import { validateConfig, type VisualConfig } from '@vislow/config-schema';

/**
 * Persistencia local do projeto (RF-08).
 *
 * A chave carrega a versao do formato de ARMAZENAMENTO — distinta do
 * `schemaVersion` da config. Se um dia o envelope mudar, um projeto antigo e
 * simplesmente ignorado em vez de quebrar o editor na abertura.
 */
const STORAGE_KEY = 'vislow:project:v1';
const SAVE_DEBOUNCE_MS = 300;

let timer: ReturnType<typeof setTimeout> | undefined;

export function saveProjectDebounced(config: VisualConfig): void {
  if (typeof window === 'undefined') return;
  if (timer !== undefined) clearTimeout(timer);
  timer = setTimeout(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
    } catch {
      // Cota cheia ou modo privativo. Perder o autosave e aceitavel; travar o
      // editor por causa dele nao e.
    }
  }, SAVE_DEBOUNCE_MS);
}

/**
 * Le o projeto salvo. Um projeto invalido — schema evoluiu, storage adulterado —
 * e DESCARTADO em silencio: e melhor comecar limpo do que abrir num estado que
 * nao valida e bloqueia o export.
 */
export function loadProject(): VisualConfig | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw === null) return null;
    const result = validateConfig(JSON.parse(raw));
    return result.kind === 'valid' ? result.config : null;
  } catch {
    return null;
  }
}

export function downloadJson(config: VisualConfig): void {
  const blob = new Blob([JSON.stringify(config, null, 2)], { type: 'application/json' });
  triggerDownload(blob, `${slugForFile(config.project.name)}.vislow.json`);
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
