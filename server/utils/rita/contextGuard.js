const { buildDocumentProfile } = require("./documentProfile");

const REQUEST_STOP_WORDS = new Set([
  "agent",
  "analyse",
  "analyze",
  "anomalies",
  "anomaly",
  "auto",
  "bar",
  "breakdown",
  "builder",
  "category",
  "chart",
  "charts",
  "compare",
  "comparison",
  "create",
  "data",
  "doc",
  "docx",
  "document",
  "donut",
  "focus",
  "generate",
  "graph",
  "image",
  "insight",
  "insights",
  "item",
  "items",
  "key",
  "line",
  "monthly",
  "one",
  "output",
  "outlier",
  "outliers",
  "pdf",
  "performing",
  "please",
  "png",
  "report",
  "request",
  "regional",
  "rita",
  "single",
  "statistics",
  "summary",
  "table",
  "top",
  "trend",
  "trends",
  "type",
  "with",
]);

const DOMAIN_GROUPS = [
  {
    name: "sales",
    terms: [
      "sales",
      "revenue",
      "profit",
      "income",
      "customer",
      "customers",
      "order",
      "orders",
      "transaction",
      "transactions",
      "restaurant",
      "restaurants",
      "store",
      "stores",
      "menu",
    ],
  },
  {
    name: "parliament",
    terms: [
      "parliament",
      "parliamentary",
      "seat",
      "seats",
      "constituency",
      "constituencies",
      "party",
      "parties",
      "election",
      "elections",
      "mp",
      "senator",
      "dewan",
      "vote",
      "votes",
    ],
  },
  {
    name: "finance",
    terms: [
      "budget",
      "cost",
      "costs",
      "expense",
      "expenses",
      "spend",
      "spending",
      "allocation",
      "allocations",
      "price",
      "prices",
    ],
  },
  {
    name: "operations",
    terms: [
      "employee",
      "employees",
      "staff",
      "workforce",
      "location",
      "locations",
      "branch",
      "branches",
      "region",
      "regions",
      "state",
      "states",
    ],
  },
];

function compactText(value = "") {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function requestTerms(prompt = "") {
  return [
    ...new Set(
      compactText(prompt)
        .split(/\s+/)
        .map((term) => term.trim())
        .filter((term) => term.length >= 3 && !REQUEST_STOP_WORDS.has(term))
    ),
  ];
}

function promptHasUsableData(prompt = "") {
  const profile = buildDocumentProfile({
    filename: "user message",
    content: prompt,
  });
  const hasDelimitedData =
    String(prompt || "").includes(",") ||
    String(prompt || "").includes("|") ||
    /\n/.test(String(prompt || ""));

  return (
    profile.numericValueCount >= 3 ||
    (profile.numericValueCount >= 2 && hasDelimitedData)
  );
}

function combinedDocumentText(documents = []) {
  return documents
    .map((doc) => `${doc.name || ""}\n${doc.content || ""}`)
    .join("\n")
    .toLowerCase();
}

function combinedProfile(documents = []) {
  return documents.reduce(
    (acc, doc) => {
      const profile =
        doc.profile ||
        buildDocumentProfile({
          filename: doc.name || "uploaded document",
          content: doc.content,
        });

      acc.numericValueCount += profile.numericValueCount || 0;
      acc.tableLikeLineCount += profile.tableLikeLineCount || 0;
      acc.dateLikeCount += profile.dateLikeCount || 0;
      acc.hasReadyDocument = acc.hasReadyDocument || profile.status === "ready";
      acc.hasHighReadiness =
        acc.hasHighReadiness ||
        ["high", "medium"].includes(profile.chartReadiness);
      return acc;
    },
    {
      numericValueCount: 0,
      tableLikeLineCount: 0,
      dateLikeCount: 0,
      hasReadyDocument: false,
      hasHighReadiness: false,
    }
  );
}

function domainMatch(prompt = "", documentText = "") {
  const promptText = compactText(prompt);
  const matchedDomains = DOMAIN_GROUPS.filter((group) =>
    group.terms.some((term) => promptText.includes(term))
  );

  if (matchedDomains.length === 0) return { required: false, matched: true };

  const matched = matchedDomains.some((group) =>
    group.terms.some((term) => documentText.includes(term))
  );
  return {
    required: true,
    matched,
    names: matchedDomains.map((group) => group.name),
  };
}

function directTermMatch(prompt = "", documentText = "") {
  const terms = requestTerms(prompt);
  if (terms.length === 0) return { required: false, matched: true, terms };

  const matchedTerms = terms.filter((term) => documentText.includes(term));
  return {
    required: terms.length > 0,
    matched: matchedTerms.length > 0,
    terms,
    matchedTerms,
  };
}

function isRitaDataAgent(ritaAgent = null) {
  return ["rita-report-agent", "rita-graph-agent"].includes(ritaAgent?.id);
}

function sourceLabel({ documents = [], requestedCount = 0, hasPromptData }) {
  if (documents.length > 0) {
    return requestedCount > 0 ? "uploaded file" : "workspace document";
  }
  if (hasPromptData) return "message data";
  return "none";
}

function namesList(documents = []) {
  return documents
    .map((doc) => doc.name || "uploaded document")
    .filter(Boolean)
    .slice(0, 3)
    .join(", ");
}

function statusMessage({ decision, documents, requestedCount, hasPromptData }) {
  const label = sourceLabel({ documents, requestedCount, hasPromptData });
  if (decision.blocked) return `Context check: ${decision.reason}`;
  if (label === "message data")
    return "Context check: RITA is using numeric data typed in this message.";
  if (documents.length > 0) {
    return `Context check: RITA is using ${label}(s): ${namesList(documents)}.`;
  }
  return "Context check: No uploaded or workspace data is being used for this request.";
}

function contextInstruction({
  decision,
  documents,
  requestedCount,
  hasPromptData,
}) {
  const label = sourceLabel({ documents, requestedCount, hasPromptData });
  return [
    "\n\n<rita_context_guard>",
    `status: ${decision.blocked ? "blocked" : "ready"}`,
    `source: ${label}`,
    documents.length > 0 ? `files: ${namesList(documents)}` : null,
    `reason: ${decision.reason}`,
    decision.blocked
      ? "instruction: Do not call chart or report tools. Tell the user the data does not match or cannot support the request."
      : "instruction: Use the listed context source as the evidence for this report or graph.",
    "</rita_context_guard>",
  ]
    .filter(Boolean)
    .join("\n");
}

function evaluateRitaContext({
  prompt = "",
  documents = [],
  unavailable = [],
  requestedCount = 0,
  ritaAgent = null,
  strictDataMatching = true,
} = {}) {
  if (!isRitaDataAgent(ritaAgent)) {
    return {
      applies: false,
      blocked: false,
      contextInstruction: "",
      statusMessage: null,
      blockMessage: null,
    };
  }

  const readableDocuments = documents.filter((doc) => doc?.content);
  const hasPromptData = promptHasUsableData(prompt);
  const profile = combinedProfile(readableDocuments);
  const docText = combinedDocumentText(readableDocuments);
  const domain = domainMatch(prompt, docText);
  const direct = directTermMatch(prompt, docText);
  const hasChartData =
    hasPromptData ||
    profile.hasHighReadiness ||
    profile.tableLikeLineCount >= 2 ||
    profile.numericValueCount >= 5;

  const decision = {
    blocked: false,
    reason: "Data context is ready.",
  };

  if (requestedCount > 0 && readableDocuments.length === 0) {
    decision.blocked = true;
    decision.reason = `RITA received uploaded file reference(s), but could not read usable extracted content for: ${unavailable.join(", ") || "uploaded file"}.`;
  } else if (readableDocuments.length === 0 && !hasPromptData) {
    decision.blocked = true;
    decision.reason =
      "No usable uploaded, workspace, or typed numeric data was found for this request.";
  } else if (!hasChartData) {
    decision.blocked = true;
    decision.reason =
      "The available data does not contain enough numeric or table-like values for chart/report generation.";
  } else if (
    readableDocuments.length > 0 &&
    domain.required &&
    !domain.matched
  ) {
    decision.blocked = true;
    decision.reason = `The available data does not appear to match the requested ${domain.names.join("/")} analysis.`;
  } else if (
    readableDocuments.length > 0 &&
    !domain.required &&
    direct.required &&
    !direct.matched
  ) {
    decision.blocked = true;
    decision.reason =
      "The available data does not appear to contain the requested topic or keywords.";
  }

  if (!strictDataMatching && decision.blocked) {
    decision.blocked = false;
    decision.reason = `${decision.reason} Strict matching is off, so RITA will continue and state assumptions.`;
  }

  const blockMessage = decision.blocked
    ? `I'm sorry, but the available data does not match or support your request. ${decision.reason} Please upload a clearer CSV, Excel, PDF, or Word file that contains the matching figures, categories, or dates, then try again.`
    : null;

  return {
    applies: true,
    blocked: decision.blocked,
    reason: decision.reason,
    statusMessage: statusMessage({
      decision,
      documents: readableDocuments,
      requestedCount,
      hasPromptData,
    }),
    contextInstruction: contextInstruction({
      decision,
      documents: readableDocuments,
      requestedCount,
      hasPromptData,
    }),
    blockMessage,
  };
}

module.exports = {
  evaluateRitaContext,
  promptHasUsableData,
  requestTerms,
};
