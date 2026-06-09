const fs = require("fs/promises");
const path = require("path");
const os = require("os");
const { execFile } = require("child_process");
const createFilesLib = require("../lib.js");
const { SystemSettings } = require("../../../../../../models/systemSettings");

const EXECUTION_TIMEOUT_MS = 45_000;
const MAX_STDIO_BYTES = 1024 * 1024;
const PAGE = { width: 595.28, height: 841.89 };
const MARGIN = 48;

module.exports.CreateChartPdfReport = {
  name: "create-chart-pdf-report",
  plugin: function () {
    return {
      name: "create-chart-pdf-report",
      setup(aibitat) {
        aibitat.function({
          super: aibitat,
          name: this.name,
          description:
            "Create a polished PDF report with embedded chart images generated from structured chart data. " +
            "Use this for report/dashboard outputs when the user wants charts inside a PDF. " +
            "Provide chart specs with labels and numeric values; the tool will generate matplotlib charts and embed them into the PDF.",
          examples: [
            {
              prompt:
                "Create a PDF report with a bar chart for Jan 10, Feb 20, Mar 15",
              call: JSON.stringify({
                filename: "monthly-values-report.pdf",
                title: "Monthly Values Report",
                summary:
                  "February recorded the highest value while January was the lowest.",
                sections: [
                  {
                    heading: "Key Findings",
                    content:
                      "The values are Jan 10, Feb 20, and Mar 15. February is 100% higher than January.",
                  },
                ],
                charts: [
                  {
                    title: "Monthly Values",
                    type: "bar",
                    labels: ["Jan", "Feb", "Mar"],
                    values: [10, 20, 15],
                    xLabel: "Month",
                    yLabel: "Value",
                    insight: "February has the strongest value.",
                  },
                ],
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
                  "The display filename for the PDF report. The .pdf extension will be added automatically if missing.",
              },
              title: {
                type: "string",
                description: "The report title.",
              },
              summary: {
                type: "string",
                description:
                  "Short executive summary shown near the top of the report.",
              },
              sections: {
                type: "array",
                description:
                  "Narrative report sections. Use these for findings, assumptions, recommendations, and methodology.",
                items: {
                  type: "object",
                  properties: {
                    heading: { type: "string" },
                    content: { type: "string" },
                  },
                  required: ["heading", "content"],
                  additionalProperties: false,
                },
                default: [],
              },
              charts: {
                type: "array",
                description:
                  "Charts to generate and embed. Keep labels and values the same length. Supported types: bar, horizontal_bar, stacked_bar, line, area, pie, donut, histogram, scatter.",
                items: {
                  type: "object",
                  properties: {
                    title: { type: "string" },
                    type: {
                      type: "string",
                      enum: [
                        "bar",
                        "horizontal_bar",
                        "stacked_bar",
                        "line",
                        "area",
                        "pie",
                        "donut",
                        "histogram",
                        "scatter",
                      ],
                      default: "bar",
                    },
                    labels: {
                      type: "array",
                      items: { type: "string" },
                    },
                    values: {
                      type: "array",
                      items: { type: "number" },
                    },
                    series: {
                      type: "array",
                      description:
                        "Optional series for stacked bar charts. Each series needs a name and numeric values matching labels length.",
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
                        "One or two sentence interpretation shown below the chart.",
                    },
                  },
                  required: ["title", "type", "labels", "values"],
                  additionalProperties: false,
                },
                default: [],
              },
              recommendations: {
                type: "array",
                items: { type: "string" },
                description: "Optional recommendation bullets.",
                default: [],
              },
            },
            required: ["filename", "title", "charts"],
            additionalProperties: false,
          },
          handler: async function ({
            filename = "chart-report.pdf",
            title = "Chart Report",
            summary = "",
            sections = [],
            charts = [],
            recommendations = [],
          }) {
            let runDirectory = null;
            try {
              this.super.handlerProps.log(
                `Using the create-chart-pdf-report tool.`
              );

              const displayFilename = ensurePdfExtension(
                filename.split("/").pop()
              );
              const cleanCharts = normalizeCharts(charts);
              if (cleanCharts.length === 0) {
                return "No valid chart data was provided. Provide at least one chart with matching labels and numeric values.";
              }

              if (this.super.requestToolApproval) {
                const approval = await this.super.requestToolApproval({
                  skillName: this.name,
                  payload: {
                    filename: displayFilename,
                    charts: cleanCharts.map((chart) => ({
                      title: chart.title,
                      type: chart.type,
                    })),
                  },
                  description: `Create chart PDF report "${displayFilename}"`,
                });
                if (!approval.approved) {
                  this.super.introspect(
                    `${this.caller}: User rejected the ${this.name} request.`
                  );
                  return approval.message;
                }
              }

              runDirectory = await fs.mkdtemp(
                path.join(os.tmpdir(), "rita-chart-pdf-")
              );

              this.super.introspect(
                `${this.caller}: Generating chart images for "${displayFilename}"`
              );

              const chartImages = [];
              for (let index = 0; index < cleanCharts.length; index++) {
                const chart = cleanCharts[index];
                const outputPath = path.join(runDirectory, `chart-${index}.png`);
                await generateChartPng(chart, outputPath, runDirectory);
                chartImages.push({
                  ...chart,
                  buffer: await fs.readFile(outputPath),
                });
              }

              this.super.introspect(
                `${this.caller}: Building PDF report "${displayFilename}"`
              );

              const buffer = await buildPdfReport({
                title,
                summary,
                sections,
                chartImages,
                recommendations,
              });

              const savedFile = await createFilesLib.saveGeneratedFile({
                fileType: "pdf",
                extension: "pdf",
                buffer,
                displayFilename,
              });

              this.super.socket.send("fileDownloadCard", {
                filename: savedFile.displayFilename,
                storageFilename: savedFile.filename,
                fileSize: savedFile.fileSize,
              });

              createFilesLib.registerOutput(this.super, "ChartPdfReport", {
                filename: savedFile.displayFilename,
                storageFilename: savedFile.filename,
                fileSize: savedFile.fileSize,
              });

              const sizeKB = (savedFile.fileSize / 1024).toFixed(2);
              this.super.introspect(
                `${this.caller}: Successfully created chart PDF report "${displayFilename}"`
              );

              return `Successfully created chart PDF report "${displayFilename}" (${sizeKB}KB) with ${chartImages.length} embedded chart image${chartImages.length === 1 ? "" : "s"}.`;
            } catch (e) {
              this.super.handlerProps.log(
                `create-chart-pdf-report error: ${e.message}`
              );
              this.super.introspect(`Error: ${e.message}`);
              return `Error creating chart PDF report: ${e.message}`;
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

async function buildPdfReport({
  title,
  summary,
  sections = [],
  chartImages = [],
  recommendations = [],
}) {
  const { PDFDocument, rgb, StandardFonts } = await import("pdf-lib");
  const template = await SystemSettings.ritaPdfTemplate();
  const colors = {
    primary: hexToRgb(template.primary_color, rgb),
    accent: hexToRgb(template.accent_color, rgb),
    text: rgb(0.22, 0.25, 0.3),
    heading: hexToRgb(template.primary_color, rgb),
    muted: rgb(0.35, 0.38, 0.44),
  };
  const pdfDoc = await PDFDocument.create();
  const fonts = {
    regular: await pdfDoc.embedFont(StandardFonts.Helvetica),
    bold: await pdfDoc.embedFont(StandardFonts.HelveticaBold),
    italic: await pdfDoc.embedFont(StandardFonts.HelveticaOblique),
  };
  const state = {
    pdfDoc,
    rgb,
    fonts,
    page: pdfDoc.addPage([PAGE.width, PAGE.height]),
    y: PAGE.height - MARGIN,
  };

  if (template.show_logo && template.logo_position?.startsWith("top")) {
    state.y -= 44;
  }

  drawText(state, String(title || "Chart Report"), {
    size: 22,
    font: fonts.bold,
    color: colors.primary,
    gap: 18,
  });

  if (summary) {
    drawText(state, "Executive Summary", {
      size: 13,
      font: fonts.bold,
      color: colors.heading,
      gap: 6,
    });
    drawText(state, summary, {
      size: 10.5,
      lineHeight: 15,
      color: colors.text,
      gap: 18,
    });
  }

  for (const section of sections || []) {
    if (!section?.heading && !section?.content) continue;
    drawText(state, section.heading || "Section", {
      size: 13,
      font: fonts.bold,
      color: colors.heading,
      gap: 6,
    });
    drawText(state, section.content || "", {
      size: 10.5,
      lineHeight: 15,
      color: colors.text,
      gap: 16,
    });
  }

  const chartHeightLimit = getChartHeightLimit(template.chart_size);
  for (const chart of chartImages) {
    ensureSpace(state, chartHeightLimit + 60);
    drawText(state, chart.title, {
      size: 14,
      font: fonts.bold,
      color: colors.heading,
      gap: 8,
    });

    const png = await pdfDoc.embedPng(chart.buffer);
    const maxWidth = PAGE.width - MARGIN * 2;
    const width = maxWidth;
    const height = Math.min(chartHeightLimit, (png.height / png.width) * width);
    ensureSpace(state, height + 44);
    state.page.drawImage(png, {
      x: MARGIN,
      y: state.y - height,
      width,
      height,
    });
    state.y -= height + 10;

    if (chart.insight) {
      drawText(state, chart.insight, {
        size: 10,
        font: fonts.italic,
        lineHeight: 14,
        color: colors.muted,
        gap: 18,
      });
    }
  }

  if (recommendations?.length) {
    drawText(state, "Recommendations", {
      size: 13,
      font: fonts.bold,
      color: colors.heading,
      gap: 6,
    });
    for (const recommendation of recommendations) {
      drawText(state, `- ${recommendation}`, {
        size: 10.5,
        lineHeight: 15,
        color: colors.text,
        gap: 4,
      });
    }
  }

  if (template.show_page_numbers) drawPageNumbers(state);
  await applyRitaPdfTemplate(pdfDoc, { rgb, StandardFonts, template });
  return Buffer.from(await pdfDoc.save());
}

function getChartHeightLimit(chartSize = "large") {
  const sizes = {
    medium: 220,
    large: 300,
    full: 390,
  };
  return sizes[chartSize] || sizes.large;
}

function hexToRgb(hex, rgb) {
  const normalized = /^#[0-9a-fA-F]{6}$/.test(hex) ? hex : "#1f4e79";
  const value = normalized.replace("#", "");
  const r = parseInt(value.slice(0, 2), 16) / 255;
  const g = parseInt(value.slice(2, 4), 16) / 255;
  const b = parseInt(value.slice(4, 6), 16) / 255;
  return rgb(r, g, b);
}

async function applyRitaPdfTemplate(
  pdfDoc,
  { rgb, StandardFonts, template }
) {
  const pages = pdfDoc.getPages();
  const regular = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const logoPng =
    template.show_logo && template.logo_position !== "none"
      ? await createFilesLib.getInstanceLogo({
          forDarkBackground: false,
          format: "buffer",
        })
      : null;
  const logo = logoPng ? await pdfDoc.embedPng(logoPng).catch(() => null) : null;
  const footer = String(template.footer_text || "").trim();

  for (const page of pages) {
    if (logo) {
      const logoDims = logo.scaleToFit(72, 32);
      const { x, y } = logoPosition(
        template.logo_position,
        logoDims.width,
        logoDims.height
      );
      page.drawImage(logo, {
        x,
        y,
        width: logoDims.width,
        height: logoDims.height,
      });
    }

    if (footer) {
      page.drawText(footer, {
        x: MARGIN,
        y: 22,
        size: 8,
        font: regular,
        color: rgb(0.55, 0.57, 0.62),
      });
    }
  }
}

function logoPosition(position, width, height) {
  const bottom = 34;
  const top = PAGE.height - MARGIN + 8;
  switch (position) {
    case "top-left":
      return { x: MARGIN, y: top - height };
    case "bottom-left":
      return { x: MARGIN, y: bottom };
    case "bottom-right":
      return { x: PAGE.width - MARGIN - width, y: bottom };
    case "top-right":
    default:
      return { x: PAGE.width - MARGIN - width, y: top - height };
  }
}

function drawText(state, text, options = {}) {
  const {
    size = 10,
    lineHeight = size + 4,
    font = state.fonts.regular,
    color = state.rgb(0, 0, 0),
    gap = 8,
  } = options;
  const lines = wrapText(String(text || ""), font, size, PAGE.width - MARGIN * 2);
  ensureSpace(state, lines.length * lineHeight + gap);
  for (const line of lines) {
    state.page.drawText(line, { x: MARGIN, y: state.y, size, font, color });
    state.y -= lineHeight;
  }
  state.y -= gap;
}

function ensureSpace(state, requiredHeight) {
  if (state.y - requiredHeight >= MARGIN) return;
  state.page = state.pdfDoc.addPage([PAGE.width, PAGE.height]);
  state.y = PAGE.height - MARGIN;
}

function drawPageNumbers(state) {
  const pages = state.pdfDoc.getPages();
  for (let index = 0; index < pages.length; index++) {
    const page = pages[index];
    const text = `${index + 1} / ${pages.length}`;
    const size = 8;
    page.drawText(text, {
      x: PAGE.width / 2 - state.fonts.regular.widthOfTextAtSize(text, size) / 2,
      y: 22,
      size,
      font: state.fonts.regular,
      color: state.rgb(0.55, 0.57, 0.62),
    });
  }
}

function wrapText(text, font, size, maxWidth) {
  const paragraphs = String(text || "").split(/\n+/);
  const lines = [];
  for (const paragraph of paragraphs) {
    const words = paragraph.trim().split(/\s+/).filter(Boolean);
    if (words.length === 0) {
      lines.push("");
      continue;
    }
    let line = "";
    for (const word of words) {
      const next = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(next, size) <= maxWidth) {
        line = next;
      } else {
        if (line) lines.push(line);
        line = word;
      }
    }
    if (line) lines.push(line);
  }
  return lines;
}

async function generateChartPng(chart, outputPath, cwd) {
  const dataPath = path.join(cwd, `${path.basename(outputPath)}.json`);
  const scriptPath = path.join(cwd, `${path.basename(outputPath)}.py`);
  await fs.writeFile(dataPath, JSON.stringify(chart), "utf8");
  await fs.writeFile(scriptPath, chartScript(dataPath, outputPath), "utf8");
  await runPythonScript(scriptPath, cwd);
}

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
    wedges, texts, autotexts = ax.pie(values, labels=labels, autopct="%1.1f%%", startangle=90, colors=colors[:len(labels)])
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

function normalizeCharts(charts = []) {
  return (Array.isArray(charts) ? charts : [])
    .map((chart, index) => {
      const labels = Array.isArray(chart?.labels)
        ? chart.labels.map((label) => String(label))
        : [];
      const values = Array.isArray(chart?.values)
        ? chart.values.map((value) => Number(value))
        : [];
      const length = Math.min(labels.length, values.length);
      if (length === 0) return null;
      return {
        title: String(chart?.title || `Chart ${index + 1}`),
        type: [
          "bar",
          "horizontal_bar",
          "stacked_bar",
          "line",
          "area",
          "pie",
          "donut",
          "histogram",
          "scatter",
        ].includes(chart?.type)
          ? chart.type
          : "bar",
        labels: labels.slice(0, length),
        values: values.slice(0, length).map((value) =>
          Number.isFinite(value) ? value : 0
        ),
        series: normalizeChartSeries(chart?.series, length),
        xLabel: chart?.xLabel ? String(chart.xLabel) : "",
        yLabel: chart?.yLabel ? String(chart.yLabel) : "",
        insight: chart?.insight ? String(chart.insight) : "",
      };
    })
    .filter(Boolean);
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

function ensurePdfExtension(filename) {
  const safeName = (filename || "chart-report.pdf").replace(/[<>:"/\\|?*]/g, "_");
  return /\.pdf$/i.test(safeName) ? safeName : `${safeName}.pdf`;
}

async function runPythonScript(scriptPath, cwd) {
  const candidates = pythonCandidates();
  const errors = [];

  for (const candidate of candidates) {
    try {
      return await execPython(candidate.command, [...candidate.args, scriptPath], {
        cwd,
        env: { ...process.env, MPLBACKEND: "Agg" },
      });
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
              `Python chart generation failed with ${command}: ${details.substring(0, 4000)}`
            )
          );
          return;
        }
        resolve({ stdout, stderr });
      }
    );
  });
}
