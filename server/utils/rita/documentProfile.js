const path = require("path");

const DEFAULT_DIRECT_TOKEN_LIMIT = 6_000;
const DEFAULT_DOCUMENT_CONTEXT_CHARS = 18_000;
const DEFAULT_RELEVANT_LINE_LIMIT = 80;

function extensionFromName(filename = "") {
  const ext = path
    .extname(filename || "")
    .replace(".", "")
    .toLowerCase();
  return ext || "unknown";
}

function compactWhitespace(text = "") {
  return String(text || "")
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function estimateTokens(content = "", providedEstimate = null) {
  const numericEstimate = Number(providedEstimate);
  if (Number.isFinite(numericEstimate) && numericEstimate > 0)
    return Math.ceil(numericEstimate);
  return Math.ceil(String(content || "").length / 4);
}

function sizeClass(tokenEstimate = 0) {
  if (tokenEstimate <= 2_000) return "small";
  if (tokenEstimate <= 6_000) return "medium";
  if (tokenEstimate <= 16_000) return "large";
  return "huge";
}

function recommendedMode(tokenEstimate = 0) {
  if (tokenEstimate <= DEFAULT_DIRECT_TOKEN_LIMIT) return "direct_context";
  if (tokenEstimate <= 16_000) return "bounded_context";
  return "rag_summary";
}

function countMatches(content = "", regex) {
  return String(content || "").match(regex)?.length || 0;
}

function tableLikeLineCount(lines = []) {
  return lines.filter((line) => {
    const text = line.trim();
    if (!text) return false;
    if (text.includes(",") || text.includes("\t") || text.includes("|"))
      return /\d/.test(text);
    return /\d/.test(text) && /\s{2,}/.test(line);
  }).length;
}

function buildDocumentProfile({
  filename = "uploaded file",
  content = "",
  metadata = {},
  tokenCountEstimate = null,
} = {}) {
  const normalizedContent = compactWhitespace(content);
  const lines = normalizedContent.split("\n").filter(Boolean);
  const tokens = estimateTokens(
    normalizedContent,
    tokenCountEstimate ?? metadata?.token_count_estimate
  );
  const numericValueCount = countMatches(
    normalizedContent,
    /(?:^|[\s,|])[-+]?\d+(?:[.,]\d+)?%?/g
  );
  const dateLikeCount = countMatches(
    normalizedContent,
    /\b(?:\d{4}|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec|q[1-4])\b/gi
  );
  const tableLines = tableLikeLineCount(lines);
  const extension = extensionFromName(filename || metadata?.title);
  const isStructuredFile = ["csv", "xls", "xlsx", "tsv"].includes(extension);
  const hasChartSignals =
    isStructuredFile || tableLines >= 3 || numericValueCount >= 10;

  const warnings = [];
  if (!normalizedContent) warnings.push("empty_extraction");
  if (tokens > DEFAULT_DIRECT_TOKEN_LIMIT) warnings.push("large_context");
  if (!hasChartSignals) warnings.push("no_clear_chart_data");

  return {
    filename,
    type: extension,
    status: normalizedContent ? "ready" : "unreadable",
    sizeClass: sizeClass(tokens),
    recommendedMode: recommendedMode(tokens),
    estimatedTokens: tokens,
    characterCount: normalizedContent.length,
    wordCount:
      Number(metadata?.wordCount) ||
      normalizedContent.split(/\s+/).filter(Boolean).length,
    lineCount: lines.length,
    tableLikeLineCount: tableLines,
    numericValueCount,
    dateLikeCount,
    chartReadiness: hasChartSignals
      ? isStructuredFile || tableLines >= 8
        ? "high"
        : "medium"
      : "low",
    warnings,
  };
}

function profileToPromptText(profile = {}) {
  if (!profile || Object.keys(profile).length === 0) return "";
  return [
    "<document_profile>",
    `filename: ${profile.filename || "uploaded file"}`,
    `type: ${profile.type || "unknown"}`,
    `status: ${profile.status || "unknown"}`,
    `size: ${profile.sizeClass || "unknown"}`,
    `recommended_mode: ${profile.recommendedMode || "unknown"}`,
    `estimated_tokens: ${profile.estimatedTokens || 0}`,
    `word_count: ${profile.wordCount || 0}`,
    `line_count: ${profile.lineCount || 0}`,
    `table_like_lines: ${profile.tableLikeLineCount || 0}`,
    `numeric_values: ${profile.numericValueCount || 0}`,
    `date_like_values: ${profile.dateLikeCount || 0}`,
    `chart_readiness: ${profile.chartReadiness || "unknown"}`,
    `warnings: ${(profile.warnings || []).join(", ") || "none"}`,
    "</document_profile>",
  ].join("\n");
}

function queryTerms(query = "") {
  const stopWords = new Set([
    "the",
    "and",
    "for",
    "with",
    "that",
    "this",
    "from",
    "into",
    "rita",
    "report",
    "graph",
    "chart",
    "generate",
    "create",
    "please",
  ]);
  return [
    ...new Set(
      String(query || "")
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, " ")
        .split(/\s+/)
        .map((term) => term.trim())
        .filter((term) => term.length >= 3 && !stopWords.has(term))
    ),
  ];
}

function relevantLines({
  content = "",
  query = "",
  limit = DEFAULT_RELEVANT_LINE_LIMIT,
} = {}) {
  const terms = queryTerms(query);
  const lines = compactWhitespace(content).split("\n").filter(Boolean);
  const scored = lines
    .map((line, index) => {
      const lower = line.toLowerCase();
      let score = 0;
      for (const term of terms) if (lower.includes(term)) score += 3;
      if (/\d/.test(line)) score += 1;
      if (line.includes(",") || line.includes("\t") || line.includes("|"))
        score += 2;
      if (
        /\b(total|sales|revenue|month|year|trend|category|region)\b/i.test(line)
      )
        score += 2;
      return { line, index, score };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, limit)
    .sort((a, b) => a.index - b.index);

  return scored.map((item) => item.line).join("\n");
}

function boundedDocumentContext({
  content = "",
  profile = {},
  query = "",
  maxChars = DEFAULT_DOCUMENT_CONTEXT_CHARS,
} = {}) {
  const normalized = compactWhitespace(content);
  const profileText = profileToPromptText(profile);
  if (!normalized) return profileText;

  if ((profile?.estimatedTokens || 0) <= DEFAULT_DIRECT_TOKEN_LIMIT) {
    return [profileText, normalized].filter(Boolean).join("\n\n");
  }

  const relevant = relevantLines({ content: normalized, query });
  const head = normalized.slice(0, Math.floor(maxChars * 0.35));
  const tail = normalized.slice(-Math.floor(maxChars * 0.15));
  const excerpt = [
    "<context_policy>",
    "This document is large. RITA is using a bounded excerpt plus the document profile. Use RAG search for extra details instead of assuming the full document is visible.",
    "</context_policy>",
    relevant ? `<relevant_excerpt>\n${relevant}\n</relevant_excerpt>` : null,
    `<opening_excerpt>\n${head}\n</opening_excerpt>`,
    `<closing_excerpt>\n${tail}\n</closing_excerpt>`,
  ]
    .filter(Boolean)
    .join("\n\n");

  return [profileText, excerpt]
    .filter(Boolean)
    .join("\n\n")
    .slice(0, maxChars + profileText.length + 1_000);
}

module.exports = {
  buildDocumentProfile,
  boundedDocumentContext,
  profileToPromptText,
  DEFAULT_DIRECT_TOKEN_LIMIT,
  DEFAULT_DOCUMENT_CONTEXT_CHARS,
};
