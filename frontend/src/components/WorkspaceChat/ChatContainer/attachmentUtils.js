function safeDocument(document = null) {
  if (!document) return null;
  return {
    id: document.id,
    filename: document.filename,
    name: document.name,
    title: document.title,
    location: document.location,
    docpath: document.docpath,
    metadata: document.metadata,
    tokenCountEstimate: document.tokenCountEstimate,
  };
}

export function serializableFileAttachments(files = []) {
  return files.map((item) => ({
    uid: item.uid,
    name: item.file?.name,
    mime: item.file?.type,
    contentString: item.contentString,
    status: item.status,
    error: item.error,
    type: item.type,
    document: safeDocument(item.document),
  }));
}

export function requestAttachmentsFromFiles(
  files = [],
  fallbackAttachments = () => []
) {
  const directAttachments =
    typeof fallbackAttachments === "function"
      ? fallbackAttachments()
      : fallbackAttachments || [];
  const uploadedFiles = serializableFileAttachments(files).filter(
    (item) => item.type === "upload"
  );

  return [...directAttachments, ...uploadedFiles];
}

export function visibleAttachmentsFromFiles(
  files = [],
  fallbackAttachments = () => []
) {
  const visibleFiles = serializableFileAttachments(files);
  if (visibleFiles.length > 0) return visibleFiles;
  return typeof fallbackAttachments === "function"
    ? fallbackAttachments()
    : fallbackAttachments || [];
}
