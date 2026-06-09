const { safeJsonParse } = require("../../../http");
const { Deduplicator } = require("../utils/dedupe");

const rechart = {
  name: "create-chart",
  startupConfig: {
    params: {},
  },
  plugin: function () {
    return {
      name: this.name,
      setup(aibitat) {
        // Scrape a website and summarize the content based on objective if the content is too large.',
        aibitat.function({
          super: aibitat,
          name: this.name,
          tracker: new Deduplicator(),
          description:
            "Create a chart, graph, or data visualization. Generate bar charts, line graphs, pie charts, area charts, or scatter plots to visualize data, statistics, trends, or results. Use to display numbers and data visually.",
          examples: [
            { prompt: "Create a chart from that data" },
            { prompt: "Make a bar graph of the results" },
            { prompt: "Visualize these numbers" },
          ],
          parameters: {
            $schema: "http://json-schema.org/draft-07/schema#",
            type: "object",
            properties: {
              type: {
                type: "string",
                enum: [
                  "area",
                  "bar",
                  "line",
                  "composed",
                  "scatter",
                  "pie",
                  "radar",
                  "radialBar",
                  "treemap",
                  "funnel",
                ],
                description: "The type of chart to be generated.",
              },
              title: {
                type: "string",
                description:
                  "Title of the chart. There MUST always be a title. Do not leave it blank.",
              },
              dataset: {
                type: "string",
                description: `Valid JSON array where each element is an object containing chart-ready data. Use "name" for the primary category/time label, and use clear metric keys for numeric values. Example: [{ "name": "Jan", "revenue": 12000, "cost": 7000 }]. Use double quotes and JSON only.`,
              },
              option: {
                type: "string",
                description: `Optional valid ECharts option JSON for a polished visualization. Use this when the data needs multiple series, zooming, legends, better tooltips, or a dashboard-quality chart. Keep it JSON only with no functions. Prefer canvas-safe options: title, tooltip, legend, grid, xAxis, yAxis, series, dataset, dataZoom, radar, visualMap. For large datasets, add dataZoom and aggregate to top-N when needed.`,
              },
            },
            additionalProperties: false,
          },
          required: ["type", "title", "dataset"],
          handler: async function ({ type, dataset, title, option = null }) {
            try {
              if (this.tracker.isMarkedUnique(this.name)) {
                this.super.handlerProps.log(
                  `${this.name} has been called for this chat response already. It can only be called once per chat.`
                );
                return "The chart was generated and returned to the user. This function completed successfully. Do not call this function again.";
              }

              const data = safeJsonParse(dataset, null);
              if (data === null) {
                this.super.introspect(
                  `${this.caller}: ${this.name} provided invalid JSON data - so we cant make a ${type} chart.`
                );
                return "Invalid JSON provided. Please only provide valid chart JSON to generate a chart.";
              }

              const echartsOption = option ? safeJsonParse(option, null) : null;
              this.super.introspect(`${this.caller}: Rendering ${type} chart.`);
              this.super.socket.send("rechartVisualize", {
                type,
                dataset,
                title,
                ...(echartsOption ? { option } : {}),
              });

              this.super._replySpecialAttributes = {
                saveAsType: "rechartVisualize",
                storedResponse: (additionalText = "") =>
                  JSON.stringify({
                    type,
                    dataset,
                    title,
                    ...(echartsOption ? { option } : {}),
                    caption: additionalText,
                  }),
                postSave: () => this.tracker.removeUniqueConstraint(this.name),
              };

              this.tracker.markUnique(this.name);
              return "The chart was generated and returned to the user. This function completed successfully. Do not make another chart.";
            } catch (error) {
              this.super.handlerProps.log(
                `create-chart raised an error. ${error.message}`
              );
              return `Let the user know this action was not successful. An error was raised while generating the chart. ${error.message}`;
            }
          },
        });
      },
    };
  },
};

module.exports = {
  rechart,
};
