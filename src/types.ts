export type ReviewStatus = "draft" | "pending" | "confirmed" | "changes";

/** 现场实物状态：由安装班组维护，服务中心只读。 */
export type PhysicalStatus = "unmeasured" | "measured" | "producing" | "installed" | "accepted" | "damaged";

/** 服务中心下发状态。 */
export type DispatchStatus = "idle" | "dispatching" | "dispatched" | "failed";

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

export interface SignItem {
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
  updatedAt: string;
}

export interface SignProject {
  id: string;
  title: string;
  location: string;
  activeSignId: string;
  signs: SignItem[];
  updatedAt: string;
}

export interface PersistedProject {
  schema: 1;
  project: SignProject;
}

/**
 * 现场那份：只存实测尺寸、安装位置和实物状态。
 * 尺寸为现场实测数字，服务中心不得改写；排不下时退回重核。
 */
export interface SiteRecord {
  signId: string;
  code: string;
  /** 安装位置 */
  position: string;
  /** 牌面宽度（实测，mm） */
  faceWidth: number;
  /** 牌面高度（实测，mm） */
  faceHeight: number;
  /** 可印区域宽度（实测，mm） */
  printableWidth: number;
  /** 可印区域高度（实测，mm） */
  printableHeight: number;
  /** 最小可读字号（实测，mm）；译文不得小于它，也不自动缩字号 */
  minFontSize: number;
  physicalStatus: PhysicalStatus;
  measuredAt: string;
  updatedAt: string;
}

/**
 * 服务中心那份：只存译文、术语与审校结论。
 * 不持有任何实测尺寸；版面是否可印以现场那份为准。
 */
export interface ServiceRecord {
  signId: string;
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
  dispatchStatus: DispatchStatus;
  dispatchError?: string;
  dispatchedAt?: string;
  updatedAt: string;
}

/** 两边各管各的，通过 signId 对齐同一块牌子。 */
export interface Workspace {
  meta: {
    title: string;
    location: string;
    activeSignId: string;
    updatedAt: string;
  };
  site: SiteRecord[];
  service: ServiceRecord[];
}

export interface PersistedSite {
  schema: 1;
  records: SiteRecord[];
}

export interface PersistedService {
  schema: 1;
  meta: Workspace["meta"];
  records: ServiceRecord[];
}

export interface DiffToken {
  type: "same" | "add" | "remove";
  value: string;
}
