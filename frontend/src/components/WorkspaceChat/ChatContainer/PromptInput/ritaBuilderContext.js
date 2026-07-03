const READY_ATTACHMENT_STATUSES = new Set([
  "added_context",
  "embedded",
  "success",
]);

export function attachmentSourceKey(uid) {
  return `attachment:${uid}`;
}

export function workspaceSourceKey(docpath) {
  return `workspace:${docpath}`;
}

export function displayFilename(docpath = "", filename = "") {
  if (filename) return filename;
  const parts = String(docpath).split("/");
  return parts[parts.length - 1] || docpath || "Document";
}

export function getAvailableRitaContextSources(attachments = [], workspace = {}) {
  const sources = [];

  for (const attachment of attachments) {
    if (attachment?.type !== "upload") continue;

    const key = attachmentSourceKey(attachment.uid);
    const label =
      attachment.file?.name || attachment.name || "Chat attachment";

    if (attachment.status === "in_progress") {
      sources.push({
        key,
        label,
        kind: "chat",
        status: "working",
        statusLabel: "Reading...",
      });
      continue;
    }

    if (attachment.status === "failed") {
      sources.push({
        key,
        label,
        kind: "chat",
        status: "failed",
        statusLabel: "Unreadable",
      });
      continue;
    }

    if (!READY_ATTACHMENT_STATUSES.has(attachment.status)) continue;

    sources.push({
      key,
      label,
      kind: "chat",
      status: "ready",
      statusLabel: "Chat upload",
    });
  }

  for (const document of workspace?.documents || []) {
    if (!document?.docpath) continue;
    sources.push({
      key: workspaceSourceKey(document.docpath),
      label: displayFilename(document.docpath, document.filename),
      kind: "workspace",
      status: "ready",
      statusLabel: document.pinned ? "Workspace · pinned" : "Workspace",
      docpath: document.docpath,
    });
  }

  return sources;
}

export function buildRitaContextSources(selectedKeys = new Set()) {
  return [...selectedKeys]
    .map((key) => {
      if (key.startsWith("attachment:")) {
        return { source: "attachment", uid: key.slice("attachment:".length) };
      }
      if (key.startsWith("workspace:")) {
        return {
          source: "workspace",
          docpath: key.slice("workspace:".length),
        };
      }
      return null;
    })
    .filter(Boolean);
}

export function getRitaBuilderContextState({
  attachments = [],
  promptInput = "",
  workspace = {},
  selectedSourceKeys = new Set(),
}) {
  const availableSources = getAvailableRitaContextSources(attachments, workspace);
  const selectedSources = availableSources.filter((source) =>
    selectedSourceKeys.has(source.key)
  );
  const typedContext = promptInput.trim().length > 0;

  const workingSource = selectedSources.find(
    (source) => source.status === "working"
  );
  if (workingSource) {
    return {
      tone: "working",
      title: "Preparing file context",
      message: `RITA is still reading "${workingSource.label}". Generate will unlock when the file is ready.`,
      blocker: `RITA is still preparing "${workingSource.label}". Please wait a moment before generating.`,
      availableSources,
      selectedSources,
    };
  }

  const failedSource = selectedSources.find(
    (source) => source.status === "failed"
  );
  if (failedSource) {
    return {
      tone: "blocked",
      title: "File cannot be used",
      message: `RITA could not read "${failedSource.label}" properly. Uncheck it or upload a clearer file.`,
      blocker: `RITA could not read "${failedSource.label}" properly.`,
      availableSources,
      selectedSources,
    };
  }

  const readySelected = selectedSources.filter(
    (source) => source.status === "ready"
  );

  if (readySelected.length > 0) {
    const names = readySelected.map((source) => source.label).slice(0, 3);
    const workspaceCount = readySelected.filter(
      (source) => source.kind === "workspace"
    ).length;
    const chatCount = readySelected.length - workspaceCount;
    const parts = [];
    if (chatCount > 0) {
      parts.push(`${chatCount} chat file${chatCount === 1 ? "" : "s"}`);
    }
    if (workspaceCount > 0) {
      parts.push(
        `${workspaceCount} workspace file${workspaceCount === 1 ? "" : "s"}`
      );
    }

    return {
      tone: "ready",
      title: "Context ready",
      message: `RITA will use ${parts.join(" and ")}: ${names.join(", ")}${readySelected.length > 3 ? ", ..." : ""}.`,
      blocker: null,
      availableSources,
      selectedSources,
    };
  }

  if (typedContext) {
    return {
      tone: "ready",
      title: "Context ready",
      message:
        "RITA will use your typed instructions as the source context for this request.",
      blocker: null,
      availableSources,
      selectedSources,
    };
  }

  if (availableSources.length > 0) {
    return {
      tone: "neutral",
      title: "Choose data sources",
      message:
        "Select the chat uploads and workspace files RITA should use for this report.",
      blocker: "Select at least one data source or type data in chat.",
      availableSources,
      selectedSources,
    };
  }

  return {
    tone: "neutral",
    title: "No data available",
    message:
      "Add workspace documents from the Documents panel, attach a file in chat, or type numeric data in chat.",
    blocker:
      "Add workspace documents, attach a chat file, or type data in chat.",
    availableSources,
    selectedSources,
  };
}
