"use strict";

import powerbi from "powerbi-visuals-api";
import "./../style/generated.css";   // CSS pre-compilado pelo CLI do Tailwind v4

import VisualConstructorOptions = powerbi.extensibility.visual.VisualConstructorOptions;
import VisualUpdateOptions = powerbi.extensibility.visual.VisualUpdateOptions;
import IVisual = powerbi.extensibility.visual.IVisual;

// ---------------------------------------------------------------------------
// CONTRATO DE PLACEHOLDER  (§8.2 do documento)
// Estes literais sao substituidos no momento do export.
// ---------------------------------------------------------------------------
const VISLOW_CONFIG_B64 = "__VISLOW_CONFIG_B64__";
const VISLOW_SELFTEST_GUID = "__VISLOW_SELFTEST_GUID__";

// Base64 padrao (A-Za-z0-9+/=) NUNCA contem "_"; o placeholder e cheio deles.
// Esta checagem nao cria uma segunda ocorrencia literal do token no bundle e
// nao pode ser dobrada pelo minificador numa copia do placeholder.
const IS_PATCHED = VISLOW_CONFIG_B64.indexOf("_") === -1;

interface SpikeConfig {
    title: string;
    accentColor: string;
    surfaceColor: string;
}

const FALLBACK: SpikeConfig = {
    title: "[NAO PATCHEADO] pacote base",
    accentColor: "#94a3b8",
    surfaceColor: "#f8fafc",
};

function decodeUtf8Base64(b64: string): string {
    const bin = atob(b64);
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
    return new TextDecoder().decode(bytes);
}

function readEmbeddedConfig(): { config: SpikeConfig; patched: boolean; error?: string } {
    if (!IS_PATCHED) return { config: FALLBACK, patched: false };
    try {
        const parsed = JSON.parse(decodeUtf8Base64(VISLOW_CONFIG_B64));
        return { config: { ...FALLBACK, ...parsed }, patched: true };
    } catch (e) {
        return { config: FALLBACK, patched: false, error: String(e) };
    }
}

function el(tag: string, style: string, text?: string): HTMLElement {
    const node = document.createElement(tag);
    node.setAttribute("style", style);
    if (text !== undefined) node.appendChild(document.createTextNode(text));
    return node;
}

export class Visual implements IVisual {
    private target: HTMLElement;
    private config: SpikeConfig;
    private patched: boolean;
    private configError?: string;

    constructor(options: VisualConstructorOptions) {
        this.target = options.element;
        const r = readEmbeddedConfig();
        this.config = r.config;
        this.patched = r.patched;
        this.configError = r.error;
    }

    public update(options: VisualUpdateOptions) {
        const dv = options.dataViews && options.dataViews[0];
        const cat = dv?.categorical?.categories?.[0];
        const val = dv?.categorical?.values?.[0];

        const rows: Array<{ label: string; value: number }> = [];
        if (cat && val) {
            for (let i = 0; i < cat.values.length; i++) {
                rows.push({ label: String(cat.values[i]), value: Number(val.values[i]) || 0 });
            }
        }
        const max = rows.reduce((m, r) => Math.max(m, r.value), 0);

        // Renderizacao deliberadamente crua e sem innerHTML (proibido pelo lint
        // oficial do pbiviz). O que esta sob teste e a INJECAO, nao o componente.
        while (this.target.firstChild) this.target.removeChild(this.target.firstChild);

        const root = el(
            "div",
            `font-family:Segoe UI,system-ui,sans-serif;height:100%;box-sizing:border-box;` +
                `padding:16px;background:${this.config.surfaceColor};overflow:auto`
        );

        const head = el("div", "display:flex;align-items:center;justify-content:space-between;margin-bottom:12px");
        head.appendChild(el("h2", "margin:0;font-size:16px;font-weight:700;color:#0f172a", this.config.title));
        head.appendChild(
            el(
                "span",
                `background:${this.patched ? "#16a34a" : "#dc2626"};color:#fff;padding:2px 8px;` +
                    `border-radius:99px;font-size:11px;white-space:nowrap`,
                this.patched ? "CONFIG INJETADA" : this.configError ? "CONFIG INVALIDA" : "SEM CONFIG"
            )
        );
        root.appendChild(head);

        if (rows.length === 0) {
            root.appendChild(
                el(
                    "div",
                    "color:#64748b;font-size:13px;padding:16px 0",
                    "Arraste um campo para Categoria e outro para Valor."
                )
            );
        } else {
            for (const r of rows) {
                const line = el("div", "display:flex;align-items:center;gap:8px;margin-bottom:6px");
                line.appendChild(
                    el(
                        "div",
                        "width:110px;font-size:12px;color:#475569;overflow:hidden;" +
                            "text-overflow:ellipsis;white-space:nowrap",
                        r.label
                    )
                );
                const track = el("div", "flex:1;background:#e2e8f0;border-radius:4px;overflow:hidden");
                track.appendChild(
                    el(
                        "div",
                        `width:${max > 0 ? (r.value / max) * 100 : 0}%;height:18px;` +
                            `background:${this.config.accentColor}`
                    )
                );
                line.appendChild(track);
                line.appendChild(
                    el("div", "width:90px;text-align:right;font-size:12px;color:#0f172a", r.value.toLocaleString())
                );
                root.appendChild(line);
            }
        }

        root.appendChild(
            el(
                "div",
                "margin-top:12px;font-size:10px;color:#94a3b8;word-break:break-all",
                `guid no bundle: ${VISLOW_SELFTEST_GUID} · ${rows.length} categoria(s)`
            )
        );

        this.target.appendChild(root);
    }
}
