import { $, component$, type QRL } from "@builder.io/qwik";
import { PHYSICAL_LABELS } from "../data";
import type { ServiceRecord, SiteRecord } from "../types";
import type { LayoutCheck } from "../utils";

interface OnSiteProps {
  service: ServiceRecord;
  site: SiteRecord;
  layout: LayoutCheck;
  onUpdate$: QRL<(label: string, fn: (site: SiteRecord) => void) => void>;
}

/** 现场那份：只维护实测尺寸、安装位置和实物状态；译文只读，排不下就退回重核。 */
export const OnSite = component$((props: OnSiteProps) => {
  const update: QRL<(label: string, patch: (site: SiteRecord) => void) => void> = $((label, patch) => {
    props.onUpdate$(label, (site) => {
      patch(site);
      site.updatedAt = new Date().toISOString();
    });
  });

  const numberField = (label: string, value: number, field: keyof SiteRecord) => (
    <label class="form-control">
      <span class="label-text mb-1 text-xs font-bold text-slate-500">{label}</span>
      <div class="join">
        <input
          type="number"
          class="input input-bordered join-item w-full"
          value={value}
          min={0}
          onInput$={(_, element) => update(`修改${label}`, (site) => {
            (site[field] as number) = Number(element.value);
          })}
        />
        <span class="join-item bg-slate-100 px-3 text-xs text-slate-500">mm 实测</span>
      </div>
    </label>
  );

  return (
    <div class="space-y-5">
      <section class="card border border-slate-200 bg-white shadow-sm">
        <div class="card-body gap-4 p-5">
          <div class="flex items-center justify-between">
            <div>
              <div class="text-xs font-bold uppercase tracking-[0.16em] text-slate-400">On-site</div>
              <h2 class="font-bold">实测尺寸与实物状态</h2>
            </div>
            <span class="badge badge-outline font-mono">{props.site.code}</span>
          </div>

          <div class="alert alert-info py-2 text-xs">
            <span>尺寸由现场安装班组实测，服务中心只读；排不下时退回重核，不缩字号、不改数字。</span>
          </div>

          <div class="grid grid-cols-2 gap-4">
            <label class="form-control">
              <span class="label-text mb-1 text-xs font-bold text-slate-500">安装位置</span>
              <input
                class="input input-bordered"
                value={props.site.position}
                onInput$={(_, element) => update("修改安装位置", (site) => { site.position = element.value; })}
              />
            </label>
            <label class="form-control">
              <span class="label-text mb-1 text-xs font-bold text-slate-500">实物状态</span>
              <select
                class="select select-bordered"
                value={props.site.physicalStatus}
                onChange$={(_, element) => update("更新实物状态", (site) => { site.physicalStatus = element.value as SiteRecord["physicalStatus"]; })}
              >
                {(["unmeasured", "measured", "producing", "installed", "accepted", "damaged"] as SiteRecord["physicalStatus"][]).map((status) => (
                  <option key={status} value={status}>{PHYSICAL_LABELS[status]}</option>
                ))}
              </select>
            </label>
          </div>

          <div class="grid grid-cols-2 gap-4">
            {numberField("牌面宽度", props.site.faceWidth, "faceWidth")}
            {numberField("牌面高度", props.site.faceHeight, "faceHeight")}
            {numberField("可印区域宽度", props.site.printableWidth, "printableWidth")}
            {numberField("可印区域高度", props.site.printableHeight, "printableHeight")}
          </div>
          {numberField("最小可读字号", props.site.minFontSize, "minFontSize")}
        </div>
      </section>

      <section class="card border border-slate-200 bg-white shadow-sm">
        <div class="card-body gap-3 p-5">
          <div class="flex items-center justify-between">
            <div>
              <div class="text-xs font-bold uppercase tracking-[0.16em] text-blue-500">Read-only</div>
              <h2 class="font-bold">服务中心译文（只读）</h2>
            </div>
            <span class="badge badge-ghost">{props.service.targetLanguage}</span>
          </div>
          <p class="whitespace-pre-line rounded-xl bg-slate-50 p-4 text-lg font-black leading-snug text-slate-900">
            {props.service.targetText}
          </p>
          <p class="text-xs text-slate-500">原文：{props.service.sourceText}</p>
        </div>
      </section>

      <section class={`card border shadow-sm ${props.layout.returnForReview ? "border-error" : "border-success"}`}>
        <div class="card-body p-5">
          <div class="flex items-center justify-between">
            <h2 class="font-bold">版面校核（以实测可印区域为准）</h2>
            <span class={`badge ${props.layout.returnForReview ? "badge-error" : "badge-success"}`}>
              {props.layout.returnForReview ? "退回重核" : "可印"}
            </span>
          </div>
          <div class="grid grid-cols-3 gap-2 text-center text-xs">
            <div class="rounded-lg bg-slate-100 p-2"><strong class="block text-lg">{props.layout.linesNeeded}</strong><span>译文所需行数</span></div>
            <div class="rounded-lg bg-slate-100 p-2"><strong class="block text-lg">{props.layout.linesCapacity}</strong><span>可印行数</span></div>
            <div class="rounded-lg bg-slate-100 p-2"><strong class="block text-lg">{props.site.minFontSize}</strong><span>最小字号 mm</span></div>
          </div>
          {props.layout.returnForReview ? (
            <div class="alert alert-error py-2 text-xs">
              <span>
                这块牌子按实测可印区域排不下（{props.layout.tooManyLines ? `需 ${props.layout.linesNeeded} 行 / 可印 ${props.layout.linesCapacity} 行` : "单行超宽"}）。
                已退回服务中心重核；现场尺寸未改动，也不会自动缩小字号。
              </span>
            </div>
          ) : (
            <p class="text-xs text-success">译文可在实测可印区域内排下，且不小于最小可读字号。</p>
          )}
        </div>
      </section>
    </div>
  );
});
