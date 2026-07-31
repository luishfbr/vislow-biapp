'use client';

import { useEffect } from 'react';
import { Header } from '@/components/Header';
import { PreviewCanvas } from '@/components/PreviewCanvas';
import { ProjectPanel } from '@/components/ProjectPanel';
import { PropertiesPanel } from '@/components/PropertiesPanel';
import { useEditorStore } from '@/store/useEditorStore';

export default function EditorPage() {
  const hydrate = useEditorStore((s) => s.hydrate);
  const hydrated = useEditorStore((s) => s.hydrated);

  // A leitura do localStorage acontece so no cliente: fazer no render causaria
  // divergencia de hidratacao com o HTML gerado no build estatico.
  useEffect(() => {
    hydrate();
  }, [hydrate]);

  return (
    <div className="flex h-full flex-col">
      <Header />
      {hydrated ? (
        <div className="flex min-h-0 flex-1">
          <ProjectPanel />
          <PreviewCanvas />
          <PropertiesPanel />
        </div>
      ) : (
        // Os paineis esperam a hidratacao junto com o canvas: montar a paleta e
        // a arvore sobre a spec inicial e troca-las logo depois faria a selecao
        // saltar sozinha na primeira interacao.
        <main className="flex flex-1 items-center justify-center text-sm text-slate-400">
          Carregando projeto...
        </main>
      )}
    </div>
  );
}
