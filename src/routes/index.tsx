import { $, component$, useSignal, useVisibleTask$, type QRL } from "@builder.io/qwik";
import { type DocumentHead } from "@builder.io/qwik-city";
import {
  CENTER_STORAGE_KEY,
  FIELD_STORAGE_KEY,
  LEGACY_STORAGE_KEY,
  PHYSICAL_STATE_LABELS,
  STATUS_LABELS,
  createSeedCenter,
  createSeedField,
  migrateLegacy,
  uid,
} from "../data";
import type {
  CenterSign,
  CenterStore,
  FieldSign,
  FieldStore,
  PhysicalState,
  PrintableArea,
  ReviewStatus,
} from "../types";
import { cloneTerms, diffText, evaluateFit, lineCapacityFor, missingRequiredTerms } from "../utils";

type Role = "center" | "field";

export const head: DocumentHead = {
  title: "公共标识多语言校对台",
  meta: [
    { name: "description", content: "现场实测与译文审校分开保存、按可印区域互相牵制的本地优先工作台" },
  ],
};

function statusClass(status: ReviewStatus) {
  if (status === "confirmed") return "badge-success";
  if (status === "changes") return "badge-error";
  if (status === "pending") return "badge-warning";
  return "badge-neutral";
}

const fmt = (value: string | null) => (value ? new Date(value).toLocaleString() : "—");
const num = (value: number | null) => (value == null ? "" : String(value));

function fieldOf(field: FieldStore, id: string): FieldSign | undefined {
  return field.signs.find((sign) => sign.id === id);
}

export default component$(() => {
  const center = useSignal<CenterStore>(createSeedCenter());
  const field = useSignal<FieldStore>(createSeedField());
  const past = useSignal<CenterStore[]>([]);
  const future = useSignal<CenterStore[]>([]);
  const hydrated = useSignal(false);
  const migrated = useSignal(false);
  const role = useSignal<Role>("center");
  const online = useSignal(true);
  const forceFail = useSignal(false);
  const selectedVersionId = useSignal("");
  const termSource = useSignal("");
  const termTarget = useSignal("");
  const commentDraft = useSignal("");
  const replyDraft = useSignal("");
  const replyingTo = useSignal("");
  const toast = useSignal("");
  const previewId = useSignal("");
  const readOnly = useSignal(false);

  const activeCenter = () =>
    center.value.signs.find((sign) => sign.id === center.value.activeSignId) ?? center.value.signs[0];
  const activeField = () =>
    field.value.signs.find((sign) => sign.id === field.value.activeSignId) ?? field.value.signs[0];

  const say = $((message: string) => {
    toast.value = message;
  });

  /* ---------- 服务中心那份：唯一可改译文/术语/审校结论的地方 ---------- */
  const commit = $((label: string, update: (draft: CenterStore) => void) => {
    past.value = [...past.value.slice(-49), structuredClone(center.value)];
    future.value = [];
    const draft = structuredClone(center.value);
    update(draft);
    draft.updatedAt = new Date().toISOString();
    center.value = draft;
  });

  const updateActive = $((_label: string, update: (sign: CenterSign) => void) => {
    commit(_label, (draft) => {
      const sign = draft.signs.find((item) => item.id === draft.activeSignId);
      if (sign) update(sign);
    });
  });

  const undo = $(() => {
    if (!past.value.length) return;
    const previous = past.value.at(-1)!;
    future.value = [structuredClone(center.value), ...future.value].slice(0, 50);
    past.value = past.value.slice(0, -1);
    center.value = previous;
  });

  const redo = $(() => {
    if (!future.value.length) return;
    const next = future.value[0];
    past.value = [...past.value.slice(-49), structuredClone(center.value)];
    future.value = future.value.slice(1);
    center.value = next;
  });

  const selectSign = $((storeId: "center" | "field", id: string) => {
    if (storeId === "center") {
      commit("切换标识", (draft) => { draft.activeSignId = id; });
    } else {
      const draft = structuredClone(field.value);
      const target = draft.signs.find((sign) => sign.id === id);
      if (target) draft.activeSignId = id;
      draft.updatedAt = new Date().toISOString();
      field.value = draft;
    }
    selectedVersionId.value = "";
  });

  const navigateSign = $((storeId: "center" | "field", direction: 1 | -1) => {
    if (readOnly.value) return;
    const store = storeId === "center" ? center.value : field.value;
    const index = Math.max(0, store.signs.findIndex((sign) => sign.id === store.activeSignId));
    const next = store.signs[(index + direction + store.signs.length) % store.signs.length];
    selectSign(storeId, next.id);
  });

  const setStatus = $((status: ReviewStatus) => {
    commit("更新审校状态", (draft) => {
      const sign = draft.signs.find((item) => item.id === draft.activeSignId);
      if (!sign) return;
      sign.status = sign.emergencyRevision && status === "confirmed" ? "pending" : status;
    });
  });

  const toggleEmergency = $(() => {
    commit("切换紧急修订", (draft) => {
      const sign = draft.signs.find((item) => item.id === draft.activeSignId);
      if (!sign) return;
      sign.emergencyRevision = !sign.emergencyRevision;
      if (sign.emergencyRevision) sign.status = "changes";
    });
  });

  const saveVersion = $(() => {
    const current = activeCenter();
    const versionId = uid("version");
    commit("保存版本快照", (draft) => {
      const sign = draft.signs.find((item) => item.id === draft.activeSignId);
      if (!sign) return;
      sign.versions.unshift({
        id: versionId,
        label: `版本 ${sign.versions.length + 1}`,
        createdAt: new Date().toISOString(),
        sourceText: sign.sourceText,
        targetText: sign.targetText,
        status: sign.status,
        terms: cloneTerms(sign.terms),
      });
      sign.versions = sign.versions.slice(0, 12);
    });
    selectedVersionId.value = versionId;
    say("版本快照已保存");
  });

  const addTerm = $(() => {
    const source = termSource.value.trim();
    const targetText = termTarget.value.trim();
    if (!source || !targetText) return;
    updateActive("绑定术语", (sign) => {
      sign.terms.push({ id: uid("term"), source, target: targetText, required: true, confirmed: false });
      sign.status = "pending";
    });
    termSource.value = "";
    termTarget.value = "";
  });

  const addComment = $(() => {
    const body = commentDraft.value.trim();
    if (!body) return;
    updateActive("添加审校意见", (sign) => {
      sign.comments.unshift({
        id: uid("comment"),
        author: "语言服务中心审校员",
        body,
        createdAt: new Date().toISOString(),
        resolved: false,
        replies: [],
      });
      if (sign.status === "confirmed") sign.status = "changes";
    });
    commentDraft.value = "";
  });

  const addReply = $((commentId: string) => {
    const body = replyDraft.value.trim();
    if (!body) return;
    updateActive("回复审校意见", (sign) => {
      sign.comments.find((item) => item.id === commentId)?.replies.push({
        id: uid("reply"),
        author: "语言服务中心审校员",
        body,
        createdAt: new Date().toISOString(),
      });
    });
    replyDraft.value = "";
    replyingTo.value = "";
  });

  /* ---------- 下发：失败只记日志，不动现场那份，服务中心按日志重试 ---------- */
  const dispatchSign = $(async (id: string, batch = false) => {
    const targets = batch
      ? center.value.signs.filter((sign) => sign.dispatch.status !== "delivered" || fieldOf(field.value, sign.id)?.recheck === "active")
      : center.value.signs.filter((sign) => sign.id === id);
    if (!targets.length) {
      say("没有需要下发的标识");
      return;
    }
    const failNow = !online.value || forceFail.value;
    const at = new Date().toISOString();
    const centerDraft = structuredClone(center.value);
    const fieldDraft = structuredClone(field.value);
    let failureCount = 0;
    let successCount = 0;

    for (const targetSign of targets) {
      const cSign = centerDraft.signs.find((sign) => sign.id === targetSign.id);
      if (!cSign) continue;
      const attempt = cSign.dispatch.attempts + 1;
      cSign.dispatch.attempts = attempt;
      cSign.dispatch.lastAttemptAt = at;
      if (failNow) {
        failureCount += 1;
        cSign.dispatch.status = "failed";
        cSign.dispatch.lastError = online.value ? "模拟下发失败（链路演练）" : "当前离线，下发失败";
        cSign.dispatch.logs.unshift({
          id: uid("log"),
          attempt,
          ok: false,
          at,
          detail: online.value ? "网络链路异常，现场那份未改动" : "离线，未触达现场；现场保留上一版可看内容",
        });
        cSign.dispatch.logs = cSign.dispatch.logs.slice(0, 20);
        continue;
      }
      // 成功：译文包写进现场那份；现场实测数字、安装位置、实物状态一律不动。
      const fSign = fieldDraft.signs.find((sign) => sign.id === targetSign.id);
      if (!fSign) continue;
      fSign.delivered = {
        targetLanguage: cSign.targetLanguage,
        targetText: cSign.targetText,
        terms: cloneTerms(cSign.terms),
        deliveredAt: at,
      };
      cSign.dispatch.status = "delivered";
      cSign.dispatch.deliveredAt = at;
      cSign.dispatch.lastError = "";
      cSign.dispatch.deliveredTargetText = cSign.targetText;
      cSign.dispatch.deliveredTerms = cloneTerms(cSign.terms);
      cSign.dispatch.logs.unshift({ id: uid("log"), attempt, ok: true, at, detail: "已下发到现场那份" });
      cSign.dispatch.logs = cSign.dispatch.logs.slice(0, 20);
      successCount += 1;
    }

    centerDraft.updatedAt = at;
    // 全部失败时完全不碰现场那份；只有成功送达的牌子才更新对应译文包，
    // 实测尺寸、安装位置、实物状态始终不动。
    if (successCount > 0) {
      fieldDraft.updatedAt = at;
      field.value = fieldDraft;
    }
    center.value = centerDraft;
    if (failNow) {
      say(batch ? `${failureCount} 块下发失败，现场照旧可看，可在右侧按日志重试` : "下发失败：现场那份未改动，可按“重试下发”再发");
    } else {
      say(batch ? `已下发 ${successCount} 块标识` : "译文已下发到现场那份");
    }
  });

  const sharePreview: QRL<() => void> = $(() => {
    const current = activeCenter();
    const url = `${window.location.origin}${window.location.pathname}?preview=${encodeURIComponent(current.id)}`;
    void navigator.clipboard?.writeText(url).catch(() => undefined);
    say("只读预览链接已复制");
  });

  /* ---------- 现场那份：唯一可改实测尺寸/位置/实物状态的地方 ---------- */
  const patchField = $((id: string, patch: (sign: FieldSign) => void) => {
    const draft = structuredClone(field.value);
    const sign = draft.signs.find((item) => item.id === id);
    if (!sign) return;
    patch(sign);
    sign.updatedAt = new Date().toISOString();
    draft.updatedAt = new Date().toISOString();
    field.value = draft;
  });

  const parseMm = (value: string): number | null => {
    if (!value.trim()) return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed >= 0 ? Math.round(parsed * 10) / 10 : null;
  };

  const updateArea = $((id: string, key: keyof PrintableArea, raw: string) => {
    patchField(id, (sign) => {
      sign.area[key] = parseMm(raw);
    });
  });

  const toggleRecheck = $((id: string) => {
    const fSign = fieldOf(field.value, id);
    if (!fSign?.delivered) return;
    const verdict = evaluateFit(fSign.delivered.targetText, fSign.area, fSign.code);
    const nowIso = new Date().toISOString();
    if (fSign.recheck !== "active") {
      // 只允许“按实测排不下”时退回；现场不改译文，也不改自己量的数字。
      if (verdict.measured && verdict.fits) {
        say("按当前实测可印区域排得下，无需退回重核");
        return;
      }
      const reason = verdict.measured
        ? verdict.reasons.join("；")
        : `牌子 ${fSign.code}：可印区域或最小可读字号尚未实测齐全，无法确认排得下，退回重核。`;
      patchField(id, (sign) => {
        sign.recheck = "active";
        sign.recheckReason = reason;
        sign.recheckAt = nowIso;
        sign.resolvedAt = null;
      });
      // 同步把审校结论打回“需修改”——这是现场退回的结果，不是中心直接改尺寸。
      const centerDraft = structuredClone(center.value);
      const cSign = centerDraft.signs.find((sign) => sign.id === id);
      if (cSign) {
        cSign.status = "changes";
        cSign.updatedAt = nowIso;
        centerDraft.updatedAt = nowIso;
      }
      center.value = centerDraft;
      say(`牌子 ${fSign.code} 已退回服务中心重核`);
    } else {
      if (verdict.measured && !verdict.fits) {
        say("最新下发的译文按实测仍排不下，不能标记复核通过");
        return;
      }
      patchField(id, (target) => {
        target.recheck = "resolved";
        target.resolvedAt = nowIso;
      });
      say("已标记现场复核通过");
    }
  });

  /* ---------- 启动：先迁移旧合并稿，再启用分开的两份 ---------- */
  useVisibleTask$(() => {
    try {
      const rawCenter = localStorage.getItem(CENTER_STORAGE_KEY);
      const rawField = localStorage.getItem(FIELD_STORAGE_KEY);
      if (rawCenter && rawField) {
        const c = JSON.parse(rawCenter) as CenterStore;
        const f = JSON.parse(rawField) as FieldStore;
        if (c?.schema === 2 && c.signs?.length && f?.schema === 2 && f.signs?.length) {
          center.value = c;
          field.value = f;
        } else {
          center.value = createSeedCenter();
          field.value = createSeedField();
        }
      } else {
        const legacy = localStorage.getItem(LEGACY_STORAGE_KEY);
        if (legacy) {
          const { center: migratedCenter, field: migratedField } = migrateLegacy(legacy);
          center.value = migratedCenter;
          field.value = migratedField;
          localStorage.removeItem(LEGACY_STORAGE_KEY);
          migrated.value = true;
        } else {
          center.value = createSeedCenter();
          field.value = createSeedField();
        }
      }
      const requestedPreview = new URLSearchParams(window.location.search).get("preview") ?? "";
      previewId.value = requestedPreview;
      readOnly.value = Boolean(requestedPreview);
      if (requestedPreview) {
        center.value.activeSignId = requestedPreview;
      }
    } catch {
      center.value = createSeedCenter();
      field.value = createSeedField();
    }
    hydrated.value = true;
  });

  useVisibleTask$(({ track, cleanup }) => {
    track(() => hydrated.value);
    if (!hydrated.value) return;
    track(() => center.value);
    const timer = window.setTimeout(() => {
      localStorage.setItem(CENTER_STORAGE_KEY, JSON.stringify(center.value));
    }, 300);
    cleanup(() => window.clearTimeout(timer));
  });

  useVisibleTask$(({ track, cleanup }) => {
    track(() => hydrated.value);
    if (!hydrated.value) return;
    track(() => field.value);
    const timer = window.setTimeout(() => {
      localStorage.setItem(FIELD_STORAGE_KEY, JSON.stringify(field.value));
    }, 300);
    cleanup(() => window.clearTimeout(timer));
  });

  useVisibleTask$(({ cleanup }) => {
    const updateOnline = () => { online.value = navigator.onLine; };
    updateOnline();
    const keydown = (event: KeyboardEvent) => {
      if (!hydrated.value || readOnly.value) return;
      const target = event.target as HTMLElement | null;
      if (target?.matches("input, textarea, select, [contenteditable='true']")) return;
      const key = event.key.toLowerCase();
      if ((event.metaKey || event.ctrlKey) && key === "z" && role.value === "center") {
        event.preventDefault();
        event.shiftKey ? redo() : undo();
      } else if (key === "j") {
        event.preventDefault();
        navigateSign(role.value, 1);
      } else if (key === "k") {
        event.preventDefault();
        navigateSign(role.value, -1);
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

  if (!hydrated.value) {
    return (
      <main data-theme="corporate" class="grid min-h-screen place-items-center bg-slate-100 text-slate-500">
        <div class="text-sm">正在核对本地两份稿件…</div>
      </main>
    );
  }

  /* ---------- 只读预览：译文取自服务中心，版面只按现场实测数字 ---------- */
  if (readOnly.value) {
    const sign = activeCenter();
    const spec = fieldOf(field.value, sign.id);
    const area = spec?.area ?? { panelWidthMm: null, panelHeightMm: null, printWidthMm: null, printHeightMm: null, minFontMm: null };
    const text = spec?.delivered?.targetText ?? sign.targetText;
    const verdict = evaluateFit(text, area, sign.code);
    const pxW = area.printWidthMm != null ? Math.round(area.printWidthMm * 1.4) : 480;
    const pxH = area.printHeightMm != null ? Math.round(area.printHeightMm * 1.4) : 200;
    const fontPx = area.minFontMm != null ? Math.round(area.minFontMm * 1.4) : 32;
    return (
      <main data-theme="corporate" class="min-h-screen bg-slate-100 p-6">
        <div class="mx-auto max-w-5xl">
          <div class="mb-4 flex items-center justify-between">
            <div>
              <div class="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">Read-only preview</div>
              <h1 class="text-2xl font-bold text-slate-800">{sign.code} · {sign.scenario}</h1>
            </div>
            <span class={`badge ${statusClass(sign.status)}`}>{STATUS_LABELS[sign.status]}</span>
          </div>
          <section class="rounded-3xl bg-white p-14 shadow-xl">
            <div class="mb-3 text-center text-xs text-slate-400">中文原文</div>
            <p class="mx-auto mb-10 max-w-2xl text-center text-lg text-slate-600">{sign.sourceText}</p>
            <div class="mx-auto border-y-4 border-slate-800 py-10 text-center">
              <div
                class="mx-auto grid place-items-center overflow-hidden text-center font-black leading-[1.2] tracking-wide text-slate-900"
                style={{ width: `${pxW}px`, height: `${pxH}px`, fontSize: `${fontPx}px` }}
              >
                <div>{verdict.lines.map((line, index) => <div key={index}>{line || " "}</div>)}</div>
              </div>
            </div>
            <div class="mt-5 text-center text-sm text-slate-500">
              {sign.targetLanguage} · 可印区域 {area.printWidthMm ?? "?"}×{area.printHeightMm ?? "?"}mm · 最小字号 {area.minFontMm ?? "?"}mm（现场实测）
            </div>
            {!verdict.fits && verdict.measured && (
              <div class="alert alert-error mt-6 text-sm">
                <span>按实测可印区域与最小可读字号排不下：{verdict.reasons.join("；")}。该牌子已退回重核，不缩字号、不改实测数字。</span>
              </div>
            )}
          </section>
          <p class="mt-4 text-center text-xs text-slate-400">此链接读取本机分开保存的两份数据（译文取服务中心稿，尺寸取现场稿），仅用于只读预览。</p>
        </div>
      </main>
    );
  }

  /* ============================ 服务中心那份 ============================ */
  const renderCenter = () => {
    const sign = activeCenter();
    const spec = fieldOf(field.value, sign.id);
    const area = spec?.area;
    const verdict = area ? evaluateFit(sign.targetText, area, sign.code) : null;
    const capacity = area ? lineCapacityFor(area) : null;
    const missing = missingRequiredTerms(sign.targetText, sign.terms);
    const draftRisk = !verdict ? "unknown" : !verdict.measured ? "unknown" : verdict.fits && missing.length === 0 ? "low" : "high";
    const selectedVersion = sign.versions.find((version) => version.id === selectedVersionId.value) ?? sign.versions[0];
    const comparison = selectedVersion ? diffText(selectedVersion.targetText, sign.targetText) : [];
    const pendingBatch = center.value.signs.filter(
      (item) => item.dispatch.status !== "delivered" || fieldOf(field.value, item.id)?.recheck === "active",
    ).length;

    return (
      <div class="grid min-h-[calc(100vh-64px)] grid-cols-[280px_minmax(560px,1fr)_440px] gap-px bg-slate-300">
        {/* 左：译文清单（含下发与退回标记） */}
        <aside class="overflow-y-auto bg-slate-50 p-3">
          <div class="mb-3 rounded-xl bg-white p-4 shadow-sm">
            <div class="text-xs font-bold uppercase tracking-[0.16em] text-slate-400">语言服务中心 · 译文清单</div>
            <div class="mt-1 text-lg font-bold text-slate-800">{center.value.signs.length} 块牌子的译文</div>
            <input
              class="input input-sm mt-2 w-full border-slate-200"
              value={center.value.title}
              onInput$={(_, element) => commit("修改项目名称", (draft) => { draft.title = element.value; })}
              aria-label="项目名称"
            />
          </div>
          <div class="space-y-2">
            {center.value.signs.map((item) => {
              const itemSpec = fieldOf(field.value, item.id);
              const itemVerdict = itemSpec ? evaluateFit(item.targetText, itemSpec.area, item.code) : null;
              return (
                <button
                  key={item.id}
                  class={`w-full rounded-xl border p-3 text-left transition ${item.id === center.value.activeSignId ? "border-blue-400 bg-blue-50 shadow-sm" : "border-slate-200 bg-white hover:border-slate-300"}`}
                  onClick$={() => selectSign("center", item.id)}
                >
                  <div class="flex items-center justify-between">
                    <span class="font-mono text-xs font-bold text-slate-500">{item.code}</span>
                    <span class={`badge badge-sm ${statusClass(item.status)}`}>{STATUS_LABELS[item.status]}</span>
                  </div>
                  <div class="mt-2 line-clamp-2 text-sm font-semibold text-slate-700">{item.sourceText}</div>
                  <div class="mt-2 flex flex-wrap items-center gap-1 text-[11px]">
                    {itemSpec?.recheck === "active" && <span class="badge badge-xs badge-error gap-1">退回重核</span>}
                    {item.dispatch.status === "failed" && <span class="badge badge-xs badge-warning gap-1">下发失败·重试</span>}
                    {item.dispatch.status === "delivered" && <span class="badge badge-xs badge-ghost gap-1">已下发</span>}
                    {item.dispatch.status === "idle" && <span class="badge badge-xs badge-ghost gap-1">未下发</span>}
                    {itemVerdict?.measured && (
                      <span class={itemVerdict.fits ? "text-success" : "font-bold text-error"}>
                        {itemVerdict.fits ? "版面可行" : "按实测排不下"}
                      </span>
                    )}
                    {!itemVerdict?.measured && <span class="text-slate-400">待现场实测</span>}
                  </div>
                </button>
              );
            })}
          </div>
        </aside>

        {/* 中：译文编辑 + 现场只读实测卡 */}
        <main class="min-w-0 bg-white">
          <div class="border-b border-slate-200 bg-slate-50 px-6 py-4">
            <div class="flex items-start justify-between gap-5">
              <div>
                <div class="text-xs font-bold uppercase tracking-[0.16em] text-blue-600">{sign.code} · {sign.scenario}</div>
                <h1 class="mt-1 text-xl font-bold">中文原文与译文校对</h1>
              </div>
              <div class="join">
                {(["draft", "pending", "changes", "confirmed"] as ReviewStatus[]).map((value) => (
                  <button
                    key={value}
                    class={`btn join-item btn-sm ${sign.status === value ? "btn-primary" : "btn-outline"}`}
                    onClick$={() => setStatus(value)}
                  >
                    {STATUS_LABELS[value]}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {spec?.recheck === "active" && (
            <div class="alert alert-error rounded-none border-x-0 py-2 text-xs text-white">
              <span class="text-base">⚠</span>
              <span>
                <strong>现场已退回重核（牌子 {spec.code}）</strong>：{spec.recheckReason}
                <br />请调整译文后重新下发；不要缩小字号，也不要改动现场实测数字（下方实测卡为只读）。
              </span>
            </div>
          )}

          <div class="space-y-5 p-6">
            <section class="card border border-slate-200 bg-slate-50 shadow-sm">
              <div class="card-body gap-2 p-4">
                <div class="flex items-center justify-between">
                  <h2 class="text-sm font-bold text-slate-600">现场实测（只读 · 归现场班组）</h2>
                  <span class="badge badge-ghost badge-sm">服务中心不可改</span>
                </div>
                {!spec || (!area?.printWidthMm && !area?.printHeightMm && !area?.minFontMm) ? (
                  <p class="text-xs text-slate-500">这块牌子现场尚未实测可印区域与最小可读字号，版面无法判定，请等现场数据。</p>
                ) : (
                  <div class="grid grid-cols-3 gap-2 text-center text-xs">
                    <div class="rounded-lg bg-white p-2"><strong class="block text-sm">{area.panelWidthMm ?? "—"}×{area.panelHeightMm ?? "—"}mm</strong><span class="text-slate-500">牌面尺寸</span></div>
                    <div class="rounded-lg bg-white p-2"><strong class="block text-sm">{area.printWidthMm ?? "—"}×{area.printHeightMm ?? "—"}mm</strong><span class="text-slate-500">可印区域</span></div>
                    <div class="rounded-lg bg-white p-2"><strong class="block text-sm">{area.minFontMm ?? "—"}mm</strong><span class="text-slate-500">最小可读字号</span></div>
                    <div class="col-span-3 rounded-lg bg-white p-2 text-left"><span class="text-slate-500">安装位置：</span>{spec?.installLocation || "现场未填"}</div>
                  </div>
                )}
              </div>
            </section>

            <section class="card border border-slate-200 bg-white shadow-sm">
              <div class="card-body gap-4 p-5">
                <div class="flex items-center justify-between">
                  <div><div class="text-xs font-bold uppercase tracking-[0.16em] text-slate-400">Source</div><h2 class="font-bold">中文原文</h2></div>
                  <span class="badge badge-ghost">简体中文</span>
                </div>
                <textarea
                  class="textarea textarea-bordered min-h-24 w-full text-base leading-7"
                  value={sign.sourceText}
                  onInput$={(_, element) => updateActive("修改中文原文", (target) => { target.sourceText = element.value; target.status = "draft"; })}
                />
              </div>
            </section>

            <section class="card border border-slate-200 bg-white shadow-sm">
              <div class="card-body gap-4 p-5">
                <div class="grid grid-cols-2 gap-4">
                  <label class="form-control">
                    <span class="label-text mb-1 text-xs font-bold text-slate-500">目标语言</span>
                    <select class="select select-bordered" value={sign.targetLanguage} onChange$={(_, element) => updateActive("修改目标语言", (item) => { item.targetLanguage = (element as HTMLSelectElement).value; item.status = "pending"; })}>
                      {["English", "日本語", "Français", "Deutsch", "한국어", "Español"].map((language) => <option key={language}>{language}</option>)}
                    </select>
                  </label>
                  <label class="form-control">
                    <span class="label-text mb-1 text-xs font-bold text-slate-500">适用场景</span>
                    <input class="input input-bordered" value={sign.scenario} onInput$={(_, element) => updateActive("修改适用场景", (item) => { item.scenario = element.value; })} />
                  </label>
                </div>
                <label class="form-control">
                  <span class="label-text mb-1 text-xs font-bold text-slate-500">法规或规范提示</span>
                  <input class="input input-bordered" value={sign.regulation} onInput$={(_, element) => updateActive("修改法规提示", (item) => { item.regulation = element.value; })} />
                </label>
                <div class="divider my-0"></div>
                <div class="flex flex-wrap items-center justify-between gap-2">
                  <div><div class="text-xs font-bold uppercase tracking-[0.16em] text-blue-500">Target</div><h2 class="font-bold">目标语言译文</h2></div>
                  <div class="flex gap-2">
                    <button class="btn btn-sm btn-outline" onClick$={saveVersion}>保存版本快照</button>
                    <button
                      class={`btn btn-sm ${sign.dispatch.status === "failed" ? "btn-warning" : "btn-primary"}`}
                      onClick$={() => dispatchSign(sign.id)}
                    >
                      {sign.dispatch.status === "failed" ? `重试下发（已试 ${sign.dispatch.attempts} 次）` : "下发到现场"}
                    </button>
                  </div>
                </div>
                <textarea
                  class="textarea textarea-bordered min-h-36 w-full text-lg leading-8"
                  value={sign.targetText}
                  onInput$={(_, element) => updateActive("修改译文", (item) => { item.targetText = element.value; item.status = item.emergencyRevision ? "changes" : "pending"; })}
                />
                <div class="flex flex-wrap gap-2">
                  {sign.terms.map((item) => {
                    const matched = sign.targetText.toLocaleLowerCase().includes(item.target.toLocaleLowerCase());
                    return (
                      <button
                        key={item.id}
                        title="点击切换术语确认状态"
                        class={`badge badge-lg gap-1 ${matched && item.confirmed ? "badge-success" : matched ? "badge-warning" : "badge-error"}`}
                        onClick$={() => updateActive("确认术语", (target) => {
                          const current = target.terms.find((entry) => entry.id === item.id);
                          if (current) current.confirmed = !current.confirmed;
                        })}
                      >
                        {item.source} → {item.target} {matched ? (item.confirmed ? "✓" : "!") : "×"}
                      </button>
                    );
                  })}
                </div>
                {sign.dispatch.status === "failed" && (
                  <div class="alert alert-warning py-2 text-xs">
                    <span>下发失败（{sign.dispatch.lastError}）。现场那份保留上一版内容、照常可看；改好链路后点“重试下发”。</span>
                  </div>
                )}
              </div>
            </section>

            <section class="card border border-slate-200 bg-white shadow-sm">
              <div class="card-body p-5">
                <div class="flex items-center justify-between">
                  <div><h2 class="font-bold">术语绑定</h2><p class="text-xs text-slate-500">固定译法归服务中心；必选术语未出现在译文中实时告警。</p></div>
                  <span class="badge badge-outline">{sign.terms.length} 条</span>
                </div>
                <div class="mt-4 grid grid-cols-[1fr_1fr_auto] gap-2">
                  <input class="input input-sm input-bordered" placeholder="中文术语" value={termSource.value} onInput$={(_, element) => termSource.value = element.value} />
                  <input class="input input-sm input-bordered" placeholder="目标语言固定译法" value={termTarget.value} onInput$={(_, element) => termTarget.value = element.value} />
                  <button class="btn btn-sm btn-primary" onClick$={addTerm}>绑定</button>
                </div>
                <div class="mt-3 grid gap-2 md:grid-cols-2">
                  {sign.terms.map((item) => (
                    <div key={item.id} class="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2">
                      <div class="min-w-0">
                        <div class="truncate text-xs font-bold">{item.source}</div>
                        <div class="truncate text-xs text-slate-500">{item.target}</div>
                      </div>
                      <div class="flex gap-1">
                        <button class={`btn btn-xs ${item.confirmed ? "btn-success" : "btn-ghost"}`} onClick$={() => updateActive("确认术语", (target) => { const current = target.terms.find((entry) => entry.id === item.id); if (current) current.confirmed = !current.confirmed; })}>确认</button>
                        <button class="btn btn-xs btn-ghost text-error" onClick$={() => updateActive("删除术语", (target) => { target.terms = target.terms.filter((entry) => entry.id !== item.id); })}>删除</button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </section>

            <section class="card border border-slate-200 bg-white shadow-sm">
              <div class="card-body p-5">
                <h2 class="font-bold">审校意见与回复</h2>
                <div class="mt-3 flex gap-2">
                  <textarea class="textarea textarea-bordered min-h-20 flex-1" placeholder="记录措辞、文化适配或法规依据…" value={commentDraft.value} onInput$={(_, element) => commentDraft.value = element.value} />
                  <button class="btn btn-primary self-end" onClick$={addComment}>添加意见</button>
                </div>
                <div class="mt-4 space-y-3">
                  {sign.comments.length === 0 && <div class="rounded-xl border border-dashed p-6 text-center text-sm text-slate-400">还没有审校意见。</div>}
                  {sign.comments.map((comment) => (
                    <article key={comment.id} class={`rounded-xl border-l-4 bg-slate-50 p-3 ${comment.resolved ? "border-success opacity-60" : "border-warning"}`}>
                      <div class="flex items-center justify-between text-xs"><strong>{comment.author}</strong><span class="text-slate-400">{new Date(comment.createdAt).toLocaleString()}</span></div>
                      <p class="my-2 text-sm">{comment.body}</p>
                      {comment.replies.map((reply) => (
                        <div key={reply.id} class="ml-4 my-1 border-l-2 border-slate-200 pl-3 text-xs"><strong>{reply.author}</strong>：{reply.body}</div>
                      ))}
                      {replyingTo.value === comment.id ? (
                        <div class="mt-2 flex gap-2">
                          <input class="input input-xs input-bordered flex-1" value={replyDraft.value} onInput$={(_, element) => replyDraft.value = element.value} />
                          <button class="btn btn-xs btn-primary" onClick$={() => addReply(comment.id)}>发送</button>
                        </div>
                      ) : (
                        <div class="mt-2 flex gap-2">
                          <button class="btn btn-xs btn-ghost" onClick$={() => { replyingTo.value = comment.id; }}>回复</button>
                          <button class="btn btn-xs btn-ghost" onClick$={() => updateActive("更新意见状态", (target) => { const item = target.comments.find((entry) => entry.id === comment.id); if (item) item.resolved = !item.resolved; })}>{comment.resolved ? "重新打开" : "标记已解决"}</button>
                        </div>
                      )}
                    </article>
                  ))}
                </div>
              </div>
            </section>
          </div>
        </main>

        {/* 右：按实测可印区域的版面判定 + 下发记录 + 版本比较 */}
        <aside class="overflow-y-auto bg-slate-50 p-4">
          <div class="space-y-4">
            <div class="card border border-slate-200 bg-white shadow-sm">
              <div class="card-body p-4">
                <div class="flex items-center justify-between">
                  <div><div class="text-xs font-bold uppercase tracking-[0.16em] text-slate-400">Fit against measured area</div><h2 class="font-bold">按现场实测判定版面</h2></div>
                  {draftRisk === "high"
                    ? <span class="badge badge-error">排不下</span>
                    : draftRisk === "low"
                      ? <span class="badge badge-success">可排</span>
                      : <span class="badge badge-ghost">待实测</span>}
                </div>
                {verdict?.measured && area ? (
                  <>
                    <p class="mt-2 text-xs text-slate-500">
                      判定字号固定为现场最小可读字号 <strong>{area.minFontMm}mm</strong>（不缩字号）；可印区域 {area.printWidthMm}×{area.printHeightMm}mm，容量 {capacity} 行。
                    </p>
                    <div class="mt-3 overflow-auto rounded-xl bg-slate-800 p-3">
                      <div
                        class="mx-auto grid place-items-center overflow-hidden border-4 border-white bg-[#174f3d] p-2 text-center text-white"
                        style={{
                          width: `${Math.round(area.printWidthMm! * 1.4)}px`,
                          height: `${Math.round(area.printHeightMm! * 1.4)}px`,
                          fontSize: `${Math.round(area.minFontMm! * 1.4)}px`,
                        }}
                      >
                        <div class="font-black leading-[1.2] tracking-wide">
                          {verdict.lines.map((line, index) => <div key={index}>{line || " "}</div>)}
                        </div>
                      </div>
                    </div>
                    <div class="mt-3 grid grid-cols-2 gap-2 text-center text-xs">
                      <div class="rounded-lg bg-slate-100 p-2"><strong class="block text-lg">{verdict.lines.length}</strong><span>需要行数</span></div>
                      <div class="rounded-lg bg-slate-100 p-2"><strong class="block text-lg">{capacity}</strong><span>可容纳行数</span></div>
                    </div>
                    {!verdict.fits && (
                      <div class="alert alert-error mt-3 py-2 text-xs text-white">
                        <span>排不下：{verdict.reasons.join("；")}。请精简译文后重新下发；系统不自动缩字号，也不改现场数字。</span>
                      </div>
                    )}
                    {missing.length > 0 && (
                      <div class="alert alert-warning mt-3 py-2 text-xs">
                        <span>必选术语未命中：{missing.map((entry) => entry.target).join("、")}</span>
                      </div>
                    )}
                  </>
                ) : (
                  <div class="mt-3 rounded-xl border border-dashed p-5 text-center text-xs text-slate-400">现场还没量完可印区域/最小字号，无法做排印判定。</div>
                )}
              </div>
            </div>

            <div class="card border border-slate-200 bg-white shadow-sm">
              <div class="card-body p-4">
                <div class="flex items-center justify-between">
                  <div><h2 class="font-bold">下发记录</h2><p class="text-xs text-slate-500">失败后在本侧重试；失败不影响现场查看上一版。</p></div>
                  <button class="btn btn-xs btn-outline" disabled={pendingBatch === 0} onClick$={() => dispatchSign(sign.id, true)}>
                    全部下发{pendingBatch ? `（${pendingBatch}）` : ""}
                  </button>
                </div>
                <div class="mt-3 rounded-lg bg-slate-100 p-3 text-xs">
                  <div class="flex items-center justify-between">
                    <span class="font-bold">
                      {sign.dispatch.status === "delivered" ? "已下发" : sign.dispatch.status === "failed" ? `下发失败 · 第 ${sign.dispatch.attempts} 次` : "尚未下发"}
                    </span>
                    {sign.dispatch.status === "failed"
                      ? <button class="btn btn-xs btn-warning" onClick$={() => dispatchSign(sign.id)}>重试下发</button>
                      : <button class="btn btn-xs btn-primary" onClick$={() => dispatchSign(sign.id)}>下发</button>}
                  </div>
                  <div class="mt-1 text-slate-500">最近尝试：{fmt(sign.dispatch.lastAttemptAt)}　成功送达：{fmt(sign.dispatch.deliveredAt)}</div>
                  {sign.dispatch.lastError && <div class="mt-1 text-error">{sign.dispatch.lastError}</div>}
                </div>
                <div class="mt-2 max-h-36 space-y-1 overflow-y-auto text-[11px]">
                  {sign.dispatch.logs.length === 0 && <div class="text-slate-400">还没有下发记录。</div>}
                  {sign.dispatch.logs.map((entry) => (
                    <div key={entry.id} class={`rounded px-2 py-1 ${entry.ok ? "bg-success/10" : "bg-error/10"}`}>
                      <span class={entry.ok ? "text-success" : "text-error"}>#{entry.attempt} {entry.ok ? "成功" : "失败"}</span>
                      <span class="ml-2 text-slate-500">{new Date(entry.at).toLocaleString()}</span>
                      <div class="text-slate-600">{entry.detail}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div class="card border border-slate-200 bg-white shadow-sm">
              <div class="card-body p-4">
                <div class="flex items-center justify-between">
                  <div><h2 class="font-bold">版本比较</h2><p class="text-xs text-slate-500">旧版快照与当前译文逐词对比。</p></div>
                  <span class="badge badge-outline">{sign.versions.length} 版</span>
                </div>
                {sign.versions.length ? (
                  <>
                    <select class="select select-sm select-bordered mt-3 w-full" value={selectedVersion?.id ?? ""} onChange$={(_, element) => selectedVersionId.value = (element as HTMLSelectElement).value}>
                      {sign.versions.map((version) => <option key={version.id} value={version.id}>{`${version.label} · ${new Date(version.createdAt).toLocaleTimeString()}`}</option>)}
                    </select>
                    <div class="mt-3 rounded-lg bg-slate-900 p-3 text-sm leading-7 text-slate-100">
                      {comparison.map((token, index) => (
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
          </div>
        </aside>
      </div>
    );
  };

  /* ============================ 现场那份 ============================ */
  const renderField = () => {
    const sign = activeField();
    const cSign = center.value.signs.find((item) => item.id === sign.id);
    const verdict = sign.delivered
      ? evaluateFit(sign.delivered.targetText, sign.area, sign.code)
      : null;
    const measured = sign.area.printWidthMm != null && sign.area.printHeightMm != null && sign.area.minFontMm != null;
    const areaFields: { key: keyof PrintableArea; label: string }[] = [
      { key: "panelWidthMm", label: "牌面宽 (mm)" },
      { key: "panelHeightMm", label: "牌面高 (mm)" },
      { key: "printWidthMm", label: "可印区宽 (mm)" },
      { key: "printHeightMm", label: "可印区高 (mm)" },
      { key: "minFontMm", label: "最小可读字号 (mm)" },
    ];

    return (
      <div class="grid min-h-[calc(100vh-64px)] grid-cols-[300px_minmax(620px,1fr)] gap-px bg-slate-300">
        <aside class="overflow-y-auto bg-slate-50 p-3">
          <div class="mb-3 rounded-xl bg-white p-4 shadow-sm">
            <div class="text-xs font-bold uppercase tracking-[0.16em] text-slate-400">现场安装班组 · 实测清单</div>
            <div class="mt-1 text-lg font-bold text-slate-800">{field.value.signs.length} 处安装点</div>
            <p class="mt-1 text-xs leading-5 text-slate-500">本份只存实测尺寸、安装位置与实物状态；译文只看不可改。</p>
          </div>
          <div class="space-y-2">
            {field.value.signs.map((item) => {
              const itemMeasured = item.area.printWidthMm != null && item.area.printHeightMm != null && item.area.minFontMm != null;
              const itemVerdict = item.delivered ? evaluateFit(item.delivered.targetText, item.area, item.code) : null;
              return (
                <button
                  key={item.id}
                  class={`w-full rounded-xl border p-3 text-left transition ${item.id === field.value.activeSignId ? "border-emerald-400 bg-emerald-50 shadow-sm" : "border-slate-200 bg-white hover:border-slate-300"}`}
                  onClick$={() => selectSign("field", item.id)}
                >
                  <div class="flex items-center justify-between">
                    <span class="font-mono text-xs font-bold text-slate-500">{item.code}</span>
                    <span class={`badge badge-sm ${item.physicalState === "installed" ? "badge-success" : item.physicalState === "damaged" ? "badge-error" : "badge-warning"}`}>
                      {PHYSICAL_STATE_LABELS[item.physicalState]}
                    </span>
                  </div>
                  <div class="mt-2 truncate text-xs text-slate-600">{item.installLocation || "安装位置未填"}</div>
                  <div class="mt-2 flex items-center justify-between text-[11px]">
                    {item.recheck === "active"
                      ? <span class="font-bold text-error">已退回重核</span>
                      : itemVerdict?.measured
                        ? <span class={itemVerdict.fits ? "text-success" : "font-bold text-error"}>{itemVerdict.fits ? "排得下" : "排不下"}</span>
                        : <span class="text-slate-400">{itemMeasured ? "等译文下发" : "待实测"}</span>}
                    {item.delivered && <span class="text-slate-400">译文 {fmt(item.delivered.deliveredAt).slice(5)}</span>}
                  </div>
                </button>
              );
            })}
          </div>
        </aside>

        <main class="min-w-0 overflow-y-auto bg-white p-6">
          <div class="mb-4 flex items-center justify-between">
            <div>
              <div class="text-xs font-bold uppercase tracking-[0.16em] text-emerald-600">{sign.code}</div>
              <h1 class="text-xl font-bold">现场实测与安装记录</h1>
            </div>
            {sign.recheck === "active"
              ? <span class="badge badge-error">已退回服务中心重核</span>
              : sign.recheck === "resolved"
                ? <span class="badge badge-success">曾退回，复核已通过</span>
                : null}
          </div>

          <div class="space-y-5">
            <section class="card border border-slate-200 shadow-sm">
              <div class="card-body p-5">
                <h2 class="font-bold">牌面实测尺寸（mm）</h2>
                <p class="text-xs text-slate-500">数字以现场实测为准；服务中心不能修改。排印判定只使用可印区域与最小可读字号。</p>
                <div class="mt-4 grid grid-cols-3 gap-3">
                  {areaFields.map((entry) => (
                    <label key={entry.key} class="form-control">
                      <span class="label-text mb-1 text-xs font-bold text-slate-500">{entry.label}</span>
                      <input
                        type="number"
                        min="0"
                        step="0.1"
                        class="input input-bordered"
                        value={num(sign.area[entry.key])}
                        onInput$={(_, element) => updateArea(sign.id, entry.key, element.value)}
                      />
                    </label>
                  ))}
                </div>
                <div class="mt-4 grid grid-cols-[1fr_auto] gap-3">
                  <label class="form-control">
                    <span class="label-text mb-1 text-xs font-bold text-slate-500">安装位置</span>
                    <input class="input input-bordered" value={sign.installLocation} onInput$={(_, element) => patchField(sign.id, (target) => { target.installLocation = element.value; })} placeholder="例：2 号站台黄线端头" />
                  </label>
                  <label class="form-control w-44">
                    <span class="label-text mb-1 text-xs font-bold text-slate-500">实物状态</span>
                    <select
                      class="select select-bordered"
                      value={sign.physicalState}
                      onChange$={(_, element) => patchField(sign.id, (target) => { target.physicalState = (element as HTMLSelectElement).value as PhysicalState; })}
                    >
                      <option value="installed">已安装</option>
                      <option value="pending">待安装</option>
                      <option value="damaged">有破损</option>
                    </select>
                  </label>
                </div>
                <label class="form-control mt-3">
                  <span class="label-text mb-1 text-xs font-bold text-slate-500">实物状态备注</span>
                  <input class="input input-bordered" value={sign.stateNote} onInput$={(_, element) => patchField(sign.id, (target) => { target.stateNote = element.value; })} placeholder="破损、污损、光照遮挡等现场情况" />
                </label>
              </div>
            </section>

            <section class="card border border-slate-200 shadow-sm">
              <div class="card-body p-5">
                <div class="flex items-center justify-between">
                  <h2 class="font-bold">服务中心下发的译文（只读）</h2>
                  {sign.delivered && <span class="badge badge-ghost">{sign.delivered.targetLanguage} · {fmt(sign.delivered.deliveredAt)}</span>}
                </div>
                {!sign.delivered ? (
                  <div class="mt-3 rounded-xl border border-dashed p-6 text-center text-sm text-slate-400">
                    还没有收到这一块的译文。服务中心下发失败也不会清掉旧内容——收到后会显示在这里。
                  </div>
                ) : (
                  <div class="mt-3">
                    {cSign && <p class="mb-2 text-xs text-slate-500">中文原文：{cSign.sourceText}</p>}
                    <div class="rounded-xl bg-slate-50 p-4">
                      <p class="whitespace-pre-line text-lg font-semibold leading-8 text-slate-800">{sign.delivered.targetText}</p>
                    </div>
                    <div class="mt-2 flex flex-wrap gap-1">
                      {sign.delivered.terms.map((entry) => (
                        <span key={entry.id} class="badge badge-ghost badge-sm">{entry.source} → {entry.target}</span>
                      ))}
                    </div>

                    <div class="mt-4 rounded-xl border border-slate-200">
                      <div class="flex items-center justify-between border-b border-slate-200 px-4 py-2">
                        <h3 class="text-sm font-bold">按实测可印区域排印核对（不缩字号）</h3>
                        {verdict?.measured && (
                          <span class={`badge ${verdict.fits ? "badge-success" : "badge-error"}`}>{verdict.fits ? "排得下" : "排不下"}</span>
                        )}
                      </div>
                      <div class="p-4">
                        {!measured ? (
                          <p class="text-xs text-slate-500">先把可印区域宽/高与最小可读字号量齐，再做核对。</p>
                        ) : (
                          <>
                            <div class="overflow-auto rounded-lg bg-slate-800 p-3">
                              <div
                                class="mx-auto grid place-items-center overflow-hidden border-4 border-white bg-[#174f3d] p-2 text-center text-white"
                                style={{
                                  width: `${Math.round(sign.area.printWidthMm! * 1.4)}px`,
                                  height: `${Math.round(sign.area.printHeightMm! * 1.4)}px`,
                                  fontSize: `${Math.round(sign.area.minFontMm! * 1.4)}px`,
                                }}
                              >
                                <div class="font-black leading-[1.2] tracking-wide">
                                  {verdict!.lines.map((line, index) => <div key={index}>{line || " "}</div>)}
                                </div>
                              </div>
                            </div>
                            <p class="mt-2 text-xs text-slate-500">
                              需 {verdict!.lines.length} 行 / 可容纳 {verdict!.lineCapacity} 行（{sign.area.printWidthMm}×{sign.area.printHeightMm}mm，最小字号 {sign.area.minFontMm}mm）。
                            </p>
                          </>
                        )}
                      </div>
                    </div>

                    {sign.recheck === "active" && (
                      <div class="alert alert-error mt-4 text-sm text-white">
                        <span>⚠ {sign.recheckReason}</span>
                      </div>
                    )}

                    <div class="mt-4 flex flex-col items-end gap-2">
                      {sign.recheck === "active" && !verdict?.fits && verdict?.measured && (
                        <p class="text-xs text-error">最新下发的译文按实测仍需 {verdict.lines.length} 行（只能放 {verdict.lineCapacity} 行），还不能标记通过。</p>
                      )}
                      <div class="flex gap-2">
                        {sign.recheck === "active" ? (
                          <button
                            class="btn btn-sm btn-success"
                            disabled={!verdict?.fits}
                            title={verdict?.fits ? "最新下发的译文按实测已排下" : "最新译文按实测仍排不下，不能关闭退回标记"}
                            onClick$={() => toggleRecheck(sign.id)}
                          >
                            重发译文已排下 · 标记复核通过
                          </button>
                        ) : (
                          <button
                            class="btn btn-sm btn-error"
                            disabled={!measured}
                            title={measured ? "按实测排不下时退回服务中心重核" : "先量齐可印区域与最小字号"}
                            onClick$={() => toggleRecheck(sign.id)}
                          >
                            排不下 · 退回重核（牌子 {sign.code}）
                          </button>
                        )}
                      </div>
                    </div>
                    {sign.resolvedAt && <p class="mt-2 text-right text-[11px] text-slate-400">复核通过时间：{fmt(sign.resolvedAt)}</p>}
                  </div>
                )}
              </div>
            </section>
          </div>
        </main>
      </div>
    );
  };

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
        <div class="navbar-center gap-1">
          <button
            class={`btn btn-sm ${role.value === "center" ? "btn-primary" : "btn-ghost text-white"}`}
            onClick$={() => { role.value = "center"; }}
          >
            语言服务中心那份（译文·术语）
          </button>
          <button
            class={`btn btn-sm ${role.value === "field" ? "btn-success" : "btn-ghost text-white"}`}
            onClick$={() => { role.value = "field"; }}
          >
            现场那份（实测·安装）
          </button>
        </div>
        <div class="navbar-end gap-2">
          <label class="flex cursor-pointer items-center gap-1 text-xs text-slate-200" title="演练用：勾上后下一次下发会失败，现场那份不受影响">
            <input type="checkbox" class="checkbox checkbox-xs" checked={forceFail.value} onChange$={(_, element) => { forceFail.value = element.checked; }} />
            模拟下发失败
          </label>
          <span class={`badge ${online.value ? "badge-success" : "badge-warning"} badge-outline`}>{online.value ? "在线" : "离线"}</span>
          {role.value === "center" && (
            <>
              <button class="btn btn-ghost btn-sm" disabled={!past.value.length} onClick$={undo}>撤销</button>
              <button class="btn btn-ghost btn-sm" disabled={!future.value.length} onClick$={redo}>重做</button>
              <button class="btn btn-sm border-white/20 bg-white/10 text-white hover:bg-white/20" onClick$={sharePreview}>复制只读链接</button>
              <button class={`btn btn-sm ${activeCenter().emergencyRevision ? "btn-error" : "btn-warning"}`} onClick$={toggleEmergency}>
                {activeCenter().emergencyRevision ? "退出紧急修订" : "紧急修订"}
              </button>
            </>
          )}
        </div>
      </header>

      {migrated.value && (
        <div class="alert alert-info rounded-none border-x-0 py-2 text-xs">
          <span>已把本机旧合并稿按归属拆分：译文/术语/审校结论迁入“服务中心那份”，安装地点线索迁入“现场那份”（尺寸留空待实测）；旧合并稿已停用。</span>
        </div>
      )}

      {role.value === "center" ? renderCenter() : renderField()}

      {toast.value && (
        <div class="toast toast-end z-50" onClick$={() => { toast.value = ""; }}>
          <div class="alert alert-success"><span>{toast.value}</span></div>
        </div>
      )}
    </div>
  );
});
