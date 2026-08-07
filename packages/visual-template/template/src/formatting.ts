import type powerbi from 'powerbi-visuals-api';

type VisualUpdateOptions = powerbi.extensibility.visual.VisualUpdateOptions;
type FormattingModel = powerbi.visuals.FormattingModel;
type FormattingCard = powerbi.visuals.FormattingCard;
type FormattingSlice = powerbi.visuals.FormattingSlice;
type FormattingDescriptor = powerbi.visuals.FormattingDescriptor;
type IEnumMember = powerbi.IEnumMember;

// STRING, nunca booleano: o `pbiviz` compila sem `strictNullChecks` e nao estreita por discriminante booleano.
export type ExposedKind = 'text' | 'length' | 'number' | 'token' | 'select' | 'color' | 'boolean';

export type ExposedValue = string | number | boolean;

export interface ExposedOption {
  value: string;
  label: string;
}

export interface ExposedField {
  key: string;
  label: string;
  kind: ExposedKind;
  min?: number;
  max?: number;
  maxLength?: number;
  options?: ExposedOption[];
  group?: string;
  showWhen?: { key: string; equals: string };
}

export interface ExposedNode {
  id: string;
  title: string;
  values: Record<string, ExposedValue>;
  fields: ExposedField[];
}

export type FormattingSpec = ExposedNode[];

export type Overrides = Record<string, Record<string, ExposedValue>>;

const COLOR_REGEX = /^#[0-9a-fA-F]{6}$/;

// `const enum` de arquivo de declaracao some do JS emitido: usar em posicao de VALOR quebraria o bundle.
const MIN_VALIDATOR = 0 as powerbi.visuals.ValidatorType.Min;
const MAX_VALIDATOR = 1 as powerbi.visuals.ValidatorType.Max;

function currentValue(
  node: ExposedNode,
  overrides: Overrides,
  key: string,
): ExposedValue | undefined {
  const override = overrides[node.id]?.[key];
  return override === undefined ? node.values[key] : override;
}

/** Tipo errado e recusado; valor fora de FAIXA e prendido. O host ja limita a faixa, entao so um valor forjado chega fora dela. */
function coerce(raw: unknown, field: ExposedField): ExposedValue | undefined {
  switch (field.kind) {
    case 'color': {
      const wrapped = raw as { solid?: { color?: unknown } } | null;
      const color = wrapped?.solid === undefined ? raw : wrapped.solid.color;
      return typeof color === 'string' && COLOR_REGEX.test(color) ? color : undefined;
    }

    case 'boolean':
      return typeof raw === 'boolean' ? raw : undefined;

    case 'text': {
      if (typeof raw !== 'string') return undefined;
      return field.maxLength === undefined ? raw : raw.slice(0, field.maxLength);
    }

    case 'length':
    case 'number': {
      if (typeof raw !== 'number' || !Number.isFinite(raw)) return undefined;
      const rounded = field.kind === 'length' ? Math.round(raw) : raw;
      const floor = field.min === undefined ? rounded : Math.max(rounded, field.min);
      return field.max === undefined ? floor : Math.min(floor, field.max);
    }

    case 'token':
    case 'select':
      if (typeof raw !== 'string') return undefined;
      return (field.options ?? []).some((option) => option.value === raw) ? raw : undefined;
  }
}

/** Chegam em `dataViews[0].metadata.objects` — e sem `supportsEmptyDataView` nunca chegam com `dataRoles: []`. */
export function readOverrides(options: VisualUpdateOptions, spec: FormattingSpec): Overrides {
  const objects = options.dataViews?.[0]?.metadata.objects;
  if (!objects) return {};

  const out: Overrides = {};

  for (const node of spec) {
    const stored = objects[node.id];
    if (!stored) continue;

    const accepted: Record<string, ExposedValue> = {};
    let any = false;

    for (const field of node.fields) {
      const value = coerce(stored[field.key], field);
      if (value === undefined) continue;
      accepted[field.key] = value;
      any = true;
    }

    if (any) out[node.id] = accepted;
  }

  return out;
}

export function pick<T extends ExposedValue>(
  overrides: Overrides,
  nodeId: string,
  key: string,
  authored: T,
): T {
  const value = overrides[nodeId]?.[key];
  return typeof value === typeof authored ? (value as T) : authored;
}

function descriptorFor(nodeId: string, key: string): FormattingDescriptor {
  return { objectName: nodeId, propertyName: key };
}

function sliceFor(
  node: ExposedNode,
  field: ExposedField,
  value: ExposedValue | undefined,
): FormattingSlice {
  const uid = `${node.id}-${field.key}`;
  const descriptor = descriptorFor(node.id, field.key);

  switch (field.kind) {
    case 'color':
      return {
        uid,
        displayName: field.label,
        control: {
          type: 'ColorPicker',
          properties: { descriptor, value: { value: String(value) } },
        },
      };

    case 'boolean':
      return {
        uid,
        displayName: field.label,
        control: { type: 'ToggleSwitch', properties: { descriptor, value: value === true } },
      };

    case 'text':
      return {
        uid,
        displayName: field.label,
        control: {
          type: 'TextInput',
          properties: { descriptor, value: String(value), placeholder: '' },
        },
      };

    case 'length':
    case 'number': {
      const options: powerbi.visuals.NumUpDownFormat = {};
      if (field.kind === 'length') options.unitSymbol = 'px';
      if (field.min !== undefined) options.minValue = { type: MIN_VALIDATOR, value: field.min };
      if (field.max !== undefined) options.maxValue = { type: MAX_VALIDATOR, value: field.max };

      return {
        uid,
        displayName: field.label,
        control: {
          type: 'NumUpDown',
          properties: { descriptor, value: Number(value), options },
        },
      };
    }

    case 'token':
    case 'select': {
      const items: IEnumMember[] = (field.options ?? []).map((option) => ({
        value: option.value,
        displayName: option.label,
      }));
      const selected = items.find((item) => item.value === value);

      return {
        uid,
        displayName: field.label,
        control: {
          type: 'Dropdown',
          properties: {
            descriptor,
            value: selected ?? { value: String(value), displayName: String(value) },
            items,
          },
        },
      };
    }
  }
}

function isVisible(node: ExposedNode, overrides: Overrides, field: ExposedField): boolean {
  const showWhen = field.showWhen;
  if (!showWhen) return true;
  return String(currentValue(node, overrides, showWhen.key)) === showWhen.equals;
}

export function buildFormattingModel(spec: FormattingSpec, overrides: Overrides): FormattingModel {
  const cards: FormattingCard[] = [];

  for (const node of spec) {
    const sections: { name: string; slices: FormattingSlice[] }[] = [];

    for (const field of node.fields) {
      if (!isVisible(node, overrides, field)) continue;
      const name = field.group ?? '';
      let section = sections.filter((candidate) => candidate.name === name)[0];
      if (!section) {
        section = { name, slices: [] };
        sections.push(section);
      }
      section.slices.push(sliceFor(node, field, currentValue(node, overrides, field.key)));
    }

    if (sections.length === 0) continue;

    cards.push({
      uid: node.id,
      displayName: node.title,
      groups: sections.map((section) => ({
        uid: section.name === '' ? `${node.id}-group` : `${node.id}-group-${section.name}`,
        displayName: section.name,
        suppressDisplayName: section.name === '',
        slices: section.slices,
      })),
      revertToDefaultDescriptors: node.fields.map((field) => descriptorFor(node.id, field.key)),
    });
  }

  return { cards };
}
