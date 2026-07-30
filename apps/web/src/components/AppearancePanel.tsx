'use client';

import type { VisualConfig } from '@vislow/config-schema';
import { CONTROL_GROUPS, tokenOptions, type Field, type Group } from '@/lib/controls';
import { useEditorStore } from '@/store/useEditorStore';
import { ColorField, SelectField, TextField, ToggleField } from './controls/Field';

type Section = Record<string, unknown>;

function FieldControl({ group, field, config }: { group: Group; field: Field; config: VisualConfig }) {
  const mutate = useEditorStore((s) => s.mutate);
  const section = config[group.section] as Section | undefined;
  if (!section) return null;

  const set = (value: unknown) => {
    mutate((draft) => {
      const target = draft[group.section] as Section | undefined;
      if (target) target[field.key] = value;
    });
  };

  const common = { label: field.label, hint: field.hint };

  switch (field.kind) {
    case 'token':
      return (
        <SelectField
          {...common}
          value={String(section[field.key])}
          options={tokenOptions(field.token)}
          onChange={set}
        />
      );
    case 'color':
      return <ColorField {...common} value={String(section[field.key])} onChange={set} />;
    case 'boolean':
      return <ToggleField {...common} value={Boolean(section[field.key])} onChange={set} />;
    case 'text':
      return <TextField {...common} value={String(section[field.key])} onChange={set} />;
  }
}

export function AppearancePanel() {
  const config = useEditorStore((s) => s.config);
  const issues = useEditorStore((s) => s.issues);

  const visible = CONTROL_GROUPS.filter(
    (g) => g.onlyFor === undefined || g.onlyFor === config.chartType,
  );

  return (
    <aside className="flex h-full w-80 shrink-0 flex-col border-l border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
      <div className="border-b border-slate-200 px-4 py-3 dark:border-slate-700">
        <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-100">Aparencia</h2>
      </div>

      <div className="flex-1 overflow-y-auto px-4 pb-6">
        {visible.map((group) => (
          <section key={group.title} className="border-b border-slate-100 py-3 dark:border-slate-800">
            <h3 className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
              {group.title}
            </h3>
            {group.fields.map((field) => (
              <FieldControl key={field.key} group={group} field={field} config={config} />
            ))}
          </section>
        ))}
      </div>

      {issues.length > 0 && (
        <div
          role="alert"
          className="border-t border-red-200 bg-red-50 px-4 py-3 text-xs dark:border-red-900 dark:bg-red-950"
        >
          <div className="font-semibold text-red-700 dark:text-red-300">
            Configuracao invalida — export bloqueado
          </div>
          <ul className="mt-1 space-y-0.5 text-red-600 dark:text-red-400">
            {issues.slice(0, 5).map((i, n) => (
              <li key={`${i.path}-${String(n)}`}>
                <code>{i.path}</code>: {i.message}
              </li>
            ))}
          </ul>
        </div>
      )}
    </aside>
  );
}
