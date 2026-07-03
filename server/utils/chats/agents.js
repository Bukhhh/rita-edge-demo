const pluralize = require("pluralize");
const {
  WorkspaceAgentInvocation,
} = require("../../models/workspaceAgentInvocation");
const { writeResponseChunk } = require("../helpers/chat/responses");
const { Workspace } = require("../../models/workspace");
const { SystemSettings } = require("../../models/systemSettings");

/**
 * In-memory cache for attachments associated with agent invocations.
 * Attachments are stored here when grepAgents creates an invocation,
 * then retrieved by AgentHandler when the websocket connects.
 * @type {Map<string, Array>}
 */
const invocationAttachmentsCache = new Map();
const invocationRitaAgentsCache = new Map();
const invocationRitaContextSourcesCache = new Map();

/**
 * Store attachments for an invocation UUID
 * @param {string} uuid - The invocation UUID
 * @param {Array} attachments - The attachments array
 */
function cacheInvocationAttachments(uuid, attachments = []) {
  if (attachments.length > 0) {
    invocationAttachmentsCache.set(uuid, attachments);
  }
}

/**
 * Retrieve and remove attachments for an invocation UUID
 * @param {string} uuid - The invocation UUID
 * @returns {Array} The attachments array (empty if none cached)
 */
function getAndClearInvocationAttachments(uuid) {
  const attachments = invocationAttachmentsCache.get(uuid) || [];
  invocationAttachmentsCache.delete(uuid);
  return attachments;
}

function cacheInvocationRitaAgent(uuid, ritaAgent = null) {
  if (!uuid || !ritaAgent) return;
  invocationRitaAgentsCache.set(uuid, ritaAgent);
}

function getAndClearInvocationRitaAgent(uuid) {
  const agent = invocationRitaAgentsCache.get(uuid) || null;
  invocationRitaAgentsCache.delete(uuid);
  return agent;
}

function cacheInvocationRitaContextSources(uuid, ritaContextSources = null) {
  if (!uuid || !Array.isArray(ritaContextSources)) return;
  invocationRitaContextSourcesCache.set(uuid, ritaContextSources);
}

function getAndClearInvocationRitaContextSources(uuid) {
  if (!invocationRitaContextSourcesCache.has(uuid)) return null;
  const sources = invocationRitaContextSourcesCache.get(uuid) || [];
  invocationRitaContextSourcesCache.delete(uuid);
  return sources;
}

async function grepAgents({
  uuid,
  response,
  message,
  workspace,
  user = null,
  thread = null,
  attachments = [],
  selectedRitaAgentId = null,
  ritaContextSources = null,
}) {
  let nativeToolingEnabled = false;
  const selectedRitaAgent =
    await SystemSettings.ritaAgentById(selectedRitaAgentId);

  // If the workspace is in automatic mode, check if the workspace supports native tooling
  // to determine if the agent flow should be used or not.
  if (workspace?.chatMode === "automatic") {
    const ritaCapabilities = await SystemSettings.ritaCapabilities();
    nativeToolingEnabled =
      ritaCapabilities.agent_auto_mode === true &&
      (await Workspace.supportsNativeToolCalling(workspace));
  }

  const agentHandles = WorkspaceAgentInvocation.parseAgents(message);
  if (agentHandles.length > 0 || nativeToolingEnabled || selectedRitaAgent) {
    const selectedRitaAgentSession = selectedRitaAgent
      ? {
          type: "rita_agent",
          ritaAgentId: selectedRitaAgent.id,
          ritaAgentName: selectedRitaAgent.name,
          lifecycle: selectedRitaAgent.lifecycle || "feedback_loop",
        }
      : null;
    const { invocation: newInvocation } = await WorkspaceAgentInvocation.new({
      prompt: message,
      workspace: workspace,
      user: user,
      thread: thread,
    });

    if (!newInvocation) {
      writeResponseChunk(response, {
        id: uuid,
        type: "statusResponse",
        textResponse: `${pluralize(
          "Agent",
          agentHandles.length
        )} ${agentHandles.join(
          ", "
        )} could not be called. Chat will be handled as default chat.`,
        sources: [],
        close: true,
        animate: false,
        error: null,
      });
      return;
    }

    // Cache attachments for the websocket handler to retrieve later
    cacheInvocationAttachments(newInvocation.uuid, attachments);
    cacheInvocationRitaAgent(newInvocation.uuid, selectedRitaAgent);
    if (Array.isArray(ritaContextSources)) {
      cacheInvocationRitaContextSources(
        newInvocation.uuid,
        ritaContextSources
      );
    }

    writeResponseChunk(response, {
      id: uuid,
      type: "agentInitWebsocketConnection",
      textResponse: null,
      sources: [],
      close: false,
      error: null,
      websocketUUID: newInvocation.uuid,
      agentSession: selectedRitaAgentSession,
    });

    // Close HTTP stream-able chunk response method because we will swap to agents now.
    writeResponseChunk(response, {
      id: uuid,
      type: "statusResponse",
      textResponse: selectedRitaAgent
        ? selectedRitaAgentSession?.lifecycle === "one_shot"
          ? `${selectedRitaAgent.name}: Preparing your request.`
          : `${selectedRitaAgent.name}: Connected. Type /exit to exit agent execution loop early.`
        : "@agent: Swapping over to agent chat. Type /exit to exit agent execution loop early.",
      sources: [],
      close: true,
      error: null,
      animate: selectedRitaAgentSession?.lifecycle !== "one_shot",
    });
    return true;
  }

  return false;
}

module.exports = {
  grepAgents,
  getAndClearInvocationAttachments,
  getAndClearInvocationRitaAgent,
  getAndClearInvocationRitaContextSources,
};
