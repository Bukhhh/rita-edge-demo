const fs = require("fs/promises");
const path = require("path");
const os = require("os");
const { execFile } = require("child_process");
const createFilesLib = require("../lib.js");

const SUPPORTED_FORMATS = ["png", "jpg", "jpeg", "svg", "pdf"];
const EXECUTION_TIMEOUT_MS = 45_000;
const MAX_STDIO_BYTES = 1024 * 1024;

module.exports.CreateMatplotlibChart = {
  name: "create-matplotlib-chart",
  plugin: function () {
    return {
      name: "create-matplotlib-chart",
      setup(aibitat) {
        aibitat.function({
          super: aibitat,
          name: this.name,
          description:
            "Create a high-quality chart image by running a Python script that uses matplotlib. " +
            "Use this when the requested visualization needs precise styling, annotations, multiple subplots, statistical plots, or richer chart formatting than the default chart tool. " +
            "The Python script must save the final figure to the output path provided in the RITA_MATPLOTLIB_OUTPUT environment variable. " +
            "Do not read or write arbitrary local files, use network access, install packages, or create interactive windows.",
          examples: [
            {
              prompt: "Create a polished matplotlib bar chart",
              call: JSON.stringify({
                filename: "sales-by-quarter.png",
                format: "png",
                code:
                  "import matplotlib.pyplot as plt\n" +
                  "quarters = ['Q1', 'Q2', 'Q3', 'Q4']\n" +
                  "sales = [120, 185, 160, 230]\n" +
                  "fig, ax = plt.subplots(figsize=(10, 5), dpi=160)\n" +
                  "bars = ax.bar(quarters, sales, color='#2563eb')\n" +
                  "ax.set_title('Sales by Quarter', fontsize=16, fontweight='bold')\n" +
                  "ax.set_ylabel('Revenue (RM thousands)')\n" +
                  "ax.bar_label(bars, padding=4)\n" +
                  "ax.spines[['top', 'right']].set_visible(False)\n" +
                  "fig.tight_layout()\n" +
                  "fig.savefig(output_path, bbox_inches='tight')",
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
                  "The display filename for the generated chart. Use a matching extension like .png, .svg, .pdf, .jpg, or .jpeg.",
              },
              format: {
                type: "string",
                enum: SUPPORTED_FORMATS,
                description:
                  "The output format. PNG is recommended for chat display and sharing.",
                default: "png",
              },
              code: {
                type: "string",
                description:
                  "Complete Python matplotlib script using plain ASCII quotes. The script can use matplotlib, numpy, pandas if installed, and standard Python. Save the final figure with fig.savefig(output_path, bbox_inches='tight') or plt.savefig(output_path, bbox_inches='tight'). The variable output_path is provided by the tool.",
              },
            },
            required: ["filename", "code"],
            additionalProperties: false,
          },
          handler: async function ({
            filename = "matplotlib-chart.png",
            format = "png",
            code = "",
          }) {
            let runDirectory = null;
            try {
              this.super.handlerProps.log(
                `Using the create-matplotlib-chart tool.`
              );

              const extension = normalizeFormat(format, filename);
              const displayFilename = ensureExtension(
                filename.split("/").pop(),
                extension
              );

              if (!code.trim()) return "No Python code was provided.";

              if (this.super.requestToolApproval) {
                const approval = await this.super.requestToolApproval({
                  skillName: this.name,
                  payload: { filename: displayFilename, format: extension },
                  description: `Run Python matplotlib code to create "${displayFilename}"`,
                });
                if (!approval.approved) {
                  this.super.introspect(
                    `${this.caller}: User rejected the ${this.name} request.`
                  );
                  return approval.message;
                }
              }

              runDirectory = await fs.mkdtemp(
                path.join(os.tmpdir(), "rita-matplotlib-")
              );
              const scriptPath = path.join(runDirectory, "chart.py");
              const outputPath = path.join(runDirectory, `chart.${extension}`);

              await fs.writeFile(scriptPath, buildScript(code), "utf8");

              this.super.introspect(
                `${this.caller}: Running matplotlib script for "${displayFilename}"`
              );

              const result = await runPythonScript(scriptPath, runDirectory, {
                RITA_MATPLOTLIB_OUTPUT: outputPath,
                MPLBACKEND: "Agg",
              });

              let buffer;
              try {
                buffer = await fs.readFile(outputPath);
              } catch {
                buffer = await readFallbackChartFile(runDirectory, extension);
                if (!buffer) {
                  const stderr = result.stderr?.trim();
                  return `Python completed but did not create a chart file. ${stderr ? `stderr: ${stderr}` : "Make sure the script saves to output_path."}`;
                }
              }

              if (buffer.length === 0) {
                return "Python created an empty chart file. Please generate a non-empty matplotlib figure.";
              }

              const savedFile = await createFilesLib.saveGeneratedFile({
                fileType: "matplotlib",
                extension,
                buffer,
                displayFilename,
              });

              this.super.socket.send("fileDownloadCard", {
                filename: savedFile.displayFilename,
                storageFilename: savedFile.filename,
                fileSize: savedFile.fileSize,
              });

              createFilesLib.registerOutput(this.super, "MatplotlibChart", {
                filename: savedFile.displayFilename,
                storageFilename: savedFile.filename,
                fileSize: savedFile.fileSize,
              });

              const sizeKB = (savedFile.fileSize / 1024).toFixed(2);
              this.super.introspect(
                `${this.caller}: Successfully created matplotlib chart "${displayFilename}"`
              );

              return `Successfully created matplotlib chart "${displayFilename}" (${sizeKB}KB).`;
            } catch (e) {
              this.super.handlerProps.log(
                `create-matplotlib-chart error: ${e.message}`
              );
              this.super.introspect(`Error: ${e.message}`);
              return `Error creating matplotlib chart: ${e.message}`;
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

function buildScript(userCode) {
  return [
    "import os",
    "import matplotlib",
    "matplotlib.use('Agg')",
    "output_path = os.environ['RITA_MATPLOTLIB_OUTPUT']",
    "",
    sanitizeMatplotlibCode(userCode),
    "",
  ].join("\n");
}

function sanitizeMatplotlibCode(userCode) {
  const code = normalizeEscapedPythonCode(userCode);
  return String(code || "")
    .trim()
    .replace(/^```(?:python|py)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201c\u201d]/g, '"');
}

function normalizeEscapedPythonCode(userCode) {
  const code = String(userCode || "");
  const escapedNewlineCount = (code.match(/\\n/g) || []).length;
  const realNewlineCount = (code.match(/\n/g) || []).length;

  if (escapedNewlineCount > realNewlineCount) {
    return code
      .replace(/\\r\\n/g, "\n")
      .replace(/\\n/g, "\n")
      .replace(/\\t/g, "  ");
  }

  return code;
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
  const fallback = `matplotlib-chart.${extension}`;
  const safeName = (filename || fallback).replace(/[<>:"/\\|?*]/g, "_");
  return /\.\w+$/.test(safeName) ? safeName : `${safeName}.${extension}`;
}

async function runPythonScript(scriptPath, cwd, extraEnv = {}) {
  const candidates = pythonCandidates();
  const errors = [];

  for (const candidate of candidates) {
    try {
      return await execPython(
        candidate.command,
        [...candidate.args, scriptPath],
        {
          cwd,
          env: { ...process.env, ...extraEnv },
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

async function readFallbackChartFile(runDirectory, extension) {
  const files = await fs.readdir(runDirectory);
  const candidates = files.filter((file) => {
    const ext = file.split(".").pop()?.toLowerCase();
    return ext === extension && !file.startsWith("chart.");
  });

  for (const candidate of candidates) {
    const filePath = path.join(runDirectory, candidate);
    const stat = await fs.stat(filePath);
    if (stat.isFile() && stat.size > 0) return fs.readFile(filePath);
  }

  return null;
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
