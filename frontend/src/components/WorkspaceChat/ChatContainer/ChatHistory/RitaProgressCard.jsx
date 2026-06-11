import { useEffect, useMemo, useState } from "react";
import AgentAnimation from "@/media/animations/agent-animation.webm";

const CHAT_STEPS = [
  "Analysing your request...",
  "Checking the workspace context...",
  "Preparing a helpful response...",
];

const FILE_STEPS = [
  "Reading uploaded files...",
  "Checking the relevant data...",
  "Preparing the answer from your documents...",
];

const REPORT_STEPS = [
  "Reading the uploaded data...",
  "Planning the report sections...",
  "Preparing charts and PDF output...",
];

const GRAPH_STEPS = [
  "Reading the data source...",
  "Choosing the graph structure...",
  "Building the chart output...",
];

export default function RitaProgressCard({
  agentId = null,
  hasAttachments = false,
  statusText = "",
}) {
  const steps = useMemo(
    () => progressStepsFor({ agentId, hasAttachments }),
    [agentId, hasAttachments]
  );
  const [stepIndex, setStepIndex] = useState(0);
  const friendlyStatus = friendlyStatusFrom(statusText);

  useEffect(() => {
    setStepIndex(0);
    const interval = setInterval(() => {
      setStepIndex((current) => (current + 1) % steps.length);
    }, 2600);

    return () => clearInterval(interval);
  }, [steps]);

  return (
    <div
      className="flex items-center gap-3 rounded-2xl bg-zinc-800 light:bg-slate-100 px-4 py-3 text-zinc-200 light:text-slate-700 shadow-sm"
      aria-live="polite"
    >
      <video
        autoPlay
        loop
        muted
        playsInline
        className="h-6 w-6 shrink-0 scale-[135%] light:invert light:opacity-60"
      >
        <source src={AgentAnimation} type="video/webm" />
      </video>
      <div className="flex min-w-0 flex-col">
        <span className="text-sm font-medium">{progressTitleFor(agentId)}</span>
        <span className="text-xs text-zinc-400 light:text-slate-500">
          {friendlyStatus || steps[stepIndex]}
        </span>
      </div>
      <div className="ml-1 flex items-center gap-1" aria-hidden="true">
        <span className="h-1.5 w-1.5 rounded-full bg-sky-400 animate-pulse" />
        <span className="h-1.5 w-1.5 rounded-full bg-sky-400 animate-pulse delay-150" />
        <span className="h-1.5 w-1.5 rounded-full bg-sky-400 animate-pulse delay-300" />
      </div>
    </div>
  );
}

function progressTitleFor(agentId) {
  if (agentId === "rita-report-agent") return "RITA Report Agent is working";
  if (agentId === "rita-graph-agent") return "RITA Graph Agent is working";
  return "RITA is working on it";
}

function progressStepsFor({ agentId, hasAttachments }) {
  if (agentId === "rita-report-agent") return REPORT_STEPS;
  if (agentId === "rita-graph-agent") return GRAPH_STEPS;
  if (hasAttachments) return FILE_STEPS;
  return CHAT_STEPS;
}

function friendlyStatusFrom(statusText = "") {
  const text = String(statusText || "").toLowerCase();
  if (!text) return null;

  if (
    text.includes("approval") ||
    text.includes("model wants to call") ||
    text.includes("toolapproval")
  ) {
    return "Waiting for approval to run the selected tool...";
  }

  if (
    text.includes("create-chart-pdf-report") ||
    text.includes("pdf") ||
    text.includes("report")
  ) {
    return "Generating the PDF report...";
  }

  if (
    text.includes("create-chart-image") ||
    text.includes("create-matplotlib-chart") ||
    text.includes("chart") ||
    text.includes("graph")
  ) {
    return "Building the chart output...";
  }

  if (
    text.includes("attached") ||
    text.includes("document") ||
    text.includes("context") ||
    text.includes("workspace") ||
    text.includes("rag")
  ) {
    return "Reading uploaded files and workspace context...";
  }

  if (text.includes("tool")) return "Running the selected RITA skill...";
  if (text.includes("successfully created")) return "Finishing the result...";
  if (text.includes("thinking")) return "Analysing your request...";
  return null;
}
