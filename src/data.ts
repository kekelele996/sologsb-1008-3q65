import type {
  DispatchStatus,
  PhysicalStatus,
  ReviewStatus,
  ServiceRecord,
  SignItem,
  SignProject,
  SiteRecord,
  TermBinding,
  Workspace,
} from "./types";

export const uid = (prefix: string) =>
  `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

export const STATUS_LABELS: Record<ReviewStatus, string> = {
  draft: "草稿",
  pending: "待确认",
  confirmed: "已确认",
  changes: "需修改",
};

export const PHYSICAL_LABELS: Record<PhysicalStatus, string> = {
  unmeasured: "未实测",
  measured: "已实测",
  producing: "生产中",
  installed: "已安装",
  accepted: "已验收",
  damaged: "损坏",
};

export const DISPATCH_LABELS: Record<DispatchStatus, string> = {
  idle: "未下发",
  dispatching: "下发中",
  dispatched: "已下发",
  failed: "下发失败",
};

const term = (source: string, target: string, confirmed = false, required = true): TermBinding => ({
  id: uid("term"),
  source,
  target,
  required,
  confirmed,
});

/** 按场景给一版默认实测尺寸（mm）。仅用于无旧数据时的种子，现场班组可实测改写。 */
function defaultDimensions(scenario: string): Pick<SiteRecord, "faceWidth" | "faceHeight" | "printableWidth" | "printableHeight" | "minFontSize"> {
  if (scenario.includes("站台") || scenario.includes("轨道")) {
    return { faceWidth: 1000, faceHeight: 600, printableWidth: 900, printableHeight: 460, minFontSize: 28 };
  }
  if (scenario.includes("疏散") || scenario.includes("消防")) {
    // 紧急出口小牌：可印区域小、最小字号偏大，长译文会排不下 → 退回重核
    return { faceWidth: 300, faceHeight: 200, printableWidth: 240, printableHeight: 120, minFontSize: 20 };
  }
  if (scenario.includes("公园") || scenario.includes("服务")) {
    return { faceWidth: 500, faceHeight: 350, printableWidth: 440, printableHeight: 260, minFontSize: 20 };
  }
  if (scenario.includes("医院")) {
    return { faceWidth: 450, faceHeight: 320, printableWidth: 390, printableHeight: 230, minFontSize: 20 };
  }
  return { faceWidth: 600, faceHeight: 400, printableWidth: 520, printableHeight: 280, minFontSize: 22 };
}

export function createSiteRecord(
  signId: string,
  code: string,
  scenario: string,
  position: string,
  physical: PhysicalStatus = "measured",
): SiteRecord {
  const now = new Date().toISOString();
  return {
    signId,
    code,
    position,
    ...defaultDimensions(scenario),
    physicalStatus: physical,
    measuredAt: now,
    updatedAt: now,
  };
}

function createServiceRecord(sign: SignItem): ServiceRecord {
  return {
    signId: sign.id,
    code: sign.code,
    sourceText: sign.sourceText,
    targetLanguage: sign.targetLanguage,
    targetText: sign.targetText,
    scenario: sign.scenario,
    regulation: sign.regulation,
    status: sign.status,
    terms: sign.terms,
    comments: sign.comments,
    versions: sign.versions,
    emergencyRevision: sign.emergencyRevision,
    dispatchStatus: "idle",
    updatedAt: sign.updatedAt,
  };
}

export function createSeedWorkspace(): Workspace {
  const project = createSeedProject();
  return {
    meta: {
      title: project.title,
      location: project.location,
      activeSignId: project.activeSignId,
      updatedAt: project.updatedAt,
    },
    service: project.signs.map(createServiceRecord),
    site: project.signs.map((sign) =>
      createSiteRecord(sign.id, sign.code, sign.scenario, project.location, "measured"),
    ),
  };
}

/**
 * 本机旧数据按归属迁移到两边：
 * 译文、术语、审校结论归服务中心；尺寸、安装位置、实物状态归现场。
 * 旧稿没有实测尺寸，用场景默认值补齐，由现场班组实测改写（不替现场改数字）。
 */
export function migrateProject(project: SignProject): Workspace {
  const now = new Date().toISOString();
  return {
    meta: {
      title: project.title,
      location: project.location,
      activeSignId: project.activeSignId,
      updatedAt: project.updatedAt || now,
    },
    service: project.signs.map(createServiceRecord),
    site: project.signs.map((sign) =>
      createSiteRecord(sign.id, sign.code, sign.scenario, project.location, "measured"),
    ),
  };
}

export const createSeedProject = (): SignProject => {
  const signs: SignItem[] = [
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
      status: "changes",
      terms: [term("直饮水", "飲料水"), term("水槽", "排水口")],
      comments: [],
      versions: [],
      emergencyRevision: false,
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
      updatedAt: "2026-09-24T04:15:00.000Z",
    },
  ];

  return {
    id: "public-sign-review-1008",
    title: "城市公共标识多语言校对",
    location: "滨海交通枢纽一期",
    activeSignId: signs[0].id,
    signs,
    updatedAt: new Date().toISOString(),
  };
};
