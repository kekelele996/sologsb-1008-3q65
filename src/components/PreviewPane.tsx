import { component$, type Signal } from "@builder.io/qwik";
import type { DiffToken, ServiceRecord } from "../types";
import { analyzeSign, type LayoutCheck } from "../utils";

interface PreviewPaneProps {
  service: ServiceRecord;
  layout: LayoutCheck;
  previewWidth: Signal<number>;
  previewFont: Signal<number>;
  selectedVersionId: Signal<string>;
  versions: ServiceRecord["versions"];
  comparison: DiffToken[];
}

const WIDTHS = [320, 480, 720, 960] as const;

/** 右侧版面预览与版本比较；是否可印以现场实测校核为准（本面板不决定退回）。 */
export const PreviewPane = component$((props: PreviewPaneProps) => {
  const service = props.service;
  const preview = analyzeSign(service, props.previewWidth.value, props.previewFont.value);
  const layout = props.layout;

  return (
    <section class="sticky top-4 space-y-4">
      <div class="card border border-slate-200 bg-white shadow-sm">
        <div class="card-body p-4">
          <div class="flex items-center justify-between">
            <div><div class="text-xs font-bold uppercase tracking-[0.16em] text-slate-400">Live Preview</div><h2 class="font-bold">版面实时预览</h2></div>
            <span class={`badge ${layout.returnForReview ? "badge-error" : "badge-success"}`}>
              {layout.returnForReview ? "退回重核" : "实测可印"}
            </span>
          </div>
          <div class="mt-3 flex gap-1">
            {WIDTHS.map((width) => (
              <button key={width} class={`btn btn-xs flex-1 ${props.previewWidth.value === width ? "btn-primary" : "btn-outline"}`} onClick$={() => props.previewWidth.value = width}>{width}px</button>
            ))}
          </div>
          <div class="mt-2 flex items-center gap-3 text-xs">
            <span class="w-20">字号 {props.previewFont.value}px</span>
            <input type="range" min="28" max="88" step="2" class="range range-primary range-xs flex-1" value={props.previewFont.value} onInput$={(_, element) => props.previewFont.value = Number(element.value)} />
          </div>
          <div class="mt-4 overflow-hidden rounded-xl bg-slate-800 p-3">
            <div class="mx-auto grid min-h-48 place-items-center overflow-hidden border-4 border-white bg-[#174f3d] p-3 text-center text-white" style={{ width: `${props.previewWidth.value}px`, maxWidth: "100%" }}>
              <div>
                <div style={{ fontSize: `${props.previewFont.value}px` }} class="font-black leading-[1.18] tracking-wide">
                  {preview.visible.map((line, index) => <div key={index}>{line || " "}</div>)}
                </div>
              </div>
            </div>
          </div>
          <div class="mt-3 grid grid-cols-3 gap-2 text-center text-xs">
            <div class="rounded-lg bg-slate-100 p-2"><strong class="block text-lg">{preview.lines.length}</strong><span>预计行数</span></div>
            <div class="rounded-lg bg-slate-100 p-2"><strong class="block text-lg">{service.targetText.length}</strong><span>字符数</span></div>
            <div class="rounded-lg bg-slate-100 p-2"><strong class={`block text-lg ${layout.missingTerms.length ? "text-error" : "text-success"}`}>{layout.missingTerms.length}</strong><span>缺失术语</span></div>
          </div>
          {layout.returnForReview && (
            <div class="alert alert-error mt-3 py-2 text-xs">
              现场实测可印区域排不下（{layout.linesNeeded}/{layout.linesCapacity} 行），已退回重核；未自动缩字号。
            </div>
          )}
        </div>
      </div>

      <div class="card border border-slate-200 bg-white shadow-sm">
        <div class="card-body p-4">
          <div class="flex items-center justify-between">
            <div><h2 class="font-bold">版本比较</h2><p class="text-xs text-slate-500">旧版快照与当前译文逐词对比。</p></div>
            <span class="badge badge-outline">{props.versions.length} 版</span>
          </div>
          {props.versions.length ? (
            <>
              <select
                class="select select-sm select-bordered mt-3 w-full"
                value={props.selectedVersionId.value || props.versions[0].id}
                onChange$={(_, element) => props.selectedVersionId.value = element.value}
              >
                {props.versions.map((version) => <option key={version.id} value={version.id}>{`${version.label} · ${new Date(version.createdAt).toLocaleTimeString()}`}</option>)}
              </select>
              <div class="mt-3 rounded-lg bg-slate-900 p-3 text-sm leading-7 text-slate-100">
                {props.comparison.map((token, index) => (
                  <span key={index} class={token.type === "add" ? "rounded bg-green-400/25 text-green-200" : token.type === "remove" ? "bg-red-400/25 text-red-200 line-through" : ""}>{token.value}</span>
                ))}
              </div>
              <div class="mt-2 flex gap-3 text-[11px]"><span class="text-green-700">绿：新增</span><span class="text-red-700">红：删除</span></div>
            </>
          ) : (
            <div class="mt-3 rounded-xl border border-dashed p-5 text-center text-xs text-slate-400">保存当前译文后会在这里生成可比较版本。</div>
          )}
        </div>
      </div>

      <div class="rounded-xl bg-[#17324d] p-4 text-xs text-slate-200">
        <div class="mb-2 font-bold text-white">键盘操作</div>
        <div class="grid grid-cols-2 gap-y-1"><span><kbd class="kbd kbd-xs">J/K</kbd> 切换标识</span><span><kbd class="kbd kbd-xs">[ ]</kbd> 预览宽度</span><span><kbd class="kbd kbd-xs">- =</kbd> 字号</span><span><kbd class="kbd kbd-xs">Ctrl/⌘ Z</kbd> 撤销</span></div>
      </div>
    </section>
  );
});
