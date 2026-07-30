'use client';

import { useEffect } from 'react';
import { AppearancePanel } from '@/components/AppearancePanel';
import { Header } from '@/components/Header';
import { PreviewCanvas } from '@/components/PreviewCanvas';
import { ProjectPanel } from '@/components/ProjectPanel';
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
      <div className="flex min-h-0 flex-1">
        <ProjectPanel />
        {hydrated ? (
          <PreviewCanvas />
        ) : (
          <main className="flex flex-1 items-center justify-center text-sm text-slate-400">
            Carregando projeto...
          </main>
        )}
        <AppearancePanel />
      </div>
    </div>
  );
}
