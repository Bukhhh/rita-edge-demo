import { useEffect, useMemo, useState } from "react";
import {
  buildRitaContextSources,
  getAvailableRitaContextSources,
  getRitaBuilderContextState,
} from "./ritaBuilderContext";

export default function RitaBuilderContextSelector({
  attachments = [],
  workspace = {},
  promptInput = "",
  selectedSourceKeys,
  onSelectedSourceKeysChange,
  compact = false,
}) {
  const availableSources = useMemo(
    () => getAvailableRitaContextSources(attachments, workspace),
    [attachments, workspace]
  );

  useEffect(() => {
    onSelectedSourceKeysChange((previousKeys) => {
      const nextKeys = new Set(previousKeys);
      let changed = false;

      for (const source of availableSources) {
        if (source.status !== "ready") continue;
        if (!nextKeys.has(source.key)) {
          nextKeys.add(source.key);
          changed = true;
        }
      }

      for (const key of [...nextKeys]) {
        if (!availableSources.some((source) => source.key === key)) {
          nextKeys.delete(key);
          changed = true;
        }
      }

      return changed ? nextKeys : previousKeys;
    });
  }, [availableSources, onSelectedSourceKeysChange]);

  const contextState = getRitaBuilderContextState({
    attachments,
    promptInput,
    workspace,
    selectedSourceKeys,
  });

  function toggleSource(key) {
    onSelectedSourceKeysChange((previousKeys) => {
      const nextKeys = new Set(previousKeys);
      if (nextKeys.has(key)) nextKeys.delete(key);
      else nextKeys.add(key);
      return nextKeys;
    });
  }

  if (availableSources.length === 0) {
    return <BuilderContextStatus state={contextState} compact={compact} />;
  }

  const showFullStatus = !compact || contextState.tone !== "ready";

  return (
    <div className="flex flex-col gap-1.5">
      <div className="rounded-md border border-zinc-700 light:border-slate-300 bg-zinc-800/60 light:bg-slate-100 px-2.5 py-2">
        <div className="flex items-center justify-between gap-2">
          <div className="text-[10px] uppercase tracking-wide font-semibold text-zinc-500 light:text-slate-500">
            Data sources
          </div>
          {compact && contextState.tone === "ready" && (
            <span className="text-[10px] text-green-300 light:text-green-700 truncate">
              {contextState.selectedSources.length} selected
            </span>
          )}
        </div>
        {!compact && (
          <p className="mt-1 text-[10px] leading-relaxed text-zinc-400 light:text-slate-600">
            Choose chat uploads and workspace files for this request.
          </p>
        )}
        <div
          className={`mt-1.5 flex flex-col gap-1 overflow-y-auto ${
            compact ? "max-h-24" : "max-h-28"
          }`}
        >
          {availableSources.map((source) => {
            const checked = selectedSourceKeys.has(source.key);
            const disabled = source.status === "working";
            return (
              <label
                key={source.key}
                className={`flex items-start gap-2 rounded-md border px-2 py-1 text-[10px] transition-colors ${
                  checked
                    ? "border-blue-400/50 bg-blue-500/10 light:bg-blue-50"
                    : "border-zinc-700 light:border-slate-300"
                } ${disabled ? "opacity-70" : "cursor-pointer"}`}
              >
                <input
                  type="checkbox"
                  className="mt-0.5"
                  checked={checked}
                  disabled={disabled}
                  onChange={() => toggleSource(source.key)}
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-white light:text-slate-900">
                    {source.label}
                  </span>
                  <span
                    className={`block text-[10px] ${
                      source.status === "failed"
                        ? "text-red-300 light:text-red-600"
                        : source.status === "working"
                          ? "text-amber-200 light:text-amber-700"
                          : "text-zinc-500 light:text-slate-500"
                    }`}
                  >
                    {source.statusLabel}
                  </span>
                </span>
              </label>
            );
          })}
        </div>
      </div>
      {showFullStatus && (
        <BuilderContextStatus state={contextState} compact={compact} />
      )}
    </div>
  );
}

export function useRitaBuilderContextSelection() {
  const [selectedSourceKeys, setSelectedSourceKeys] = useState(() => new Set());
  return { selectedSourceKeys, setSelectedSourceKeys };
}

export { buildRitaContextSources, getRitaBuilderContextState };

function BuilderContextStatus({ state, compact = false }) {
  const classes = {
    ready:
      "border-green-400/30 bg-green-500/10 text-green-200 light:text-green-700 light:bg-green-50 light:border-green-200",
    working:
      "border-amber-400/30 bg-amber-500/10 text-amber-100 light:text-amber-700 light:bg-amber-50 light:border-amber-200",
    blocked:
      "border-red-400/30 bg-red-500/10 text-red-200 light:text-red-700 light:bg-red-50 light:border-red-200",
    neutral:
      "border-zinc-700 bg-zinc-800/60 text-zinc-300 light:border-slate-300 light:bg-slate-100 light:text-slate-700",
  };

  return (
    <div
      className={`rounded-md border leading-relaxed ${compact ? "px-2 py-1.5 text-[10px]" : "px-3 py-2 text-[11px]"} ${classes[state.tone] || classes.neutral}`}
    >
      <div className="font-semibold">{state.title}</div>
      <div className={compact ? "line-clamp-2" : ""}>{state.message}</div>
    </div>
  );
}
