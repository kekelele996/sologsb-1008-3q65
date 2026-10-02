import type { DiffToken, FitVerdict, PrintableArea, TermBinding } from "./types";

const CJK_RE = /[㐀-鿿぀-ヿ가-힯]/;

/**
 * 按给定字号（mm）做保守换行估算，用于“排不排得下”的判定。
 * 判定专用，不改变现场实测的任何数字。
 */
export function layoutLines(text: string, printWidthMm: number, fontMm: number, lineHeight = 1.2) {
  if (!text.trim()) return [];
  const usable = Math.max(1, printWidthMm);
  const lines: string[] = [];
  for (const hardLine of text.split("\n")) {
    if (!hardLine) {
      lines.push("");
      continue;
    }
    let current = "";
    let currentWidth = 0;
    for (const char of hardLine) {
      const charWidth = CJK_RE.test(char) ? fontMm : char === " " ? fontMm * 0.35 : fontMm * 0.6;
      if (current && currentWidth + charWidth > usable) {
        lines.push(current.trimEnd());
        current = char.trimStart();
        currentWidth = charWidth;
      } else {
        current += char;
        currentWidth += charWidth;
      }
    }
    if (current) lines.push(current.trimEnd());
  }
  return lines;
}

export function lineCapacityFor(area: Pick<PrintableArea, "printHeightMm" | "minFontMm">, lineHeight = 1.2) {
  if (area.printHeightMm == null || area.minFontMm == null) return null;
  return Math.max(1, Math.floor(area.printHeightMm / (area.minFontMm * lineHeight)));
}

/**
 * 版面判定：只用现场实测的可印区域与最小可读字号。
 * 排不下 → fits=false 并给出原因；绝不通过缩字号来“排下”。
 */
export function evaluateFit(
  text: string,
  area: PrintableArea,
  code: string,
): FitVerdict {
  const { printWidthMm, printHeightMm, minFontMm } = area;
  if (printWidthMm == null || printHeightMm == null || minFontMm == null) {
    return { fits: false, measured: false, lines: [], lineCapacity: 0, reasons: ["现场尚未实测可印区域与最小可读字号"] };
  }
  const lines = layoutLines(text, printWidthMm, minFontMm);
  const capacity = lineCapacityFor(area)!;
  const overflow = lines.length > capacity;
  const reasons: string[] = [];
  if (overflow) {
    reasons.push(
      `牌子 ${code}：按最小可读字号 ${minFontMm}mm、可印区域 ${printWidthMm}×${printHeightMm}mm 排版需 ${lines.length} 行，区域只能容纳 ${capacity} 行，排不下`,
    );
  }
  return { fits: !overflow, measured: true, lines, lineCapacity: capacity, reasons };
}

/** 必选术语未命中检查（服务中心职责）。 */
export function missingRequiredTerms(targetText: string, terms: TermBinding[]) {
  return terms.filter(
    (term) => term.required && !targetText.toLocaleLowerCase().includes(term.target.toLocaleLowerCase()),
  );
}

function tokenize(value: string) {
  return value.match(/[㐀-鿿]|[A-Za-zÀ-ÿ0-9''\-]+|\s+|./gu) ?? [];
}

function lcsTable(left: string[], right: string[]) {
  const table = Array.from({ length: left.length + 1 }, () => new Uint16Array(right.length + 1));
  for (let i = left.length - 1; i >= 0; i -= 1) {
    for (let j = right.length - 1; j >= 0; j -= 1) {
      table[i][j] = left[i] === right[j]
        ? table[i + 1][j + 1] + 1
        : Math.max(table[i + 1][j], table[i][j + 1]);
    }
  }
  return table;
}

export function diffText(oldText: string, newText: string): DiffToken[] {
  const left = tokenize(oldText);
  const right = tokenize(newText);
  if (left.length * right.length > 180000) {
    return [{ type: "remove", value: oldText }, { type: "add", value: newText }];
  }
  const table = lcsTable(left, right);
  const tokens: DiffToken[] = [];
  let i = 0;
  let j = 0;
  const push = (type: DiffToken["type"], value: string) => {
    const previous = tokens.at(-1);
    if (previous?.type === type) previous.value += value;
    else tokens.push({ type, value });
  };
  while (i < left.length && j < right.length) {
    if (left[i] === right[j]) {
      push("same", left[i]);
      i += 1;
      j += 1;
    } else if (table[i + 1][j] >= table[i][j + 1]) {
      push("remove", left[i]);
      i += 1;
    } else {
      push("add", right[j]);
      j += 1;
    }
  }
  while (i < left.length) push("remove", left[i++]);
  while (j < right.length) push("add", right[j++]);
  return tokens;
}

export function cloneTerms(terms: TermBinding[]) {
  return structuredClone(terms);
}
