export type ReviewStatus = "draft" | "pending" | "confirmed" | "changes";

/** 退回重核状态：由现场按实测可印区域判定，服务中心不能自行关闭。 */
export type RecheckState = "none" | "active" | "resolved";

/** 实物状态归现场记录。 */
export type PhysicalState = "installed" | "pending" | "damaged";

export type Owner = "center" | "field";

export interface Reply {
  id: string;
  author: string;
  body: string;
  createdAt: string;
}

export interface ReviewComment {
  id: string;
  author: string;
  body: string;
  createdAt: string;
  resolved: boolean;
  replies: Reply[];
}

export interface TermBinding {
  id: string;
  source: string;
  target: string;
  required: boolean;
  confirmed: boolean;
}

export interface VersionSnapshot {
  id: string;
  label: string;
  createdAt: string;
  sourceText: string;
  targetText: string;
  status: ReviewStatus;
  terms: TermBinding[];
}

/* ---------------- 服务中心：只存译文、术语与审校结论 ---------------- */

/** 下发日志条目（attempts 累计，失败不清除，重试从这边继续）。 */
export interface DispatchLog {
  id: string;
  attempt: number;
  ok: boolean;
  at: string;
  detail: string;
}

/**
 * 当前下发状态。
 * - failed：本次下发失败，现场那份保留上一版可看内容，服务中心按此重试。
 * - delivered：现场已收到并可查看。
 */
export interface DispatchState {
  status: "idle" | "delivered" | "failed";
  attempts: number;
  lastAttemptAt: string | null;
  deliveredAt: string | null;
  lastError: string;
  /** 最近一次成功送达的译文摘要（随下发写进现场那份）。 */
  deliveredTargetText: string;
  deliveredTerms: TermBinding[];
  logs: DispatchLog[];
}

export interface CenterSign {
  id: string;
  code: string;
  sourceText: string;
  targetLanguage: string;
  targetText: string;
  scenario: string;
  regulation: string;
  status: ReviewStatus;
  terms: TermBinding[];
  comments: ReviewComment[];
  versions: VersionSnapshot[];
  emergencyRevision: boolean;
  dispatch: DispatchState;
  updatedAt: string;
}

export interface CenterStore {
  schema: 2;
  id: string;
  title: string;
  activeSignId: string;
  signs: CenterSign[];
  updatedAt: string;
}

/* ---------------- 现场班组：只存实测尺寸、安装位置、实物状态 ---------------- */

export interface PrintableArea {
  /** 牌面整体尺寸（mm，实测）。 */
  panelWidthMm: number | null;
  panelHeightMm: number | null;
  /** 可印区域（mm，实测）；排印判定只用这一组数字。 */
  printWidthMm: number | null;
  printHeightMm: number | null;
  /** 最小可读字号（mm，实测），版面判定一律用该字号，不允许缩小。 */
  minFontMm: number | null;
}

export interface DeliveredPackage {
  /** 由服务中心下发写入；服务中心可更新，现场只读。 */
  targetLanguage: string;
  targetText: string;
  terms: TermBinding[];
  deliveredAt: string;
}

export interface FieldSign {
  id: string;
  code: string;
  area: PrintableArea;
  installLocation: string;
  physicalState: PhysicalState;
  stateNote: string;
  recheck: RecheckState;
  /** 退回重核时现场标注的原因（哪块牌子、排不下的判定）。 */
  recheckReason: string;
  recheckAt: string | null;
  resolvedAt: string | null;
  /** 最近一次成功下发的译文；下发失败不动它，现场照旧能看。 */
  delivered: DeliveredPackage | null;
  updatedAt: string;
}

export interface FieldStore {
  schema: 2;
  id: string;
  activeSignId: string;
  signs: FieldSign[];
  updatedAt: string;
}

/* ---------------- 版面判定：只按现场实测数字，不改数字、不缩字号 ---------------- */

export interface FitVerdict {
  fits: boolean;
  measured: boolean;
  lines: string[];
  lineCapacity: number;
  reasons: string[];
}

export interface DiffToken {
  type: "same" | "add" | "remove";
  value: string;
}
