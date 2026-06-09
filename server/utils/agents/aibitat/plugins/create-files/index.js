const { CreatePptxPresentation } = require("./pptx/create-presentation.js");
const { CreateTextFile } = require("./text/create-text-file.js");
const { CreatePdfFile } = require("./pdf/create-pdf-file.js");
const {
  CreateChartPdfReport,
} = require("./pdf/create-chart-pdf-report.js");
const { CreateExcelFile } = require("./xlsx/create-excel-file.js");
const { CreateDocxFile } = require("./docx/create-docx-file.js");
const {
  CreateMatplotlibChart,
} = require("./python/create-matplotlib-chart.js");

const createFilesAgent = {
  name: "create-files-agent",
  startupConfig: {
    params: {},
  },
  plugin: [
    CreatePptxPresentation,
    CreateTextFile,
    CreatePdfFile,
    CreateChartPdfReport,
    CreateExcelFile,
    CreateDocxFile,
    CreateMatplotlibChart,
  ],
};

module.exports = {
  createFilesAgent,
};
