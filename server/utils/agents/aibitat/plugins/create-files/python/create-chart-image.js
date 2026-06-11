const fs = require("fs/promises");
const path = require("path");
const os = require("os");
const { execFile } = require("child_process");
const createFilesLib = require("../lib.js");

const SUPPORTED_FORMATS = ["png", "jpg", "jpeg", "svg", "pdf"];
const SUPPORTED_CHART_TYPES = [
  "bar",
  "horizontal_bar",
  "stacked_bar",
  "line",
  "area",
  "pie",
  "donut",
  "histogram",
  "scatter",
];
const EXECUTION_TIMEOUT_MS = 45_000;
const MAX_STDIO_BYTES = 1024 * 1024;

module.exports.CreateChartImage = {
  name: "create-chart-image",
  plugin: function () {
    return {
      name: "create-chart-image",
      setup(aibitat) {
        aibitat.function({
          super: aibitat,
          name: this.name,
          description:
            "Create a chart image or one-page chart PDF from structured chart data. " +
            "Use this for RITA Graph Agent whenever the user asks for one graph/chart. " +
            "Provide labels and numeric values directly; do not write Python code.",
          examples: [
            {
              prompt: "Create one PNG bar chart for Jan 10, Feb 20, Mar 15",
              call: JSON.stringify({
                filename: "monthly-values.png",
                format: "png",
                title: "Monthly Values",
                type: "bar",
                labels: ["Jan", "Feb", "Mar"],
                values: [10, 20, 15],
                xLabel: "Month",
                yLabel: "Value",
                insight: "February has the highest value.",
              }),
            },
          ],
          parameters: {
            $schema: "http://json-schema.org/draft-07/schema#",
            type: "object",
            properties: {
              filename: {
                type: "string",
                description:
                  "Display filename for the generated chart. Use a matching extension like .png, .pdf, .svg, .jpg, or .jpeg.",
              },
              format: {
                type: "string",
                enum: SUPPORTED_FORMATS,
                description:
                  "The output format. PNG is recommended for chat display.",
                default: "png",
              },
              title: {
                type: "string",
                description: "Chart title.",
              },
              type: {
                type: "string",
                enum: SUPPORTED_CHART_TYPES,
                description:
                  "Chart type. Use bar or horizontal_bar for category comparisons, line/area for trends, pie/donut for share, scatter for relationships, histogram for distribution.",
                default: "bar",
              },
              labels: {
                type: "array",
                items: { type: "string" },
                description:
                  "Chart labels. Must match the number of numeric values.",
              },
              values: {
                type: "array",
                items: { type: "number" },
                description:
                  "Numeric values for the chart. Must match the labels length.",
              },
              series: {
                type: "array",
                description:
                  "Optional series for stacked_bar charts. Each series needs a name and numeric values matching labels length.",
                items: {
                  type: "object",
                  properties: {
                    name: { type: "string" },
                    values: {
                      type: "array",
                      items: { type: "number" },
                    },
                  },
                  required: ["name", "values"],
                  additionalProperties: false,
                },
                default: [],
              },
              xLabel: { type: "string" },
              yLabel: { type: "string" },
              insight: {
                type: "string",
                description:
                  "One or two sentence plain-language interpretation returned after the chart is created.",
              },
            },
            required: ["title", "type", "labels", "values"],
            additionalProperties: false,
          },
          handler: async function ({
            filename = "chart.png",
            format = "png",
            title = "Chart",
            type = "bar",
            labels = [],
            values = [],
            series = [],
            xLabel = "",
            yLabel = "",
            insight = "",
          }) {
            let runDirectory = null;
            try {
              this.super.handlerProps.log(`Using the create-chart-image tool.`);

              const extension = normalizeFormat(format, filename);
              const chart = normalizeChart({
                title,
                type,
                labels,
                values,
                series,
                xLabel,
                yLabel,
                insight,
              });
              if (!chart) {
                return "No valid chart data was provided. Provide matching labels and numeric values.";
              }

              const displayFilename = ensureExtension(
                filename.split("/").pop(),
                extension
              );

              if (this.super.requestToolApproval) {
                const approval = await this.super.requestToolApproval({
                  skillName: this.name,
                  payload: {
                    filename: displayFilename,
                    type: chart.type,
                    labels: chart.labels,
                  },
                  description: `Create chart "${displayFilename}"`,
                });
                if (!approval.approved) {
                  this.super.introspect(
                    `${this.caller}: User rejected the ${this.name} request.`
                  );
                  return approval.message;
                }
              }

              runDirectory = await fs.mkdtemp(
                path.join(os.tmpdir(), "rita-chart-image-")
              );
              const dataPath = path.join(runDirectory, "chart-data.json");
              const scriptPath = path.join(runDirectory, "chart.py");
              const outputPath = path.join(runDirectory, `chart.${extension}`);

              await fs.writeFile(dataPath, JSON.stringify(chart), "utf8");
              await fs.writeFile(
                scriptPath,
                chartScript(dataPath, outputPath),
                "utf8"
              );

              this.super.introspect(
                `${this.caller}: Generating chart "${displayFilename}"`
              );

              await runPythonScript(scriptPath, runDirectory);
              const buffer = await fs.readFile(outputPath);

              if (buffer.length === 0) {
                return "Python created an empty chart file. Please provide non-empty chart values.";
              }

              const savedFile = await createFilesLib.saveGeneratedFile({
                fileType: "chart",
                extension,
                buffer,
                displayFilename,
              });

              this.super.socket.send("fileDownloadCard", {
                filename: savedFile.displayFilename,
                storageFilename: savedFile.filename,
                fileSize: savedFile.fileSize,
              });

              createFilesLib.registerOutput(this.super, "ChartImage", {
                filename: savedFile.displayFilename,
                storageFilename: savedFile.filename,
                fileSize: savedFile.fileSize,
                insight: chart.insight,
              });

              const sizeKB = (savedFile.fileSize / 1024).toFixed(2);
              this.super.introspect(
                `${this.caller}: Successfully created chart "${displayFilename}"`
              );

              return [
                `Successfully created chart "${displayFilename}" (${sizeKB}KB).`,
                chart.insight ? `Insight: ${chart.insight}` : null,
              ]
                .filter(Boolean)
                .join("\n");
            } catch (e) {
              this.super.handlerProps.log(
                `create-chart-image error: ${e.message}`
              );
              this.super.introspect(`Error: ${e.message}`);
              return `Error creating chart image: ${e.message}`;
            } finally {
              if (runDirectory) {
                await fs.rm(runDirectory, { recursive: true, force: true });
              }
            }
          },
        });
      },
    };
  },
};

function chartScript(dataPath, outputPath) {
  return `
import json
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

with open(${JSON.stringify(dataPath)}, "r", encoding="utf-8") as f:
    chart = json.load(f)

labels = chart["labels"]
values = chart["values"]
chart_type = chart.get("type", "bar")
title = chart.get("title", "Chart")
x_label = chart.get("xLabel") or ""
y_label = chart.get("yLabel") or ""

plt.style.use("seaborn-v0_8-whitegrid")
fig, ax = plt.subplots(figsize=(8.5, 4.8), dpi=170)
colors = ["#2563eb", "#16a34a", "#f59e0b", "#dc2626", "#7c3aed", "#0891b2", "#db2777", "#475569"]

if chart_type == "line":
    ax.plot(labels, values, marker="o", linewidth=2.5, color=colors[0])
    ax.fill_between(labels, values, alpha=0.08, color=colors[0])
elif chart_type == "area":
    ax.plot(labels, values, marker="o", linewidth=2.5, color=colors[0])
    ax.fill_between(labels, values, alpha=0.28, color=colors[0])
elif chart_type == "scatter":
    x = list(range(len(labels)))
    ax.scatter(x, values, s=70, color=colors[0], edgecolor="white", linewidth=1.2)
    ax.set_xticks(x)
    ax.set_xticklabels(labels)
elif chart_type == "histogram":
    ax.hist(values, bins=min(8, max(3, len(values))), color=colors[0], edgecolor="white")
elif chart_type == "stacked_bar":
    series = chart.get("series") or []
    valid_series = [s for s in series if isinstance(s.get("values"), list) and len(s.get("values")) >= len(labels)]
    if valid_series:
        bottoms = [0] * len(labels)
        for idx, serie in enumerate(valid_series):
            serie_values = [float(v or 0) for v in serie["values"][:len(labels)]]
            bars = ax.bar(labels, serie_values, bottom=bottoms, color=colors[idx % len(colors)], label=serie.get("name") or f"Series {idx + 1}")
            bottoms = [bottoms[i] + serie_values[i] for i in range(len(labels))]
        ax.legend(fontsize=8, frameon=False)
    else:
        bars = ax.bar(labels, values, color=colors[:len(labels)])
        ax.bar_label(bars, padding=4, fontsize=9)
elif chart_type == "pie" or chart_type == "donut":
    pie_values = [abs(v) for v in values]
    if sum(pie_values) <= 0:
        pie_values = [1] * len(values)
    wedges, texts, autotexts = ax.pie(pie_values, labels=labels, autopct="%1.1f%%", startangle=90, colors=colors[:len(labels)])
    if chart_type == "donut":
        centre_circle = plt.Circle((0, 0), 0.58, fc="white")
        fig.gca().add_artist(centre_circle)
    ax.axis("equal")
else:
    if chart_type == "horizontal_bar":
        bars = ax.barh(labels, values, color=colors[:len(labels)])
        ax.bar_label(bars, padding=4, fontsize=9)
    else:
        bars = ax.bar(labels, values, color=colors[:len(labels)])
        ax.bar_label(bars, padding=4, fontsize=9)

if chart_type not in ["pie", "donut"]:
    ax.set_xlabel(x_label)
    ax.set_ylabel(y_label)
    ax.spines["top"].set_visible(False)
    ax.spines["right"].set_visible(False)
    ax.tick_params(axis="x", labelrotation=20)

ax.set_title(title, fontsize=14, fontweight="bold", pad=14)
fig.tight_layout()
fig.savefig(${JSON.stringify(outputPath)}, bbox_inches="tight")
`;
}

function normalizeChart(chart = {}) {
  const labels = Array.isArray(chart.labels)
    ? chart.labels.map((label) => String(label))
    : [];
  const values = Array.isArray(chart.values)
    ? chart.values.map((value) => Number(value))
    : [];
  const length = Math.min(labels.length, values.length);
  if (length === 0) return null;

  return {
    title: String(chart.title || "Chart"),
    type: SUPPORTED_CHART_TYPES.includes(chart.type) ? chart.type : "bar",
    labels: labels.slice(0, length),
    values: values
      .slice(0, length)
      .map((value) => (Number.isFinite(value) ? value : 0)),
    series: normalizeChartSeries(chart.series, length),
    xLabel: chart.xLabel ? String(chart.xLabel) : "",
    yLabel: chart.yLabel ? String(chart.yLabel) : "",
    insight: chart.insight ? String(chart.insight) : "",
  };
}

function normalizeChartSeries(series = [], length = 0) {
  if (!Array.isArray(series) || length === 0) return [];
  return series
    .map((item, index) => {
      const values = Array.isArray(item?.values)
        ? item.values
            .slice(0, length)
            .map((value) => Number(value))
            .map((value) => (Number.isFinite(value) ? value : 0))
        : [];
      if (values.length !== length) return null;
      return {
        name: String(item?.name || `Series ${index + 1}`),
        values,
      };
    })
    .filter(Boolean);
}

function normalizeFormat(format, filename) {
  const filenameExt = filename?.split(".")?.pop()?.toLowerCase();
  const requested = String(format || filenameExt || "png")
    .toLowerCase()
    .replace(/^\./, "");

  if (!SUPPORTED_FORMATS.includes(requested)) return "png";
  return requested;
}

function ensureExtension(filename, extension) {
  const fallback = `chart.${extension}`;
  const safeName = (filename || fallback).replace(/[<>:"/\\|?*]/g, "_");
  return /\.\w+$/.test(safeName) ? safeName : `${safeName}.${extension}`;
}

async function runPythonScript(scriptPath, cwd) {
  const candidates = pythonCandidates();
  const errors = [];

  for (const candidate of candidates) {
    try {
      return await execPython(
        candidate.command,
        [...candidate.args, scriptPath],
        {
          cwd,
          env: { ...process.env, MPLBACKEND: "Agg" },
        }
      );
    } catch (error) {
      if (error.code === "ENOENT" || isWindowsPythonAliasError(error)) {
        errors.push(`${candidate.command} not available`);
        continue;
      }
      throw error;
    }
  }

  throw new Error(
    `No Python executable was found. Tried: ${errors.join(", ")}. Set PYTHON_BIN to a Python environment with matplotlib installed.`
  );
}

function isWindowsPythonAliasError(error) {
  return /Python was not found; run without arguments to install from the Microsoft Store/i.test(
    error.message || ""
  );
}

function pythonCandidates() {
  if (process.env.PYTHON_BIN) {
    return [{ command: process.env.PYTHON_BIN, args: [] }];
  }
  return [
    { command: "python3", args: [] },
    { command: "python", args: [] },
    { command: "py", args: ["-3"] },
  ];
}

function execPython(command, args, options) {
  return new Promise((resolve, reject) => {
    execFile(
      command,
      args,
      {
        ...options,
        timeout: EXECUTION_TIMEOUT_MS,
        maxBuffer: MAX_STDIO_BYTES,
        windowsHide: true,
      },
      (error, stdout, stderr) => {
        if (error) {
          const details = stderr?.trim() || stdout?.trim() || error.message;
          reject(
            new Error(
              `Python execution failed with ${command}: ${details.substring(0, 4000)}`
            )
          );
          return;
        }
        resolve({ stdout, stderr });
      }
    );
  });
}
