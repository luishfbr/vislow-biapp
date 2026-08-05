import { validateSpec, type VisualSpec } from '@vislow/component-registry';

/**
 * Persistencia local do projeto (RF-08).
 *
 * A chave carrega a versao do formato de ARMAZENAMENTO — distinta do
 * `schemaVersion` da spec.
 *
 * ==================== POR QUE A CHAVE PULOU PARA v5 =========================
 * A spec 5.0.0 REMOVEU tipos de no, e nao existe migracao 4->5 (ver o cabecalho
 * de `spec.ts`). Se este arquivo continuasse lendo `vislow:project:v3`, todo
 * projeto ja salvo seria lido, reprovado pelo schema e DESCARTADO EM SILENCIO —
 * que e o modo de falha que este repo persegue.
 *
 * Trocar a chave resolve pela raiz: o projeto antigo continua no `localStorage`,
 * intacto, e simplesmente nunca mais e procurado. Nada e descartado porque nada
 * e tentado. As chaves v1 e v2 sairam pelo mesmo motivo, junto com a cadeia de
 * migracao que as lia.
 * ============================================================================
 */
const STORAGE_KEY = 'vislow:project:v5';
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
 * Le o projeto salvo.
 *
 * Uma spec invalida na PROPRIA chave — storage adulterado, ou um app mais novo
 * que gravou ali — e descartada: e melhor comecar limpo do que abrir num estado
 * que nao valida e bloqueia o export. Isso agora e um caso de borda de verdade,
 * e nao mais o caminho normal de todo projeto salvo, porque nao ha conversao
 * nenhuma acontecendo aqui.
 *
 * `unknown`, e nao `VisualSpec`, na entrada de `validateSpec`: o que sai do
 * `localStorage` e texto de origem desconhecida, e tipa-lo como spec seria
 * afirmar antes de conferir — o unico efeito seria calar o compilador no lugar
 * exato onde a conferencia acontece.
 */
export function loadProject(): VisualSpec | null {
  if (typeof window === 'undefined') return null;

  try {
    const stored = readJson(STORAGE_KEY);
    if (stored === null) return null;
    const result = validateSpec(stored);
    return result.kind === 'valid' ? result.spec : null;
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
