const AgentPlugins = require("./aibitat/plugins");
const { SystemSettings } = require("../../models/systemSettings");
const { safeJsonParse } = require("../http");
const Provider = require("./aibitat/providers/ai-provider");

const RITA_DISABLED_AGENT_SKILLS = new Set([
  "web-scraping",
  "web-browsing",
  "filesystem-agent",
  "sql-agent",
  "gmail-agent",
  "google-calendar-agent",
  "outlook-agent",
]);

// This is a list of skills that are built-in and default enabled.
const DEFAULT_SKILLS = [
  AgentPlugins.memory.name,
  AgentPlugins.docSummarizer.name,
  AgentPlugins.webScraping.name,
].filter((skill) => !RITA_DISABLED_AGENT_SKILLS.has(skill));

/**
 * Configuration for agent skills that require availability checks and disabled sub-skill lists.
 * Each entry maps a skill name to its availability checker and disabled skills list key.
 */
const SKILL_FILTER_CONFIG = {
  "filesystem-agent": {
    getAvailability: () =>
      require("./aibitat/plugins/filesystem/lib").isToolAvailable(),
    disabledSettingKey: "disabled_filesystem_skills",
  },
  "create-files-agent": {
    getAvailability: () =>
      require("./aibitat/plugins/create-files/lib").isToolAvailable(),
    disabledSettingKey: "disabled_create_files_skills",
  },
  "gmail-agent": {
    getAvailability: async () =>
      require("./aibitat/plugins/gmail/lib").GmailBridge.isToolAvailable(),
    disabledSettingKey: "disabled_gmail_skills",
  },
  "outlook-agent": {
    getAvailability: async () =>
      require("./aibitat/plugins/outlook/lib").OutlookBridge.isToolAvailable(),
    disabledSettingKey: "disabled_outlook_skills",
  },
};

const USER_AGENT = {
  name: "USER",
  getDefinition: () => {
    return {
      interrupt: "ALWAYS",
      role: "I am the human monitor and oversee this chat. Any questions on action or decision making should be directed to me.",
    };
  },
};

const WORKSPACE_AGENT = {
  name: "@agent",
  /**
   * Get the definition for the workspace agent with its role (prompt) and functions in Aibitat format
   * @param {string} provider
   * @param {import("@prisma/client").workspaces | null} workspace
   * @param {import("@prisma/client").users | null} user
   * @param {string} [prompt] - Current user message for memory reranking
   * @returns {Promise<{ role: string, functions: object[] }>}
   */
  getDefinition: async (
    provider = null,
    workspace = null,
    user = null,
    prompt = "",
    ritaAgent = null
  ) => {
    let role = await Provider.systemPrompt({
      provider,
      workspace,
      user,
      prompt,
    });
    if (ritaAgent?.instructions) {
      role = `${role}\n\n<RITA_AGENT_PROFILE>\nName: ${ritaAgent.name}\nDescription: ${ritaAgent.description}\nDefault output: ${ritaAgent.default_output}\nInstructions: ${ritaAgent.instructions}\n${ritaAgentRuntimeRules(ritaAgent)}\n</RITA_AGENT_PROFILE>`;
    }

    return {
      role,
      functions: [...(await agentSkillsFromSystemSettings())],
    };
  },
};

function ritaAgentRuntimeRules(ritaAgent = {}) {
  if (ritaAgent.id === "rita-report-agent") {
    return [
      "Runtime rules:",
      "- When the user asks for a PDF report with charts, call create-chart-pdf-report. Do not only describe that you will call it.",
      "- If chart data can be reasonably extracted from attached_documents or workspace context, build structured chart specs and call the tool immediately.",
      "- If the requested chart data is not explicit, choose practical chart labels/values from the document profile and state assumptions in the report sections.",
      "- Only reply in plain text instead of calling a tool when no data/context exists or the user explicitly asks for explanation only.",
    ].join("\n");
  }

  if (ritaAgent.id === "rita-graph-agent") {
    return [
      "Runtime rules:",
      "- When the user asks for a graph/chart output, call create-matplotlib-chart for image output or create-chart-pdf-report for PDF output.",
      "- Do not only describe that you will create a graph. Generate the requested file using the tool.",
      "- Do not import uploaded documents as Python modules. Extract labels and numeric values from attached_documents or workspace context and inline them in the tool arguments.",
      "- Create exactly one graph unless the user explicitly asks otherwise.",
    ].join("\n");
  }

  return "";
}

/**
 * Fetches and preloads the names/identifiers for plugins that will be dynamically
 * loaded later
 * @returns {Promise<string[]>}
 */
async function agentSkillsFromSystemSettings() {
  const systemFunctions = [];

  // Load non-imported built-in skills that are configurable, but are default enabled.
  const _disabledDefaultSkills = safeJsonParse(
    await SystemSettings.getValueOrFallback(
      { label: "disabled_agent_skills" },
      "[]"
    ),
    []
  );
  DEFAULT_SKILLS.forEach((skill) => {
    if (RITA_DISABLED_AGENT_SKILLS.has(skill)) return;
    if (!_disabledDefaultSkills.includes(skill))
      systemFunctions.push(AgentPlugins[skill].name);
  });

  // Load non-imported built-in skills that are configurable.
  const _setting = safeJsonParse(
    await SystemSettings.getValueOrFallback(
      { label: "default_agent_skills" },
      "[]"
    ),
    []
  );

  // Pre-load disabled sub-skills and availability for configured skills
  const skillFilterState = {};
  for (const skillName of Object.keys(SKILL_FILTER_CONFIG)) {
    if (!_setting.includes(skillName)) continue;
    const config = SKILL_FILTER_CONFIG[skillName];
    skillFilterState[skillName] = {
      available: await config.getAvailability(),
      disabledSubSkills: safeJsonParse(
        await SystemSettings.getValueOrFallback(
          { label: config.disabledSettingKey },
          "[]"
        ),
        []
      ),
    };
  }

  for (const skillName of _setting) {
    if (RITA_DISABLED_AGENT_SKILLS.has(skillName)) continue;
    if (!AgentPlugins.hasOwnProperty(skillName)) continue;

    // This is a plugin module with many sub-children plugins who
    // need to be named via `${parent}#${child}` naming convention
    if (Array.isArray(AgentPlugins[skillName].plugin)) {
      for (const subPlugin of AgentPlugins[skillName].plugin) {
        // Check if this skill has filter configuration
        const filterState = skillFilterState[skillName];
        if (filterState) {
          if (!filterState.available) continue;
          if (filterState.disabledSubSkills.includes(subPlugin.name)) continue;
        }

        systemFunctions.push(
          `${AgentPlugins[skillName].name}#${subPlugin.name}`
        );
      }
      continue;
    }

    // This is normal single-stage plugin
    systemFunctions.push(AgentPlugins[skillName].name);
  }
  return systemFunctions;
}

module.exports = {
  USER_AGENT,
  WORKSPACE_AGENT,
  agentSkillsFromSystemSettings,
};
