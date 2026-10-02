import { $, component$, useSignal, useVisibleTask$, type QRL } from "@builder.io/qwik";
import { type DocumentHead } from "@builder.io/qwik-city";
import { createSeedWorkspace, migrateProject, PHYSICAL_LABELS, STATUS_LABELS, uid } from "../data";
import type {
  ReviewStatus,
  ServiceRecord,
  SignProject,
  SiteRecord,
  Workspace,
} from "../types";
import { analyzeSign, cloneTerms, diffText, layoutCheck } from "../utils";
import { SignList } from "../components/SignList";
import { ServiceCenter } from "../components/ServiceCenter";
import { OnSite } from "../components/OnSite";
import { PreviewPane } from "../components/PreviewPane";

const SITE_KEY = "sologsb-1008-onsite-v1";
const SERVICE_KEY = "sologsb-1008-service-v1";
const LEGACY_KEY = "sologsb-1008-project-v1";
const WIDTHS = [320, 480, 720, 960] as const;

export const head: DocumentHead = {
  title: "公共标识多语言校对台",
  meta: [
    { name: "description", content: "公共标识译文、术语、版本与现场实测版面校对工作台" },
  ],
};

function statusClass(status: ReviewStatus) {
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

/** 模块级纯函数：供 QRL 直接读 workspace，避免在 $() 闭包里捕获组件级函数。 */
function findService(workspace: Workspace, id: string): ServiceRecord {
  return workspace.service.find((item) => item.signId === id) ?? workspace.service[0];
}

function findSite(workspace: Workspace, id: string): SiteRecord {
  const service = findService(workspace, id);
  return workspace.site.find((item) => item.signId === service.signId) ?? workspace.site[0];
}

export default component$(() => {
  const workspace = useSignal<Workspace>(createSeedWorkspace());
  const past = useSignal<Workspace[]>([]);
  const future = useSignal<Workspace[]>([]);
  const hydrated = useSignal(false);
  const online = useSignal(true);
  const view = useSignal<"service" | "site">("service");
  const previewWidth = useSignal(480);
  const previewFont = useSignal(42);
  const selectedVersionId = useSignal("");
  const termSource = useSignal("");
  const termTarget = useSignal("");
  const commentDraft = useSignal("");
  const replyDraft = useSignal("");
  const replyingTo = useSignal("");
  const toast = useSignal("");
  const previewId = useSignal("");
  const readOnly = useSignal(false);

  const activeId = () => previewId.value || workspace.value.meta.activeSignId;
  const activeService = (): ServiceRecord =>
    workspace.value.service.find((item) => item.signId === activeId()) ?? workspace.value.service[0];
  const activeSite = (): SiteRecord =>
    workspace.value.site.find((item) => item.signId === activeId()) ?? workspace.value.site[0];
  const activeLayout = () => layoutCheck(activeSite(), activeService());

  const commit = $((label: string, update: (draft: Workspace) => void) => {
    past.value = [...past.value.slice(-49), structuredClone(workspace.value)];
    future.value = [];
    const draft = structuredClone(workspace.value);
    update(draft);
    draft.meta.updatedAt = new Date().toISOString();
    workspace.value = draft;
  });

  const updateService = $((label: string, fn: (draft: ServiceRecord) => void) => {
    commit(label, (draft) => {
      const record = draft.service.find((item) => item.signId === draft.meta.activeSignId);
      if (record) fn(record);
    });
  });

  const updateSite = $((label: string, fn: (draft: SiteRecord) => void) => {
    commit(label, (draft) => {
      const record = draft.site.find((item) => item.signId === draft.meta.activeSignId);
      if (record) fn(record);
    });
  });

  const undo = $(() => {
    if (!past.value.length) return;
    const previous = past.value.at(-1)!;
    future.value = [structuredClone(workspace.value), ...future.value].slice(0, 50);
    past.value = past.value.slice(0, -1);
    workspace.value = previous;
    toast.value = "已撤销";
  });

  const redo = $(() => {
    if (!future.value.length) return;
    const next = future.value[0];
    past.value = [...past.value.slice(-49), structuredClone(workspace.value)];
    future.value = future.value.slice(1);
    workspace.value = next;
    toast.value = "已重做";
  });

  const navigateSign = $((direction: 1 | -1) => {
    if (readOnly.value) return;
    const signs = workspace.value.service;
    const index = Math.max(0, signs.findIndex((item) => item.signId === workspace.value.meta.activeSignId));
    const next = signs[(index + direction + signs.length) % signs.length];
    commit("切换标识", (draft) => { draft.meta.activeSignId = next.signId; });
    selectedVersionId.value = "";
  });

  const setStatus = $((status: ReviewStatus) => {
    updateService("更新审校状态", (record) => {
      if (record.emergencyRevision && status === "confirmed") record.status = "pending";
      else record.status = status;
    });
  });

  const toggleEmergency = $(() => {
    updateService("切换紧急修订", (record) => {
      record.emergencyRevision = !record.emergencyRevision;
      if (record.emergencyRevision) record.status = "changes";
    });
  });

  const saveVersion = $(() => {
    const current = findService(workspace.value, workspace.value.meta.activeSignId);
    if (!current) return;
    const versionId = uid("version");
    commit("保存版本快照", (draft) => {
      const record = draft.service.find((item) => item.signId === draft.meta.activeSignId);
      if (!record) return;
      record.versions.unshift({
        id: versionId,
        label: `版本 ${record.versions.length + 1}`,
        createdAt: new Date().toISOString(),
        sourceText: record.sourceText,
        targetText: record.targetText,
        status: record.status,
        terms: cloneTerms(record.terms),
      });
      record.versions = record.versions.slice(0, 12);
    });
    selectedVersionId.value = versionId;
    toast.value = "版本快照已保存";
  });

  const addTerm = $(() => {
    const source = termSource.value.trim();
    const target = termTarget.value.trim();
    if (!source || !target) return;
    updateService("绑定术语", (record) => {
      record.terms.push({ id: uid("term"), source, target, required: true, confirmed: false });
      record.status = "pending";
    });
    termSource.value = "";
    termTarget.value = "";
  });

  const deleteTerm = $((termId: string) => {
    updateService("删除术语", (record) => {
      record.terms = record.terms.filter((item) => item.id !== termId);
    });
  });

  const toggleTerm = $((termId: string) => {
    updateService("确认术语", (record) => {
      const term = record.terms.find((item) => item.id === termId);
      if (term) term.confirmed = !term.confirmed;
    });
  });

  const addComment = $(() => {
    const body = commentDraft.value.trim();
    if (!body) return;
    updateService("添加审校意见", (record) => {
      record.comments.unshift({
        id: uid("comment"),
        author: "当前审校员",
        body,
        createdAt: new Date().toISOString(),
        resolved: false,
        replies: [],
      });
      record.status = record.status === "confirmed" ? "changes" : record.status;
    });
    commentDraft.value = "";
  });

  const addReply = $((commentId: string) => {
    const body = replyDraft.value.trim();
    if (!body) return;
    updateService("回复审校意见", (record) => {
      const comment = record.comments.find((item) => item.id === commentId);
      comment?.replies.push({ id: uid("reply"), author: "当前审校员", body, createdAt: new Date().toISOString() });
    });
    replyDraft.value = "";
    replyingTo.value = "";
  });

  const toggleCommentResolved = $((commentId: string) => {
    updateService("更新意见状态", (record) => {
      const comment = record.comments.find((item) => item.id === commentId);
      if (comment) comment.resolved = !comment.resolved;
    });
  });

  /** 下发到现场：版面以现场实测校核为准，排不下退回重核；失败可在服务中心这边重试。 */
  const dispatch = $(() => {
    const current = workspace.value;
    const service = findService(current, current.meta.activeSignId);
    const site = findSite(current, current.meta.activeSignId);
    if (!service || !site) return;
    const check = layoutCheck(site, service);
    if (check.returnForReview) {
      toast.value = "排不下现场可印区域，已退回重核，暂不下发";
      return;
    }
    if (service.status !== "confirmed") {
      toast.value = "请先完成审校确认再下发";
      return;
    }
    commit("下发", (draft) => {
      const record = draft.service.find((item) => item.signId === draft.meta.activeSignId);
      if (record) {
        record.dispatchStatus = "dispatching";
        record.dispatchError = undefined;
      }
    });
    window.setTimeout(() => {
      const failed = Math.random() < 0.4;
      commit(failed ? "下发失败" : "下发成功", (draft) => {
        const record = draft.service.find((item) => item.signId === draft.meta.activeSignId);
        if (!record) return;
        record.dispatchStatus = failed ? "failed" : "dispatched";
        record.dispatchError = failed ? "下发服务暂不可用，可在这边重试" : undefined;
        if (!failed) record.dispatchedAt = new Date().toISOString();
      });
      toast.value = failed ? "下发失败，可重试" : "已下发到现场";
    }, 800);
  });

  const sharePreview: QRL<() => void> = $(() => {
    const current = findService(workspace.value, workspace.value.meta.activeSignId);
    if (!current) return;
    const url = `${window.location.origin}${window.location.pathname}?preview=${encodeURIComponent(current.signId)}`;
    void navigator.clipboard?.writeText(url).catch(() => undefined);
    toast.value = "只读预览链接已复制";
  });

  const selectedVersion = () =>
    activeService().versions.find((version) => version.id === selectedVersionId.value) ?? activeService().versions[0];
  const comparison = () => {
    const version = selectedVersion();
    return version ? diffText(version.targetText, activeService().targetText) : [];
  };

  useVisibleTask$(({ track }) => {
    track(() => hydrated.value);
    if (!hydrated.value) {
      try {
        const siteRaw = localStorage.getItem(SITE_KEY);
        const serviceRaw = localStorage.getItem(SERVICE_KEY);
        if (siteRaw && serviceRaw) {
          const site = JSON.parse(siteRaw) as { schema: number; records: SiteRecord[] };
          const service = JSON.parse(serviceRaw) as { schema: number; meta: Workspace["meta"]; records: ServiceRecord[] };
          if (site.schema === 1 && service.schema === 1 && site.records?.length && service.records?.length) {
            workspace.value = { meta: service.meta, site: site.records, service: service.records };
          }
        } else {
          const legacyRaw = localStorage.getItem(LEGACY_KEY);
          if (legacyRaw) {
            const legacy = JSON.parse(legacyRaw) as { schema: number; project: SignProject };
            if (legacy.schema === 1 && legacy.project?.signs?.length) {
              // 本机旧数据按归属迁移到两边，再启用
              const migrated = migrateProject(legacy.project);
              workspace.value = migrated;
              localStorage.setItem(SITE_KEY, JSON.stringify({ schema: 1, records: migrated.site }));
              localStorage.setItem(SERVICE_KEY, JSON.stringify({ schema: 1, meta: migrated.meta, records: migrated.service }));
              localStorage.removeItem(LEGACY_KEY);
            }
          }
        }
        const requestedPreview = new URLSearchParams(window.location.search).get("preview") ?? "";
        previewId.value = requestedPreview;
        readOnly.value = Boolean(requestedPreview);
      } catch {
        // 存储不可用或损坏时保留内置示例数据。
      }
      hydrated.value = true;
    }
  });

  useVisibleTask$(({ track, cleanup }) => {
    track(() => hydrated.value);
    if (!hydrated.value) return;
    track(() => workspace.value);
    const timer = window.setTimeout(() => {
      const current = workspace.value;
      localStorage.setItem(SITE_KEY, JSON.stringify({ schema: 1, records: current.site }));
      localStorage.setItem(SERVICE_KEY, JSON.stringify({ schema: 1, meta: current.meta, records: current.service }));
    }, 450);
    cleanup(() => window.clearTimeout(timer));
  });

  useVisibleTask$(({ cleanup }) => {
    const updateOnline = () => { online.value = navigator.onLine; };
    updateOnline();
    const keydown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.matches("input, textarea, select, [contenteditable='true']")) return;
      const command = event.metaKey || event.ctrlKey;
      if (command && event.key.toLowerCase() === "z") {
        event.preventDefault();
        event.shiftKey ? undo() : undo();
      } else if (event.key.toLowerCase() === "j") {
        event.preventDefault();
        navigateSign(1);
      } else if (event.key.toLowerCase() === "k") {
        event.preventDefault();
        navigateSign(-1);
      } else if (event.key === "[") {
        const index = WIDTHS.indexOf(previewWidth.value as (typeof WIDTHS)[number]);
        previewWidth.value = WIDTHS[Math.max(0, index - 1)];
      } else if (event.key === "]") {
        const index = WIDTHS.indexOf(previewWidth.value as (typeof WIDTHS)[number]);
        previewWidth.value = WIDTHS[Math.min(WIDTHS.length - 1, index + 1)];
      } else if (event.key === "-") {
        previewFont.value = Math.max(28, previewFont.value - 4);
      } else if (event.key === "=") {
        previewFont.value = Math.min(88, previewFont.value + 4);
      }
    };
    window.addEventListener("online", updateOnline);
    window.addEventListener("offline", updateOnline);
    window.addEventListener("keydown", keydown);
    cleanup(() => {
      window.removeEventListener("online", updateOnline);
      window.removeEventListener("offline", updateOnline);
      window.removeEventListener("keydown", keydown);
    });
  });

  if (readOnly.value) {
    const service = activeService();
    const site = activeSite();
    const analysis = analyzeSign(service, previewWidth.value, previewFont.value);
    const fit = layoutCheck(site, service);
    return (
      <main data-theme="corporate" class="min-h-screen bg-slate-100 p-6">
        <div class="mx-auto max-w-5xl">
          <div class="mb-4 flex items-center justify-between">
            <div>
              <div class="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">Read-only preview</div>
              <h1 class="text-2xl font-bold text-slate-800">{service.code} · {service.scenario}</h1>
            </div>
            <div class="flex items-center gap-2">
              {fit.returnForReview && <span class="badge badge-error">退回重核</span>}
              <span class={`badge ${statusClass(service.status)}`}>{STATUS_LABELS[service.status]}</span>
            </div>
          </div>
          <section class="rounded-3xl bg-white p-14 shadow-xl">
            <div class="mb-3 text-center text-xs text-slate-400">中文原文</div>
            <p class="mx-auto mb-10 max-w-2xl text-center text-lg text-slate-600">{service.sourceText}</p>
            <div class="mx-auto border-y-4 border-slate-800 py-10 text-center">
              <p class="whitespace-pre-line font-black leading-tight tracking-wide text-slate-900" style={{ fontSize: `${previewFont.value}px` }}>{analysis.visible.join("\n")}</p>
            </div>
            <div class="mt-5 text-center text-sm text-slate-500">{service.targetLanguage} · {service.regulation}</div>
          </section>
          <p class="mt-4 text-center text-xs text-slate-400">此链接读取当前浏览器中的本地版本，仅用于演示只读预览。</p>
        </div>
      </main>
    );
  }

  const service = activeService();
  const site = activeSite();
  const fit = activeLayout();

  return (
    <div data-theme="corporate" class="min-h-screen bg-slate-100 pb-9 text-slate-800">
      <header class="navbar sticky top-0 z-40 min-h-16 border-b border-slate-700 bg-[#17324d] px-5 text-white shadow-lg">
        <div class="navbar-start gap-3">
          <div class="grid h-10 w-10 place-items-center rounded-xl border border-white/20 bg-white/10 font-black">译</div>
          <div>
            <div class="text-xs uppercase tracking-[0.2em] text-sky-200">Public Sign Review</div>
            <div class="font-bold">公共标识多语言校对台</div>
          </div>
        </div>
        <div class="navbar-center hidden xl:flex">
          <div class="join">
            <button class={`btn btn-sm join-item ${view.value === "service" ? "btn-primary" : "btn-outline"}`} onClick$={() => { view.value = "service"; }}>服务中心</button>
            <button class={`btn btn-sm join-item ${view.value === "site" ? "btn-primary" : "btn-outline"}`} onClick$={() => { view.value = "site"; }}>现场</button>
          </div>
        </div>
        <div class="navbar-end gap-2">
          <span class={`badge ${online.value ? "badge-success" : "badge-warning"} badge-outline`}>{online.value ? "在线" : "离线草稿"}</span>
          <button class="btn btn-ghost btn-sm" disabled={!past.value.length} onClick$={undo}>撤销</button>
          <button class="btn btn-ghost btn-sm" disabled={!future.value.length} onClick$={redo}>重做</button>
          <button class="btn btn-sm border-white/20 bg-white/10 text-white hover:bg-white/20" onClick$={sharePreview}>复制只读链接</button>
          {view.value === "service" && (
            <button class={`btn btn-sm ${service.emergencyRevision ? "btn-error" : "btn-warning"}`} onClick$={toggleEmergency}>
              {service.emergencyRevision ? "退出紧急修订" : "紧急修订"}
            </button>
          )}
        </div>
      </header>

      {service.emergencyRevision && view.value === "service" && (
        <div class="alert alert-error sticky top-16 z-30 rounded-none border-x-0 py-2 text-white">
          <span class="text-lg">!</span>
          <span><strong>紧急修订模式</strong>：确认操作已锁定，修改后必须重新审校并保存版本。</span>
        </div>
      )}

      <div class="grid min-h-[calc(100vh-64px)] grid-cols-[270px_1fr] gap-px bg-slate-300">
        <aside class="overflow-y-auto bg-slate-50 p-3">
          <div class="mb-3 rounded-xl bg-white p-4 shadow-sm">
            <div class="text-xs font-bold uppercase tracking-[0.16em] text-slate-400">标识清单</div>
            <div class="mt-1 text-lg font-bold text-slate-800">{workspace.value.service.length} 处标识</div>
            <p class="mt-1 text-xs leading-5 text-slate-500">{workspace.value.meta.location}</p>
          </div>
          <SignList
            site={workspace.value.site}
            service={workspace.value.service}
            activeId={workspace.value.meta.activeSignId}
            view={view.value}
            onSelect$={(id) => {
              commit("切换标识", (draft) => { draft.meta.activeSignId = id; });
              selectedVersionId.value = "";
            }}
          />
        </aside>

        <main class="min-w-0 bg-white">
          {view.value === "service" ? (
            <div class="grid grid-cols-[minmax(560px,1fr)_430px]">
              <div class="min-w-0">
                <div class="border-b border-slate-200 bg-slate-50 px-6 py-4">
                  <div class="flex items-start justify-between gap-5">
                    <div>
                      <div class="text-xs font-bold uppercase tracking-[0.16em] text-blue-600">{service.code} · {service.scenario}</div>
                      <h1 class="mt-1 text-xl font-bold">译文与术语校对</h1>
                    </div>
                    <div class="join">
                      {(["draft", "pending", "changes", "confirmed"] as ReviewStatus[]).map((status) => (
                        <button
                          key={status}
                          class={`btn join-item btn-sm ${service.status === status ? "btn-primary" : "btn-outline"}`}
                          onClick$={() => setStatus(status)}
                        >
                          {STATUS_LABELS[status]}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
                <div class="space-y-5 p-6">
                  <ServiceCenter
                    service={service}
                    site={site}
                    layout={fit}
                    previewWidth={previewWidth}
                    previewFont={previewFont}
                    termSource={termSource}
                    termTarget={termTarget}
                    commentDraft={commentDraft}
                    replyDraft={replyDraft}
                    replyingTo={replyingTo}
                    selectedVersionId={selectedVersionId}
                    versions={service.versions}
                    comparison={comparison()}
                    onUpdate$={updateService}
                    onSetStatus$={setStatus}
                    onToggleEmergency$={toggleEmergency}
                    onSaveVersion$={saveVersion}
                    onAddTerm$={addTerm}
                    onDeleteTerm$={deleteTerm}
                    onToggleTerm$={toggleTerm}
                    onAddComment$={addComment}
                    onAddReply$={addReply}
                    onToggleComment$={toggleCommentResolved}
                    onDispatch$={dispatch}
                    onSharePreview$={sharePreview}
                  />
                </div>
              </div>
              <aside class="overflow-y-auto bg-slate-50 p-4">
                <PreviewPane
                  service={service}
                  layout={fit}
                  previewWidth={previewWidth}
                  previewFont={previewFont}
                  selectedVersionId={selectedVersionId}
                  versions={service.versions}
                  comparison={comparison()}
                />
              </aside>
            </div>
          ) : (
            <div class="mx-auto max-w-3xl p-6">
              <div class="mb-4 flex items-center justify-between">
                <div>
                  <div class="text-xs font-bold uppercase tracking-[0.16em] text-blue-600">{site.code} · 现场</div>
                  <h1 class="mt-1 text-xl font-bold">实测尺寸与安装状态</h1>
                </div>
                <span class={`badge ${physicalClass(site.physicalStatus)}`}>{PHYSICAL_LABELS[site.physicalStatus]}</span>
              </div>
              <OnSite
                service={service}
                site={site}
                layout={fit}
                onUpdate$={(label, fn) => updateSite(label, fn)}
              />
            </div>
          )}
        </main>
      </div>

      {toast.value && <div class="toast toast-end z-50"><div class="alert alert-success"><span>{toast.value}</span></div></div>}
    </div>
  );
});
