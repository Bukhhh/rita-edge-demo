import { useEffect, useMemo, useState } from "react";
import Sidebar from "@/components/SettingsSidebar";
import ContextualSaveBar from "@/components/ContextualSaveBar";
import { FullScreenLoader } from "@/components/Preloader";
import Admin from "@/models/admin";
import showToast from "@/utils/toast";
import { isMobile } from "react-device-detect";
import RitaPdfTemplate from "@/pages/GeneralSettings/Settings/components/RitaPdfTemplate";
import ModalWrapper from "@/components/ModalWrapper";
import { X } from "@phosphor-icons/react";
import RitaGraphAgentImage from "@/media/rita-agents/rita-graph-agent.jpg";
import RitaReportAgentImage from "@/media/rita-agents/rita-report-agent.jpg";

const DEFAULT_RITA_CAPABILITIES = {
  agent_auto_mode: false,
  report_builder: true,
  chart_generator: true,
  pdf_report_generator: true,
  context_visibility: true,
  strict_data_matching: true,
};

const DEFAULT_RITA_PROVIDER_CONTROLS = {
  groq_testing_provider: true,
};

const RITA_CAPABILITY_LABELS = {
  agent_auto_mode: {
    title: "Auto Agent Mode",
    description:
      "Automatically swap normal chats into agent mode when the model supports tools. Keep this off when users should activate agents manually.",
  },
  report_builder: {
    title: "Report Builder",
    description: "Show the guided PDF report request in the chat tools menu.",
  },
  chart_generator: {
    title: "Chart Generator",
    description: "Allow RITA chart generation workflows for users.",
  },
  pdf_report_generator: {
    title: "PDF Report Generator",
    description: "Allow RITA to prepare report outputs as PDF files.",
  },
  context_visibility: {
    title: "Show Context Source",
    description:
      "Show users whether RITA is using uploaded files, workspace documents, typed data, or no context for a request.",
  },
  strict_data_matching: {
    title: "Strict Data Matching",
    description:
      "Reject report or graph generation when the available data does not match the user's requested analysis.",
  },
};

export default function RitaAgents() {
  const [loading, setLoading] = useState(true);
  const [hasChanges, setHasChanges] = useState(false);
  const [agents, setAgents] = useState([]);
  const [capabilities, setCapabilities] = useState(DEFAULT_RITA_CAPABILITIES);
  const [providerControls, setProviderControls] = useState(
    DEFAULT_RITA_PROVIDER_CONTROLS
  );
  const [query, setQuery] = useState("");

  async function loadSettings({ showLoader = false } = {}) {
    if (showLoader) setLoading(true);
    const res = await Admin.systemPreferencesByFields([
      "rita_agents",
      "rita_capabilities",
      "rita_provider_controls",
    ]);
    setAgents(res?.settings?.rita_agents || []);
    setCapabilities({
      ...DEFAULT_RITA_CAPABILITIES,
      ...(res?.settings?.rita_capabilities ?? {}),
    });
    setProviderControls({
      ...DEFAULT_RITA_PROVIDER_CONTROLS,
      ...(res?.settings?.rita_provider_controls ?? {}),
    });
    if (showLoader) setLoading(false);
  }

  useEffect(() => {
    async function fetchInitialSettings() {
      await loadSettings();
      setLoading(false);
    }
    fetchInitialSettings();
  }, []);

  const filteredAgents = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return agents;
    return agents.filter((agent) =>
      `${agent.name} ${agent.description}`.toLowerCase().includes(needle)
    );
  }, [agents, query]);

  function updateAgent(agentId, updates) {
    setAgents((prev) =>
      prev.map((agent) =>
        agent.id === agentId ? { ...agent, ...updates } : agent
      )
    );
    setHasChanges(true);
  }

  function toggleCapability(capability) {
    setCapabilities((prev) => ({
      ...DEFAULT_RITA_CAPABILITIES,
      ...prev,
      [capability]: !(prev?.[capability] ?? true),
    }));
    setHasChanges(true);
  }

  function toggleProviderControl(provider) {
    setProviderControls((prev) => ({
      ...DEFAULT_RITA_PROVIDER_CONTROLS,
      ...prev,
      [provider]: !(prev?.[provider] ?? true),
    }));
    setHasChanges(true);
  }

  async function saveSettings() {
    const { success, error } = await Admin.updateSystemPreferences({
      rita_agents: JSON.stringify(agents),
      rita_capabilities: JSON.stringify(capabilities),
      rita_provider_controls: JSON.stringify(providerControls),
    });

    if (!success) {
      showToast(error || "RITA agent settings failed to save.", "error", {
        clear: true,
      });
      return;
    }

    showToast("RITA agent settings saved successfully.", "success", {
      clear: true,
    });
    setHasChanges(false);
  }

  if (loading) {
    return (
      <div
        style={{ height: isMobile ? "100%" : "calc(100% - 32px)" }}
        className="relative md:ml-[2px] md:mr-[16px] md:my-[16px] md:rounded-[16px] w-full h-full flex justify-center items-center"
      >
        <FullScreenLoader />
      </div>
    );
  }

  return (
    <div className="w-screen h-screen overflow-hidden bg-theme-bg-container flex md:mt-0 mt-6">
      <Sidebar />
      <div
        style={{ height: isMobile ? "100%" : "calc(100% - 32px)" }}
        className="relative md:ml-[2px] md:mr-[16px] md:my-[16px] md:rounded-[16px] bg-theme-bg-secondary w-full h-full overflow-y-scroll"
      >
        <div className="flex flex-col w-full px-4 md:px-8 md:py-8 py-16 max-w-[1400px]">
          <div className="w-full flex flex-col gap-y-1 pb-6 border-white/10 border-b-2">
            <p className="text-lg leading-6 font-bold text-theme-text-primary">
              RITA Agents
            </p>
            <p className="text-xs leading-[18px] font-base text-theme-text-secondary max-w-[760px]">
              Manage RITA agents, feature availability, and report output
              templates from one place.
            </p>
          </div>

          <RitaStatusCards capabilities={capabilities} agents={agents} />
          <CapabilityControls
            capabilities={capabilities}
            onToggle={toggleCapability}
          />
          <TestingProviderControls
            controls={providerControls}
            onToggle={toggleProviderControl}
          />

          <div className="mt-8 flex flex-col md:flex-row gap-3 md:items-center md:justify-between">
            <div>
              <p className="text-sm font-semibold text-theme-text-primary">
                Agent controls
              </p>
              <p className="text-xs text-theme-text-secondary mt-1">
                These are the local RITA agents users can connect in chat.
              </p>
            </div>
            <div className="flex flex-col md:flex-row gap-3 md:items-center">
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search RITA agents"
                className="border-none bg-theme-settings-input-bg text-white placeholder:text-theme-settings-input-placeholder text-sm rounded-lg focus:outline-primary-button active:outline-primary-button outline-none block w-full md:w-[280px] py-2 px-4"
              />
              <div className="text-xs text-theme-text-secondary">
                {agents.filter((agent) => agent.enabled).length}/{agents.length}{" "}
                enabled
              </div>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-1 lg:grid-cols-2 2xl:grid-cols-3 gap-4">
            {filteredAgents.map((agent) => (
              <RitaAgentCard
                key={agent.id}
                agent={agent}
                onUpdate={(updates) => updateAgent(agent.id, updates)}
              />
            ))}
          </div>
        </div>
        <ContextualSaveBar
          showing={hasChanges}
          onSave={saveSettings}
          onCancel={() => {
            setHasChanges(false);
            loadSettings();
          }}
        />
      </div>
    </div>
  );
}

function TestingProviderControls({ controls, onToggle }) {
  const groqEnabled = controls.groq_testing_provider ?? true;

  return (
    <div className="mt-6 flex flex-col gap-3">
      <div>
        <p className="text-sm font-semibold text-theme-text-primary">
          Providers - Testing Only
        </p>
        <p className="text-xs text-theme-text-secondary mt-1">
          Temporary provider access for fast testing. Turn Groq off before a
          fully local deployment.
        </p>
      </div>
      <button
        type="button"
        onClick={() => onToggle("groq_testing_provider")}
        className="w-full lg:max-w-[680px] rounded-lg border border-white/10 hover:bg-theme-bg-primary transition-colors p-4 flex items-center justify-between gap-4 text-left"
      >
        <span className="min-w-0">
          <span className="block text-sm font-semibold text-theme-text-primary">
            Groq provider
          </span>
          <span className="block text-xs text-theme-text-secondary mt-1">
            Show Groq in system, workspace chat, and agent provider selectors
            while testing API output speed.
          </span>
        </span>
        <ToggleSwitch checked={groqEnabled} />
      </button>
    </div>
  );
}

function RitaStatusCards({ capabilities, agents }) {
  const capabilityCount = Object.entries({
    ...DEFAULT_RITA_CAPABILITIES,
    ...capabilities,
  }).filter(([, enabled]) => enabled).length;
  const enabledAgentCount = agents.filter((agent) => agent.enabled).length;

  return (
    <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-3">
      <StatusCard
        label="Enabled agents"
        value={`${enabledAgentCount}/${agents.length}`}
        description="RITA agents available in the chat connector."
      />
      <StatusCard
        label="Enabled capabilities"
        value={`${capabilityCount}/${Object.keys(DEFAULT_RITA_CAPABILITIES).length}`}
        description="High-level RITA features available to users."
      />
      <StatusCard
        label="Agent behavior"
        value={capabilities.agent_auto_mode ? "Auto" : "Manual"}
        description="Controls whether normal chat automatically enters agent mode."
      />
    </div>
  );
}

function CapabilityControls({ capabilities, onToggle }) {
  return (
    <div className="mt-6 flex flex-col gap-3">
      <div>
        <p className="text-sm font-semibold text-theme-text-primary">
          RITA feature controls
        </p>
        <p className="text-xs text-theme-text-secondary mt-1">
          These switches control user-facing RITA features, not the lower-level
          Agent Skills list.
        </p>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {Object.entries(RITA_CAPABILITY_LABELS).map(([key, meta]) => {
          const enabled = capabilities[key] ?? true;
          return (
            <button
              key={key}
              type="button"
              onClick={() => onToggle(key)}
              className="w-full rounded-lg border border-white/10 hover:bg-theme-bg-primary transition-colors p-4 flex items-center justify-between gap-4 text-left"
            >
              <span className="min-w-0">
                <span className="block text-sm font-semibold text-theme-text-primary">
                  {meta.title}
                </span>
                <span className="block text-xs text-theme-text-secondary mt-1">
                  {meta.description}
                </span>
              </span>
              <ToggleSwitch checked={enabled} />
            </button>
          );
        })}
      </div>
    </div>
  );
}

function RitaAgentCard({ agent, onUpdate }) {
  const [showTemplateEditor, setShowTemplateEditor] = useState(false);

  return (
    <div className="rounded-lg border border-white/10 bg-theme-bg-primary p-4 flex flex-col gap-4">
      <div className="flex gap-3">
        <RitaAgentAvatar agent={agent} />
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-theme-text-primary text-sm font-semibold">
                {agent.name}
              </p>
              <p className="text-theme-text-secondary text-xs mt-1">
                {agent.description}
              </p>
            </div>
            <button
              type="button"
              onClick={() => onUpdate({ enabled: !agent.enabled })}
              className="shrink-0"
              title={agent.enabled ? "Disable agent" : "Enable agent"}
            >
              <ToggleSwitch checked={agent.enabled} />
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <ReadOnlyField label="Version" value={agent.version} />
        <ReadOnlyField label="Default output" value={agent.default_output} />
        <ReadOnlyField
          label="Lifecycle"
          value={
            agent.lifecycle === "one_shot" ? "One-shot task" : "Feedback loop"
          }
        />
      </div>

      {agent.id === "rita-report-agent" && (
        <button
          type="button"
          onClick={() => setShowTemplateEditor(true)}
          className="w-fit rounded-lg border border-white/10 px-3 py-2 text-xs font-semibold text-theme-text-primary hover:bg-white/10 transition-colors"
        >
          PDF Template Editor
        </button>
      )}

      <label className="flex flex-col gap-y-2">
        <span className="text-xs font-medium text-theme-text-secondary">
          Agent instructions
        </span>
        <textarea
          value={agent.instructions}
          onChange={(e) => onUpdate({ instructions: e.target.value })}
          rows={5}
          className="border-none bg-theme-settings-input-bg text-white placeholder:text-theme-settings-input-placeholder text-sm rounded-lg focus:outline-primary-button active:outline-primary-button outline-none block w-full py-2 px-4 resize-none"
        />
      </label>

      <div>
        <p className="text-xs font-medium text-theme-text-secondary mb-2">
          Allowed tools
        </p>
        <div className="flex flex-wrap gap-2">
          {agent.tools.map((tool) => (
            <span
              key={tool}
              className="rounded-full bg-white/10 text-theme-text-primary text-xs px-3 py-1"
            >
              {tool}
            </span>
          ))}
        </div>
      </div>

      <PdfTemplateEditorModal
        isOpen={showTemplateEditor}
        onClose={() => setShowTemplateEditor(false)}
      />
    </div>
  );
}

function RitaAgentAvatar({ agent }) {
  const image = {
    "rita-report-agent": RitaReportAgentImage,
    "rita-graph-agent": RitaGraphAgentImage,
  }[agent?.id];
  if (image) {
    return (
      <img
        src={image}
        alt={agent.name}
        className="h-12 w-12 rounded-full object-cover shrink-0"
      />
    );
  }

  return (
    <div
      className="h-12 w-12 rounded-full flex items-center justify-center text-white text-sm font-bold shrink-0"
      style={{ backgroundColor: agent.color }}
    >
      {agent.icon}
    </div>
  );
}

function PdfTemplateEditorModal({ isOpen, onClose }) {
  return (
    <ModalWrapper isOpen={isOpen}>
      <div className="w-[min(1100px,calc(100vw-32px))] max-h-[calc(100vh-48px)] overflow-y-auto bg-theme-bg-sidebar rounded-lg border border-white/10 shadow-lg p-5">
        <div className="flex items-start justify-between gap-4 pb-4 border-b border-white/10">
          <div>
            <p className="text-lg font-semibold text-theme-text-primary">
              PDF Template Editor
            </p>
            <p className="text-xs text-theme-text-secondary mt-1">
              Adjust the chart PDF layout used by RITA - Report Agent.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-theme-text-secondary hover:text-theme-text-primary transition-colors"
          >
            <X size={22} weight="bold" />
          </button>
        </div>
        <RitaPdfTemplate />
      </div>
    </ModalWrapper>
  );
}

function StatusCard({ label, value, description }) {
  return (
    <div className="rounded-lg border border-white/10 bg-theme-bg-primary p-4">
      <p className="text-xs uppercase text-theme-text-secondary">{label}</p>
      <p className="text-xl font-semibold text-theme-text-primary mt-2">
        {value}
      </p>
      <p className="text-xs text-theme-text-secondary mt-2">{description}</p>
    </div>
  );
}

function ToggleSwitch({ checked = false }) {
  return (
    <span
      className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${
        checked ? "bg-[#48d783]" : "bg-white/20 light:bg-slate-300"
      }`}
    >
      <span
        className={`inline-block h-4 w-4 rounded-full bg-white shadow-sm transition-transform ${
          checked ? "translate-x-4" : "translate-x-0.5"
        }`}
      />
    </span>
  );
}

function ReadOnlyField({ label, value }) {
  return (
    <div className="rounded-lg bg-theme-settings-input-bg px-3 py-2">
      <p className="text-[10px] uppercase text-theme-text-secondary">{label}</p>
      <p className="text-xs text-theme-text-primary mt-1">{value}</p>
    </div>
  );
}
