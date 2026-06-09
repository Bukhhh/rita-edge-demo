import { v4 } from "uuid";
import * as echarts from "echarts";
import { safeJsonParse } from "@/utils/request.js";
import renderMarkdown from "@/utils/chat/markdown.js";
import DOMPurify from "dompurify";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { saveAs } from "file-saver";
import { CircleNotch, DownloadSimple } from "@phosphor-icons/react";

const chartPalette = [
  "#3b82f6",
  "#14b8a6",
  "#f59e0b",
  "#f43f5e",
  "#8b5cf6",
  "#06b6d4",
  "#22c55e",
  "#ef4444",
  "#6366f1",
  "#d946ef",
];

function formatNumber(value) {
  if (typeof value !== "number") return value;
  return Intl.NumberFormat("en", {
    maximumFractionDigits: value % 1 === 0 ? 0 : 2,
  }).format(value);
}

function parseContent(content) {
  if (typeof content === "string") return safeJsonParse(content, null);
  return content ?? null;
}

function parseOption(content) {
  const option =
    content?.option ?? content?.echartsOption ?? content?.chartSpec;
  if (!option) return null;
  if (typeof option === "string") return safeJsonParse(option, null);
  if (typeof option === "object") return option;
  return null;
}

function parseDataset(content) {
  const dataset = content?.dataset ?? content?.data ?? [];
  if (typeof dataset === "string") return safeJsonParse(dataset, []);
  return Array.isArray(dataset) ? dataset : [];
}

function pickMetricKeys(data) {
  if (!data.length) return [];
  return Object.keys(data[0]).filter((key) => key !== "name");
}

function chartThemeColors() {
  const isLight =
    typeof document !== "undefined" &&
    document.documentElement.getAttribute("data-theme") === "light";
  return isLight
    ? {
        heading: "#111827",
        text: "#374151",
        muted: "#6b7280",
        axis: "#d1d5db",
        split: "#e5e7eb",
        tooltipBg: "#ffffff",
        tooltipBorder: "#d1d5db",
      }
    : {
        heading: "#f8fafc",
        text: "#e5e7eb",
        muted: "#cbd5e1",
        axis: "#64748b",
        split: "#334155",
        tooltipBg: "#111827",
        tooltipBorder: "#475569",
      };
}

function normalizeAxis(axis, theme) {
  if (!axis) return axis;
  const axes = Array.isArray(axis) ? axis : [axis];
  const normalized = axes.map((axisConfig) => ({
    ...axisConfig,
    axisLabel: {
      color: theme.muted,
      ...(axisConfig.axisLabel || {}),
    },
    axisLine: {
      lineStyle: { color: theme.axis },
      ...(axisConfig.axisLine || {}),
    },
    splitLine: {
      lineStyle: { color: theme.split, type: "dashed" },
      ...(axisConfig.splitLine || {}),
    },
  }));
  return Array.isArray(axis) ? normalized : normalized[0];
}

function legacyContentToOption(content) {
  const chartType = content?.type?.toLowerCase();
  const title = content?.title || "Generated chart";
  const data = parseDataset(content);
  const metricKeys = pickMetricKeys(data);
  const primaryMetric = metricKeys[0] || "value";
  const hasManyRows = data.length > 18;
  const categoryLabels = data.map(
    (row, index) => row.name ?? `Item ${index + 1}`
  );

  const baseCartesian = {
    title: { text: title },
    tooltip: {
      trigger: "axis",
      axisPointer: { type: chartType === "bar" ? "shadow" : "line" },
    },
    legend: { top: 34, type: "scroll" },
    grid: { top: 86, right: 36, bottom: hasManyRows ? 88 : 56, left: 64 },
    xAxis: {
      type: "category",
      data: categoryLabels,
      axisLabel: {
        interval: 0,
        rotate: hasManyRows ? 35 : 0,
        overflow: "truncate",
        width: 96,
      },
    },
    yAxis: {
      type: "value",
      axisLabel: { formatter: formatNumber },
      splitLine: { lineStyle: { type: "dashed" } },
    },
    dataZoom: hasManyRows
      ? [{ type: "slider", height: 24, bottom: 24 }, { type: "inside" }]
      : [],
  };

  if (chartType === "pie") {
    return {
      title: { text: title },
      tooltip: { trigger: "item" },
      legend: { top: 34, type: "scroll" },
      series: [
        {
          name: primaryMetric,
          type: "pie",
          radius: ["42%", "70%"],
          center: ["50%", "58%"],
          avoidLabelOverlap: true,
          data: data.map((row) => ({
            name: row.name,
            value: Number(row[primaryMetric]) || 0,
          })),
          label: { formatter: "{b}: {d}%" },
        },
      ],
    };
  }

  if (chartType === "radar") {
    const max = Math.max(
      ...data.map((row) => Number(row[primaryMetric]) || 0),
      1
    );
    return {
      title: { text: title },
      tooltip: { trigger: "item" },
      radar: {
        radius: "62%",
        indicator: data.map((row) => ({
          name: row.name,
          max: Math.ceil(max * 1.2),
        })),
      },
      series: [
        {
          name: primaryMetric,
          type: "radar",
          areaStyle: { opacity: 0.18 },
          data: [
            {
              value: data.map((row) => Number(row[primaryMetric]) || 0),
              name: primaryMetric,
            },
          ],
        },
      ],
    };
  }

  if (chartType === "treemap") {
    return {
      title: { text: title },
      tooltip: { trigger: "item" },
      series: [
        {
          type: "treemap",
          roam: true,
          breadcrumb: { show: false },
          data: data.map((row) => ({
            name: row.name,
            value: Number(row[primaryMetric]) || 0,
          })),
        },
      ],
    };
  }

  if (chartType === "funnel") {
    return {
      title: { text: title },
      tooltip: { trigger: "item" },
      legend: { top: 34, type: "scroll" },
      series: [
        {
          name: primaryMetric,
          type: "funnel",
          top: 82,
          bottom: 20,
          width: "72%",
          left: "14%",
          data: data.map((row) => ({
            name: row.name,
            value: Number(row[primaryMetric]) || 0,
          })),
        },
      ],
    };
  }

  if (chartType === "scatter") {
    const xKey = metricKeys[0];
    const yKey = metricKeys[1] || metricKeys[0];
    return {
      title: { text: title },
      tooltip: {
        trigger: "item",
        formatter: ({ data: point }) =>
          `${point?.[2] ?? "Point"}<br/>${xKey}: ${formatNumber(point?.[0])}<br/>${yKey}: ${formatNumber(point?.[1])}`,
      },
      grid: { top: 72, right: 36, bottom: 54, left: 64 },
      xAxis: { type: "value", name: xKey },
      yAxis: { type: "value", name: yKey },
      series: [
        {
          name: `${xKey} vs ${yKey}`,
          type: "scatter",
          symbolSize: 12,
          data: data.map((row, index) => [
            Number(row[xKey]) || index + 1,
            Number(row[yKey]) || 0,
            row.name,
          ]),
        },
      ],
    };
  }

  const seriesType =
    chartType === "area" ? "line" : chartType === "bar" ? "bar" : "line";
  return {
    ...baseCartesian,
    series: metricKeys.map((key) => ({
      name: key,
      type: seriesType,
      smooth: seriesType === "line",
      areaStyle: chartType === "area" ? { opacity: 0.16 } : undefined,
      emphasis: { focus: "series" },
      data: data.map((row) => Number(row[key]) || 0),
    })),
  };
}

function normalizeOption(rawOption, content) {
  const option = rawOption ?? legacyContentToOption(content);
  const theme = chartThemeColors();
  return {
    ...option,
    color: chartPalette,
    backgroundColor: "transparent",
    animationDuration: 550,
    textStyle: {
      color: theme.text,
      fontFamily: "Inter, Helvetica, Arial, sans-serif",
      ...(option.textStyle || {}),
    },
    title: {
      left: 0,
      top: 0,
      text: content?.title || "Generated chart",
      textStyle: { color: theme.heading, fontSize: 16, fontWeight: 700 },
      ...(option.title || {}),
    },
    tooltip: {
      confine: true,
      renderMode: "richText",
      backgroundColor: theme.tooltipBg,
      borderColor: theme.tooltipBorder,
      textStyle: { color: theme.text },
      valueFormatter: formatNumber,
      ...(option.tooltip || {}),
    },
    legend: {
      type: "scroll",
      top: 34,
      right: 0,
      textStyle: { color: theme.muted },
      ...(option.legend || {}),
    },
    xAxis: normalizeAxis(option.xAxis, theme),
    yAxis: normalizeAxis(option.yAxis, theme),
  };
}

export function Chartable({ props }) {
  const containerRef = useRef(null);
  const chartRef = useRef(null);
  const [loading, setLoading] = useState(false);
  const content = useMemo(() => parseContent(props.content), [props.content]);
  const option = useMemo(() => {
    if (!content) return null;
    return normalizeOption(parseOption(content), content);
  }, [content]);

  useEffect(() => {
    if (!containerRef.current || !option) return;

    const chart = echarts.init(containerRef.current, null, {
      renderer: "canvas",
      useDirtyRect: true,
    });
    chartRef.current = chart;
    chart.setOption(option, true);

    const resizeObserver = new ResizeObserver(() => chart.resize());
    resizeObserver.observe(containerRef.current);

    return () => {
      resizeObserver.disconnect();
      chart.dispose();
      chartRef.current = null;
    };
  }, [option]);

  const handleDownload = useCallback(async () => {
    if (!chartRef.current) return;
    setLoading(true);
    try {
      const jpeg = chartRef.current.getDataURL({
        type: "jpeg",
        pixelRatio: 2,
        backgroundColor: "#393d43",
      });
      saveAs(jpeg, `chart-${v4().split("-")[0]}.jpg`);
    } finally {
      setLoading(false);
    }
  }, []);

  if (!content || !option) return null;

  return (
    <div className="flex justify-start w-full">
      <div className="py-2 px-4 w-full flex flex-col md:max-w-[88%]">
        <div className="relative w-full">
          <DownloadGraph loading={loading} onClick={handleDownload} />
          <div className="bg-theme-bg-primary rounded-xl light:border light:border-theme-border-primary p-5">
            <div ref={containerRef} className="w-full h-[430px]" />
          </div>
          {!!content.caption && (
            <span
              className="flex flex-col gap-y-1 mt-2"
              dangerouslySetInnerHTML={{
                __html: DOMPurify.sanitize(renderMarkdown(content.caption)),
              }}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function DownloadGraph({ loading, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={loading}
      className="absolute top-5 right-5 z-50 p-1 rounded-full border-none disabled:opacity-60"
      aria-label={loading ? "Downloading image..." : "Download graph image"}
    >
      {loading ? (
        <CircleNotch className="text-theme-text-primary w-5 h-5 animate-spin" />
      ) : (
        <DownloadSimple
          weight="bold"
          className="text-theme-text-primary w-5 h-5 hover:text-theme-text-primary"
        />
      )}
    </button>
  );
}

export default memo(Chartable);
