import { memo, useEffect, useState } from "react";
import { DownloadSimple, CircleNotch } from "@phosphor-icons/react";
import { humanFileSize } from "@/utils/numbers";
import StorageFiles from "@/models/files";
import showToast from "@/utils/toast";

/**
 * @param {{content: {filename: string, storageFilename?: string, fileSize?: number}}} props
 */
function FileDownloadCard({ props }) {
  const { filename, storageFilename, fileSize } = props.content || {};
  const { badge, badgeBg, badgeText, fileType } = getFileDisplayInfo(filename);
  const [downloading, setDownloading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState(null);
  const canPreview = isPreviewableImage(filename) || isPreviewablePdf(filename);

  useEffect(() => {
    if (!canPreview || !storageFilename) return;
    let objectUrl;
    let cancelled = false;

    async function loadPreview() {
      const blob = await StorageFiles.download(storageFilename);
      if (!blob || cancelled) return;
      objectUrl = URL.createObjectURL(blob);
      setPreviewUrl(objectUrl);
    }

    loadPreview().catch(() => {});
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [canPreview, storageFilename]);

  const handleDownload = async () => {
    if (downloading) return;
    if (!storageFilename) return;

    setDownloading(true);
    try {
      const blob = await StorageFiles.download(storageFilename);
      if (!blob) throw new Error("Failed to download file");
      downloadBlob(blob, filename || storageFilename);
    } catch (error) {
      console.error("Failed to download file", error);
      showToast("Failed to download generated file.", "error");
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="flex justify-center w-full my-2">
      <div className="w-full max-w-[750px] mr-4">
        {previewUrl && isPreviewableImage(filename) && (
          <img
            src={previewUrl}
            alt={filename || "Generated image"}
            className="mb-2 w-full max-h-[520px] object-contain rounded-xl bg-zinc-800 light:bg-slate-100 light:border light:border-slate-200/50"
          />
        )}
        {previewUrl && isPreviewablePdf(filename) && (
          <iframe
            src={previewUrl}
            title={filename || "Generated PDF preview"}
            className="mb-2 h-[520px] w-full rounded-xl bg-white light:border light:border-slate-200/50"
          />
        )}
        <div className="flex items-center justify-between bg-zinc-800 light:bg-slate-100 light:border light:border-slate-200/50 rounded-xl px-2 py-1">
          <div className="flex items-center gap-x-3 min-w-0">
            <div
              className={`${badgeBg} ${badgeText} rounded-lg flex items-center justify-center flex-shrink-0 h-[48px] w-[48px] text-xs font-bold`}
            >
              {badge}
            </div>
            <div className="flex flex-col min-w-0">
              <p className="text-white light:text-slate-900 text-sm font-medium truncate leading-snug">
                {filename || "Unknown file"}
              </p>
              <p className="text-zinc-400 light:text-slate-500 text-xs leading-snug">
                {humanFileSize(fileSize, true, 1)}
                {fileSize && fileType ? " · " : ""}
                {fileType}
              </p>
            </div>
          </div>
          <button
            onClick={handleDownload}
            disabled={downloading}
            className="flex items-center gap-x-2 px-4 py-2 rounded-lg border border-zinc-600 light:border-theme-sidebar-border hover:bg-zinc-700 light:hover:bg-theme-bg-secondary transition-colors text-white light:text-theme-text-primary text-sm font-medium flex-shrink-0 ml-4 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {downloading ? (
              <CircleNotch size={16} weight="bold" className="animate-spin" />
            ) : (
              <DownloadSimple size={16} weight="bold" />
            )}
            <span>{downloading ? "Downloading..." : "Download"}</span>
          </button>
        </div>
      </div>
    </div>
  );
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename || "download";
  link.rel = "noopener";
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

function isPreviewableImage(filename) {
  const extension = filename?.split(".")?.pop()?.toLowerCase();
  return ["png", "jpg", "jpeg", "svg", "gif", "webp"].includes(extension);
}

function isPreviewablePdf(filename) {
  return filename?.split(".")?.pop()?.toLowerCase() === "pdf";
}

/**
 * Get display info for a file based on its extension
 * @param {string} filename
 * @returns {{badge: string, badgeBg: string, badgeText: string, fileType: string}}
 */
function getFileDisplayInfo(filename) {
  const extension = filename?.split(".")?.pop()?.toLowerCase() ?? "txt";
  switch (extension) {
    case "pptx":
    case "ppt":
      return {
        badge: "PPT",
        badgeBg: "bg-orange-100",
        badgeText: "text-orange-700",
        fileType: "PowerPoint",
      };
    case "pdf":
      return {
        badge: "PDF",
        badgeBg: "bg-red-100",
        badgeText: "text-red-700",
        fileType: "PDF Document",
      };
    case "doc":
    case "docx":
      return {
        badge: "DOC",
        badgeBg: "bg-blue-100",
        badgeText: "text-blue-700",
        fileType: "Word Document",
      };
    case "xls":
    case "xlsx":
      return {
        badge: "XLS",
        badgeBg: "bg-green-100",
        badgeText: "text-green-700",
        fileType: "Spreadsheet",
      };
    case "csv":
      return {
        badge: "CSV",
        badgeBg: "bg-green-100",
        badgeText: "text-green-700",
        fileType: "Spreadsheet",
      };
    case "png":
    case "jpg":
    case "jpeg":
    case "svg":
    case "gif":
    case "webp":
      return {
        badge: "IMG",
        badgeBg: "bg-cyan-100",
        badgeText: "text-cyan-700",
        fileType: "Image",
      };
    default:
      return {
        badge: extension.toUpperCase().slice(0, 4),
        badgeBg: "bg-slate-200",
        badgeText: "text-slate-700",
        fileType: "File",
      };
  }
}

export default memo(FileDownloadCard);
