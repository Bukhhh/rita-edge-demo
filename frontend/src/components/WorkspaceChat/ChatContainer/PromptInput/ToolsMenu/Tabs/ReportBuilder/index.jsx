import { useCallback, useMemo, useState } from "react";
import {
  ChartBar,
  ChartLine,
  ChartPie,
  FilePdf,
  SquaresFour,
  Table,
  TrendUp,
} from "@phosphor-icons/react";
import useToolsMenuItems from "../../useToolsMenuItems";

const INTENTS = [
  "sales trend",
  "top performing items",
  "regional breakdown",
  "category comparison",
  "monthly summary",
  "anomalies or outliers",
];

const CHARTS = [
  {
    label: "Line chart",
    description: "Trends over time",
    value: "a line chart showing trends over time",
    icon: ChartLine,
  },
  {
    label: "Bar chart",
    description: "Compare categories",
    value: "a bar chart comparing values across categories",
    icon: ChartBar,
  },
  {
    label: "Pie / donut",
    description: "Parts of a whole",
    value: "a pie or donut chart showing proportion of the whole",
    icon: ChartPie,
  },
  {
    label: "Summary table",
    description: "Key numbers",
    value: "a table with key summary statistics",
    icon: Table,
  },
  {
    label: "Heatmap",
    description: "Intensity grid",
    value: "a heatmap showing intensity across two dimensions",
    icon: SquaresFour,
  },
  {
    label: "Scatter plot",
    description: "Relationships",
    value: "a scatter plot to reveal relationships between variables",
    icon: TrendUp,
  },
];

export default function ReportBuilderTab({
  sendCommand,
  setShowing,
  promptRef,
  highlightedIndex = -1,
  registerItemCount,
}) {
  const [intents, setIntents] = useState(() => new Set(["sales trend"]));
  const [charts, setCharts] = useState(
    () => new Set(["a line chart showing trends over time"])
  );
  const [extra, setExtra] = useState("");

  const prompt = useMemo(
    () => buildReportPrompt({ intents, charts, extra }),
    [intents, charts, extra]
  );

  const items = useMemo(
    () => [{ label: "Use PDF report request", prompt }],
    [prompt]
  );

  const insertPrompt = useCallback(
    (text = prompt) => {
      setShowing(false);
      sendCommand({ text });
      promptRef?.current?.focus();
    },
    [prompt, promptRef, sendCommand, setShowing]
  );

  useToolsMenuItems({
    items,
    highlightedIndex,
    onSelect: (item) => insertPrompt(item.prompt),
    registerItemCount,
  });

  const toggleSetValue = (setter, value) => {
    setter((prev) => {
      const next = new Set(prev);
      if (next.has(value)) {
        if (next.size === 1) return next;
        next.delete(value);
      } else {
        next.add(value);
      }
      return next;
    });
  };

  return (
    <div className="flex flex-col gap-3">
      <SectionLabel>Report focus</SectionLabel>
      <div className="flex flex-wrap gap-1.5">
        {INTENTS.map((intent) => (
          <Chip
            key={intent}
            active={intents.has(intent)}
            onClick={() => toggleSetValue(setIntents, intent)}
          >
            {intent}
          </Chip>
        ))}
      </div>

      <SectionLabel>Chart types</SectionLabel>
      <div className="grid grid-cols-1 gap-1.5">
        {CHARTS.map((chart) => {
          const Icon = chart.icon;
          return (
            <button
              key={chart.value}
              type="button"
              onClick={() => toggleSetValue(setCharts, chart.value)}
              className={`w-full border text-left rounded-md px-2 py-1.5 flex items-center gap-2 transition-colors ${
                charts.has(chart.value)
                  ? "border-blue-400 bg-blue-500/10 light:bg-blue-50"
                  : "border-zinc-700 light:border-slate-300 hover:bg-zinc-700/50 light:hover:bg-slate-100"
              }`}
            >
              <span className="w-8 h-8 rounded bg-zinc-700 light:bg-slate-200 flex items-center justify-center shrink-0">
                <Icon
                  size={17}
                  className="text-white light:text-slate-700"
                  weight="bold"
                />
              </span>
              <span className="min-w-0">
                <span className="block text-xs font-medium text-white light:text-slate-900">
                  {chart.label}
                </span>
                <span className="block text-[10px] text-zinc-400 light:text-slate-500">
                  {chart.description}
                </span>
              </span>
            </button>
          );
        })}
      </div>

      <SectionLabel>Output format</SectionLabel>
      <div className="flex items-center gap-2 rounded-md border border-blue-400 bg-blue-500/10 light:bg-blue-50 px-2 py-2">
        <FilePdf size={18} className="text-blue-300 light:text-blue-700" />
        <span className="text-xs font-medium text-white light:text-slate-900">
          PDF report
        </span>
      </div>

      <SectionLabel>Extra instructions</SectionLabel>
      <input
        type="text"
        value={extra}
        onChange={(e) => setExtra(e.target.value)}
        placeholder="Use Bahasa Malaysia, highlight top 3 items..."
        className="w-full rounded-md border border-zinc-700 light:border-slate-300 bg-zinc-900 light:bg-white px-2 py-1.5 text-xs text-white light:text-slate-900 placeholder:text-zinc-500"
      />

      <div className="rounded-md bg-zinc-900 light:bg-slate-100 p-2 text-[10px] leading-relaxed text-zinc-300 light:text-slate-600 max-h-28 overflow-y-auto whitespace-pre-wrap">
        {prompt}
      </div>

      <button
        type="button"
        onClick={() => insertPrompt()}
        className="w-full rounded-md bg-white hover:bg-zinc-200 light:bg-slate-800 light:hover:bg-slate-700 text-zinc-900 light:text-white text-xs font-semibold px-3 py-2"
      >
        Use this PDF report request
      </button>
    </div>
  );
}

function buildReportPrompt({ intents, charts, extra }) {
  const focus = [...intents].join(", ");
  const selectedCharts = [...charts];
  const chartLines = selectedCharts.map((chart) => `- ${chart}`).join("\n");
  const instructions = extra.trim();

  return [
    "@agent You are a data analyst for RITA.",
    "Use the uploaded/attached document or workspace context to prepare a PDF report.",
    "",
    `Focus on: ${focus}.`,
    "",
    "Create these visuals or equivalent report sections:",
    chartLines,
    "",
    "Output format: create a clean PDF report using the create-chart-pdf-report tool.",
    "Use create-chart-pdf-report with structured chart specs: filename, title, summary, sections, charts, and recommendations.",
    "For each chart, provide title, type, labels, values, axis labels, and insight so the tool can generate and embed real chart images in the PDF.",
    "Do not use create-pdf-file for chart reports unless the chart PDF report tool is unavailable.",
    "If column names are unclear, make reasonable assumptions and state them at the top of the report.",
    instructions ? `Additional instructions: ${instructions}` : null,
  ]
    .filter(Boolean)
    .join("\n");
}

function SectionLabel({ children }) {
  return (
    <p className="text-[10px] uppercase tracking-wide font-semibold text-zinc-500 light:text-slate-500">
      {children}
    </p>
  );
}

function Chip({ active, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full px-2.5 py-1 border text-[11px] transition-colors ${
        active
          ? "border-blue-400 bg-blue-500/10 text-blue-100 light:bg-blue-50 light:text-blue-800"
          : "border-zinc-700 light:border-slate-300 text-zinc-300 light:text-slate-700 hover:bg-zinc-700/50 light:hover:bg-slate-100"
      }`}
    >
      {children}
    </button>
  );
}
