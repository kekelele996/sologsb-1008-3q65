import { component$, type QRL } from "@builder.io/qwik";
import { PHYSICAL_LABELS, STATUS_LABELS } from "../data";
import type { ServiceRecord, SiteRecord } from "../types";
import { layoutCheck } from "../utils";

interface SignListProps {
  site: SiteRecord[];
  service: ServiceRecord[];
  activeId: string;
  view: "service" | "site";
  onSelect$: QRL<(id: string) => void>;
}

function statusClass(status: ServiceRecord["status"]) {
  if (status === "confirmed") return "badge-success";
  if (status === "changes") return "badge-error";
  if (status === "pending") return "badge-warning";
  return "badge-neutral";
}

function physicalClass(status: SiteRecord["physicalStatus"]) {
  if (status === "accepted") return "badge-success";
  if (status === "installed") return "badge-info";
  if (status === "producing") return "badge-warning";
  if (status === "damaged") return "badge-error";
  return "badge-neutral";
}

/** 两边共用的标识清单：服务中心看审校与退回重核，现场看实测与实物状态。 */
export const SignList = component$((props: SignListProps) => {
  return (
    <div class="space-y-2">
      {props.service.map((service) => {
        const site = props.site.find((item) => item.signId === service.signId);
        const active = service.signId === props.activeId;
        const fit = site ? layoutCheck(site, service) : null;
        return (
          <button
            key={service.signId}
            class={`w-full rounded-xl border p-3 text-left transition ${active ? "border-blue-400 bg-blue-50 shadow-sm" : "border-slate-200 bg-white hover:border-slate-300"}`}
            onClick$={() => props.onSelect$(service.signId)}
          >
            <div class="flex items-center justify-between gap-2">
              <span class="font-mono text-xs font-bold text-slate-500">{service.code}</span>
              {props.view === "service" ? (
                <span class={`badge badge-sm ${statusClass(service.status)}`}>{STATUS_LABELS[service.status]}</span>
              ) : (
                <span class={`badge badge-sm ${site ? physicalClass(site.physicalStatus) : "badge-neutral"}`}>
                  {site ? PHYSICAL_LABELS[site.physicalStatus] : "未实测"}
                </span>
              )}
            </div>
            <div class="mt-2 line-clamp-2 text-sm font-semibold text-slate-700">{service.sourceText}</div>
            <div class="mt-2 flex items-center justify-between gap-2 text-[11px] text-slate-500">
              <span>{service.targetLanguage}</span>
              {props.view === "service" ? (
                fit?.returnForReview ? (
                  <span class="font-bold text-error">退回重核</span>
                ) : (
                  <span class="text-success">可印</span>
                )
              ) : (
                <span class="font-mono">
                  {site ? `${site.faceWidth}×${site.faceHeight}mm` : "—"}
                </span>
              )}
            </div>
            {props.view === "service" && service.dispatchStatus === "failed" && (
              <div class="mt-1 text-[11px] font-bold text-warning">下发失败 · 可重试</div>
            )}
            {props.view === "service" && service.dispatchStatus === "dispatched" && (
              <div class="mt-1 text-[11px] text-success">已下发</div>
            )}
          </button>
        );
      })}
    </div>
  );
});
