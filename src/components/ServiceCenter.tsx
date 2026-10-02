import { component$, type QRL, type Signal } from "@builder.io/qwik";
import { DISPATCH_LABELS, STATUS_LABELS } from "../data";
import type { DiffToken, ReviewStatus, ServiceRecord, SiteRecord } from "../types";
import { analyzeSign, type LayoutCheck } from "../utils";

interface ServiceCenterProps {
  service: ServiceRecord;
  site: SiteRecord | undefined;
  layout: LayoutCheck;
  previewWidth: Signal<number>;
  previewFont: Signal<number>;
  termSource: Signal<string>;
  termTarget: Signal<string>;
  commentDraft: Signal<string>;
  replyDraft: Signal<string>;
  replyingTo: Signal<string>;
  selectedVersionId: Signal<string>;
  versions: ServiceRecord["versions"];
  comparison: DiffToken[];
  onUpdate$: QRL<(label: string, fn: (draft: ServiceRecord) => void) => void>;
  onSetStatus$: QRL<(status: ReviewStatus) => void>;
  onToggleEmergency$: QRL<() => void>;
  onSaveVersion$: QRL<() => void>;
  onAddTerm$: QRL<() => void>;
  onDeleteTerm$: QRL<(id: string) => void>;
  onToggleTerm$: QRL<(id: string) => void>;
  onAddComment$: QRL<() => void>;
  onAddReply$: QRL<(commentId: string) => void>;
  onToggleComment$: QRL<(commentId: string) => void>;
  onDispatch$: QRL<() => void>;
  onSharePreview$: QRL<() => void>;
}

const WIDTHS = [320, 480, 720, 960] as const;

function statusClass(status: ReviewStatus) {
  if (status === "confirmed") return "badge-success";
  if (status === "changes") return "badge-error";
  if (status === "pending") return "badge-warning";
  return "badge-neutral";
}

/** 服务中心那份：只管译文、术语、审校结论与下发；尺寸以现场实测为准。 */
export const ServiceCenter = component$((props: ServiceCenterProps) => {
  const service = props.service;
  const preview = analyzeSign(service, props.previewWidth.value, props.previewFont.value);
  const dispatch = service.dispatchStatus;

  return (
    <div class="space-y-5">
      {props.layout.returnForReview && (
        <div class="alert alert-error py-2 text-xs">
          <span>
            <strong>退回重核</strong>：{service.code} 按现场实测可印区域排不下
            （{props.layout.tooManyLines ? `需 ${props.layout.linesNeeded} 行 / 可印 ${props.layout.linesCapacity} 行` : "单行超宽"}）。
            已退回服务中心重核——未自动缩小字号，现场尺寸未改动。
          </span>
        </div>
      )}

      <section class="card border border-slate-200 bg-white shadow-sm">
        <div class="card-body gap-4 p-5">
          <div class="flex items-center justify-between">
            <div><div class="text-xs font-bold uppercase tracking-[0.16em] text-slate-400">Source</div><h2 class="font-bold">中文原文</h2></div>
            <span class="badge badge-ghost">简体中文</span>
          </div>
          <textarea
            class="textarea textarea-bordered min-h-24 w-full text-base leading-7"
            value={service.sourceText}
            onInput$={(_, element) => props.onUpdate$("修改中文原文", (draft) => { draft.sourceText = element.value; draft.status = "draft"; })}
          />
        </div>
      </section>

      <section class="card border border-slate-200 bg-white shadow-sm">
        <div class="card-body gap-4 p-5">
          <div class="grid grid-cols-2 gap-4">
            <label class="form-control">
              <span class="label-text mb-1 text-xs font-bold text-slate-500">目标语言</span>
              <select
                class="select select-bordered"
                value={service.targetLanguage}
                onChange$={(_, element) => props.onUpdate$("修改目标语言", (draft) => { draft.targetLanguage = element.value; draft.status = "pending"; })}
              >
                {["English", "日本語", "Français", "Deutsch", "한국어", "Español"].map((language) => <option key={language}>{language}</option>)}
              </select>
            </label>
            <label class="form-control">
              <span class="label-text mb-1 text-xs font-bold text-slate-500">适用场景</span>
              <input
                class="input input-bordered"
                value={service.scenario}
                onInput$={(_, element) => props.onUpdate$("修改适用场景", (draft) => { draft.scenario = element.value; })}
              />
            </label>
          </div>
          <label class="form-control">
            <span class="label-text mb-1 text-xs font-bold text-slate-500">法规或规范提示</span>
            <input
              class="input input-bordered"
              value={service.regulation}
              onInput$={(_, element) => props.onUpdate$("修改法规提示", (draft) => { draft.regulation = element.value; })}
            />
          </label>
          <div class="divider my-0"></div>
          <div class="flex items-center justify-between">
            <div><div class="text-xs font-bold uppercase tracking-[0.16em] text-blue-500">Target</div><h2 class="font-bold">目标语言译文</h2></div>
            <button class="btn btn-sm btn-outline" onClick$={props.onSaveVersion$}>保存版本快照</button>
          </div>
          <textarea
            class="textarea textarea-bordered min-h-36 w-full text-lg leading-8"
            value={service.targetText}
            onInput$={(_, element) => props.onUpdate$("修改译文", (draft) => { draft.targetText = element.value; draft.status = draft.emergencyRevision ? "changes" : "pending"; })}
          />
          <div class="flex flex-wrap gap-2">
            {service.terms.map((term) => {
              const matched = service.targetText.toLocaleLowerCase().includes(term.target.toLocaleLowerCase());
              return (
                <button
                  key={term.id}
                  title="点击切换术语确认状态"
                  class={`badge badge-lg gap-1 ${matched && term.confirmed ? "badge-success" : matched ? "badge-warning" : "badge-error"}`}
                  onClick$={() => props.onToggleTerm$(term.id)}
                >
                  {term.source} → {term.target} {matched ? (term.confirmed ? "✓" : "!") : "×"}
                </button>
              );
            })}
          </div>
        </div>
      </section>

      <section class="card border border-slate-200 bg-white shadow-sm">
        <div class="card-body p-5">
          <div class="flex items-center justify-between">
            <div><h2 class="font-bold">术语绑定</h2><p class="text-xs text-slate-500">必选术语未出现在译文中时会实时告警。</p></div>
            <span class="badge badge-outline">{service.terms.length} 条</span>
          </div>
          <div class="mt-4 grid grid-cols-[1fr_1fr_auto] gap-2">
            <input class="input input-sm input-bordered" placeholder="中文术语" value={props.termSource.value} onInput$={(_, element) => props.termSource.value = element.value} />
            <input class="input input-sm input-bordered" placeholder="目标语言固定译法" value={props.termTarget.value} onInput$={(_, element) => props.termTarget.value = element.value} />
            <button class="btn btn-sm btn-primary" onClick$={props.onAddTerm$}>绑定</button>
          </div>
          <div class="mt-3 grid gap-2 md:grid-cols-2">
            {service.terms.map((term) => (
              <div key={term.id} class="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2">
                <div class="min-w-0">
                  <div class="truncate text-xs font-bold">{term.source}</div>
                  <div class="truncate text-xs text-slate-500">{term.target}</div>
                </div>
                <div class="flex gap-1">
                  <button class={`btn btn-xs ${term.confirmed ? "btn-success" : "btn-ghost"}`} onClick$={() => props.onToggleTerm$(term.id)}>确认</button>
                  <button class="btn btn-xs btn-ghost text-error" onClick$={() => props.onDeleteTerm$(term.id)}>删除</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section class="card border border-slate-200 bg-white shadow-sm">
        <div class="card-body p-5">
          <h2 class="font-bold">下发</h2>
          <p class="text-xs text-slate-500">译文确认且版面可印后下发；失败可在这边重试，现场那份不受影响、照常查看。</p>
          <div class="mt-3 flex items-center gap-3">
            <span class={`badge ${dispatch === "dispatched" ? "badge-success" : dispatch === "failed" ? "badge-error" : dispatch === "dispatching" ? "badge-warning" : "badge-neutral"}`}>
              {DISPATCH_LABELS[dispatch]}
            </span>
            {dispatch === "failed" && <span class="text-xs text-error">{service.dispatchError ?? "下发失败"}</span>}
            {dispatch === "dispatched" && service.dispatchedAt && (
              <span class="text-xs text-slate-400">{new Date(service.dispatchedAt).toLocaleString()}</span>
            )}
          </div>
          <div class="mt-3 flex gap-2">
            <button
              class="btn btn-sm btn-primary"
              disabled={dispatch === "dispatching" || props.layout.returnForReview || service.status !== "confirmed"}
              onClick$={props.onDispatch$}
            >
              {dispatch === "dispatching" ? "下发中…" : dispatch === "failed" ? "重新下发" : "下发到现场"}
            </button>
            {props.layout.returnForReview && <span class="self-center text-xs text-error">退回重核后不可下发</span>}
            {!props.layout.returnForReview && service.status !== "confirmed" && <span class="self-center text-xs text-slate-400">需先审校确认</span>}
          </div>
        </div>
      </section>

      <section class="card border border-slate-200 bg-white shadow-sm">
        <div class="card-body p-5">
          <h2 class="font-bold">审校意见与回复</h2>
          <div class="mt-3 flex gap-2">
            <textarea
              class="textarea textarea-bordered min-h-20 flex-1"
              placeholder="记录措辞、文化适配或法规依据…"
              value={props.commentDraft.value}
              onInput$={(_, element) => props.commentDraft.value = element.value}
            />
            <button class="btn btn-primary self-end" onClick$={props.onAddComment$}>添加意见</button>
          </div>
          <div class="mt-4 space-y-3">
            {service.comments.length === 0 && <div class="rounded-xl border border-dashed p-6 text-center text-sm text-slate-400">还没有审校意见。</div>}
            {service.comments.map((comment) => (
              <article key={comment.id} class={`rounded-xl border-l-4 bg-slate-50 p-3 ${comment.resolved ? "border-success opacity-60" : "border-warning"}`}>
                <div class="flex items-center justify-between text-xs"><strong>{comment.author}</strong><span class="text-slate-400">{new Date(comment.createdAt).toLocaleString()}</span></div>
                <p class="my-2 text-sm">{comment.body}</p>
                {comment.replies.map((reply) => (
                  <div key={reply.id} class="ml-4 my-1 border-l-2 border-slate-200 pl-3 text-xs"><strong>{reply.author}</strong>：{reply.body}</div>
                ))}
                {props.replyingTo.value === comment.id ? (
                  <div class="mt-2 flex gap-2">
                    <input class="input input-xs input-bordered flex-1" value={props.replyDraft.value} onInput$={(_, element) => props.replyDraft.value = element.value} />
                    <button class="btn btn-xs btn-primary" onClick$={() => props.onAddReply$(comment.id)}>发送</button>
                  </div>
                ) : (
                  <div class="mt-2 flex gap-2">
                    <button class="btn btn-xs btn-ghost" onClick$={() => props.replyingTo.value = comment.id}>回复</button>
                    <button class="btn btn-xs btn-ghost" onClick$={() => props.onToggleComment$(comment.id)}>{comment.resolved ? "重新打开" : "标记已解决"}</button>
                  </div>
                )}
              </article>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
});
