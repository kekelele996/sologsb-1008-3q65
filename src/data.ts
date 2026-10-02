import type {
  CenterSign,
  CenterStore,
  DispatchState,
  FieldSign,
  FieldStore,
  PhysicalState,
  ReviewStatus,
  TermBinding,
} from "./types";

export const uid = (prefix: string) =>
  `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

export const STATUS_LABELS: Record<ReviewStatus, string> = {
  draft: "草稿",
  pending: "待确认",
  confirmed: "已确认",
  changes: "需修改",
};

export const PHYSICAL_STATE_LABELS: Record<PhysicalState, string> = {
  installed: "已安装",
  pending: "待安装",
  damaged: "有破损",
};

const CENTER_KEY = "sologsb-1008-center-v2";
const FIELD_KEY = "sologsb-1008-field-v2";
/** 合并稿时代的旧键，迁移后删除。 */
export const LEGACY_STORAGE_KEY = "sologsb-1008-project-v1";
export const CENTER_STORAGE_KEY = CENTER_KEY;
export const FIELD_STORAGE_KEY = FIELD_KEY;

const term = (source: string, target: string, confirmed = false, required = true): TermBinding => ({
  id: uid("term"),
  source,
  target,
  required,
  confirmed,
});

const idleDispatch = (): DispatchState => ({
  status: "idle",
  attempts: 0,
  lastAttemptAt: null,
  deliveredAt: null,
  lastError: "",
  deliveredTargetText: "",
  deliveredTerms: [],
  logs: [],
});

/** 已成功下发一次的初始状态（仅示例数据使用）。 */
const deliveredDispatch = (targetText: string, terms: TermBinding[], at: string): DispatchState => ({
  status: "delivered",
  attempts: 1,
  lastAttemptAt: at,
  deliveredAt: at,
  lastError: "",
  deliveredTargetText: targetText,
  deliveredTerms: structuredClone(terms),
  logs: [{ id: uid("log"), attempt: 1, ok: true, at, detail: "示例数据：已下发" }],
});

export const createSeedCenter = (): CenterStore => {
  const signs: CenterSign[] = [
    {
      id: "sign-platform",
      code: "TR-01",
      sourceText: "候车区。请在黄线内排队，照看好随身物品。",
      targetLanguage: "English",
      targetText: "Waiting Area\nPlease queue behind the yellow line and keep your belongings with you.",
      scenario: "轨道交通站台",
      regulation: "GB/T 10001.1-2023 公共信息图形符号",
      status: "pending",
      terms: [term("候车区", "Waiting Area"), term("黄线", "yellow line")],
      comments: [],
      versions: [],
      emergencyRevision: false,
      dispatch: idleDispatch(),
      updatedAt: "2026-09-21T09:20:00.000Z",
    },
    {
      id: "sign-exit",
      code: "EM-02",
      sourceText: "紧急出口。发生紧急情况时，请按指示方向迅速撤离，不要乘坐电梯。",
      targetLanguage: "English",
      targetText: "EMERGENCY EXIT\nIn an emergency, leave quickly in the direction shown. Do not use the elevator.",
      scenario: "商场疏散通道",
      regulation: "GB 13495.1-2015 消防安全标志",
      status: "confirmed",
      terms: [term("紧急出口", "EMERGENCY EXIT", true), term("电梯", "elevator", true)],
      comments: [],
      versions: [],
      emergencyRevision: false,
      dispatch: idleDispatch(),
      updatedAt: "2026-09-18T06:10:00.000Z",
    },
    {
      id: "sign-water",
      code: "SV-03",
      sourceText: "直饮水。请勿将茶叶、果皮等杂物丢入水槽。",
      targetLanguage: "日本語",
      targetText: "飲料水\n茶殻や果物の皮などを流さないでください。",
      scenario: "公园服务亭",
      regulation: "城市公共设施双语标识译写规范",
      status: "confirmed",
      terms: [term("直饮水", "飲料水"), term("水槽", "排水口")],
      comments: [],
      versions: [],
      emergencyRevision: false,
      dispatch: idleDispatch(),
      updatedAt: "2026-09-23T02:40:00.000Z",
    },
    {
      id: "sign-smoking",
      code: "PR-07",
      sourceText: "禁止吸烟。包括电子烟。",
      targetLanguage: "Français",
      targetText: "INTERDICTION DE FUMER\nCigarettes électroniques incluses.",
      scenario: "医院入口",
      regulation: "公共场所卫生管理条例实施细则",
      status: "draft",
      terms: [term("禁止吸烟", "INTERDICTION DE FUMER"), term("电子烟", "Cigarettes électroniques")],
      comments: [],
      versions: [],
      emergencyRevision: false,
      dispatch: idleDispatch(),
      updatedAt: "2026-09-24T04:15:00.000Z",
    },
  ];

  // 示例：前三块已经下发过；直饮水那块现场判定排不下、已退回重核。
  const deliveredAt = "2026-09-25T03:00:00.000Z";
  signs[0].dispatch = deliveredDispatch(signs[0].targetText, signs[0].terms, deliveredAt);
  signs[1].dispatch = deliveredDispatch(signs[1].targetText, signs[1].terms, deliveredAt);
  signs[2].dispatch = deliveredDispatch(signs[2].targetText, signs[2].terms, deliveredAt);

  return {
    schema: 2,
    id: "public-sign-review-1008-center",
    title: "城市公共标识多语言校对",
    activeSignId: signs[0].id,
    signs,
    updatedAt: new Date().toISOString(),
  };
};

export const createSeedField = (): FieldStore => {
  const make = (
    id: string,
    code: string,
    installLocation: string,
    area: FieldSign["area"],
    physicalState: PhysicalState,
    deliveredFrom: CenterSign | null,
  ): FieldSign => ({
    id,
    code,
    area,
    installLocation,
    physicalState,
    stateNote: "",
    recheck: "none",
    recheckReason: "",
    recheckAt: null,
    resolvedAt: null,
    delivered: deliveredFrom
      ? {
          targetLanguage: deliveredFrom.targetLanguage,
          targetText: deliveredFrom.targetText,
          terms: structuredClone(deliveredFrom.terms),
          deliveredAt: deliveredFrom.dispatch.deliveredAt ?? new Date().toISOString(),
        }
      : null,
    updatedAt: new Date().toISOString(),
  });

  const center = createSeedCenter();
  const byId = new Map(center.signs.map((sign) => [sign.id, sign]));

  const signs: FieldSign[] = [
    make(
      "sign-platform",
      "TR-01",
      "滨海交通枢纽一期 · 2 号站台黄线端头",
      { panelWidthMm: 800, panelHeightMm: 300, printWidthMm: 720, printHeightMm: 220, minFontMm: 32 },
      "installed",
      byId.get("sign-platform")!,
    ),
    make(
      "sign-exit",
      "EM-02",
      "西中庭 3 号疏散通道门楣",
      { panelWidthMm: 600, panelHeightMm: 400, printWidthMm: 520, printHeightMm: 300, minFontMm: 32 },
      "installed",
      byId.get("sign-exit")!,
    ),
    (() => {
      // 示例：现场实测可印区域排不下已下发译文（140mm 高 / 32mm 最小字号只能放 3 行）。
      const water = make(
        "sign-water",
        "SV-03",
        "中央公园东服务亭洗手台上方",
        { panelWidthMm: 300, panelHeightMm: 180, printWidthMm: 240, printHeightMm: 140, minFontMm: 32 },
        "installed",
        byId.get("sign-water")!,
      );
      water.recheck = "active";
      water.recheckReason = "按最小可读字号 32mm 与可印区域 240×140mm 排版，译文超过 3 行排不下，退回服务中心重核。";
      water.recheckAt = "2026-09-26T01:10:00.000Z";
      return water;
    })(),
    make(
      "sign-smoking",
      "PR-07",
      "市立医院门诊楼主入口右侧立柱",
      { panelWidthMm: 400, panelHeightMm: 300, printWidthMm: 340, printHeightMm: 240, minFontMm: 30 },
      "pending",
      byId.get("sign-smoking")!,
    ),
  ];

  return {
    schema: 2,
    id: "public-sign-review-1008-field",
    activeSignId: signs[0].id,
    signs,
    updatedAt: new Date().toISOString(),
  };
};

/* ---------------- 旧数据迁移：按归属拆到两边 ---------------- */

interface LegacySign {
  id?: unknown;
  code?: unknown;
  sourceText?: unknown;
  targetLanguage?: unknown;
  targetText?: unknown;
  scenario?: unknown;
  regulation?: unknown;
  status?: unknown;
  terms?: unknown;
  comments?: unknown;
  versions?: unknown;
  emergencyRevision?: unknown;
  updatedAt?: unknown;
}

interface LegacyProject {
  id?: unknown;
  title?: unknown;
  location?: unknown;
  activeSignId?: unknown;
  signs?: LegacySign[];
  updatedAt?: unknown;
}

const str = (value: unknown, fallback = "") => (typeof value === "string" ? value : fallback);

/**
 * 把合并稿时代的本地数据按归属拆开：
 * 译文、术语、审校结论 → 服务中心；实测尺寸旧稿里没有 → 现场留空待实测。
 * 仅在新两份都不存在时执行，完成后旧键删除，之后才启用新稿。
 */
export function migrateLegacy(rawLegacy: string): { center: CenterStore; field: FieldStore } {
  const parsed = JSON.parse(rawLegacy) as { project?: LegacyProject };
  const legacy = parsed.project ?? (parsed as unknown as LegacyProject);
  const list = Array.isArray(legacy.signs) ? legacy.signs : [];

  const now = new Date().toISOString();
  const centerSigns: CenterSign[] = list.map((sign) => {
    const id = str(sign.id, uid("sign"));
    const targetText = str(sign.targetText);
    const terms = Array.isArray(sign.terms) ? (sign.terms as TermBinding[]) : [];
    const status = (["draft", "pending", "confirmed", "changes"].includes(str(sign.status))
      ? str(sign.status)
      : "draft") as ReviewStatus;
    return {
      id,
      code: str(sign.code),
      sourceText: str(sign.sourceText),
      targetLanguage: str(sign.targetLanguage, "English"),
      targetText,
      scenario: str(sign.scenario),
      regulation: str(sign.regulation),
      status,
      terms,
      comments: Array.isArray(sign.comments) ? (sign.comments as CenterSign["comments"]) : [],
      versions: Array.isArray(sign.versions) ? (sign.versions as CenterSign["versions"]) : [],
      emergencyRevision: Boolean(sign.emergencyRevision),
      dispatch: idleDispatch(),
      updatedAt: str(sign.updatedAt, now),
    } satisfies CenterSign;
  });

  const fieldSigns: FieldSign[] = list.map((sign) => ({
    id: str(sign.id),
    code: str(sign.code),
    area: { panelWidthMm: null, panelHeightMm: null, printWidthMm: null, printHeightMm: null, minFontMm: null },
    // 旧稿的项目地点不是逐牌实测位置，只作为待核对的线索带过来。
    installLocation: str(legacy.location),
    physicalState: "pending",
    stateNote: "",
    recheck: "none",
    recheckReason: "",
    recheckAt: null,
    resolvedAt: null,
    delivered: null,
    updatedAt: now,
  }));

  const center: CenterStore = {
    schema: 2,
    id: "public-sign-review-1008-center",
    title: str(legacy.title, "城市公共标识多语言校对"),
    activeSignId: centerSigns.some((sign) => sign.id === str(legacy.activeSignId)) ? str(legacy.activeSignId) : (centerSigns[0]?.id ?? ""),
    signs: centerSigns,
    updatedAt: now,
  };

  const field: FieldStore = {
    schema: 2,
    id: "public-sign-review-1008-field",
    activeSignId: center.activeSignId,
    signs: fieldSigns,
    updatedAt: now,
  };

  return { center, field };
}
