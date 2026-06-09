import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import Sidebar from "@/components/SettingsSidebar";
import { isMobile } from "react-device-detect";
import Admin from "@/models/admin";
import System from "@/models/system";
import showToast from "@/utils/toast";
import { CaretRight, Robot } from "@phosphor-icons/react";
import ContextualSaveBar from "@/components/ContextualSaveBar";
import { FullScreenLoader } from "@/components/Preloader";
import { getDefaultSkills, getConfigurableSkills } from "./skills.jsx";
import AgentSkillSettings from "./AgentSkillSettings";

export default function AdminAgents() {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [hasChanges, setHasChanges] = useState(false);
  const [selectedSkill, setSelectedSkill] = useState("");
  const [agentSkills, setAgentSkills] = useState([]);
  const [disabledAgentSkills, setDisabledAgentSkills] = useState([]);
  const [createFilesAgentAvailable, setCreateFilesAgentAvailable] =
    useState(false);

  const defaultSkills = getDefaultSkills(t);
  const configurableSkills = getConfigurableSkills(t, {
    createFilesAgentAvailable,
  });

  const allSkills = useMemo(
    () => ({
      ...defaultSkills,
      ...configurableSkills,
    }),
    [defaultSkills, configurableSkills]
  );

  useEffect(() => {
    async function fetchSettings() {
      const [_preferences, createFilesAvailable] = await Promise.all([
        Admin.systemPreferencesByFields([
          "disabled_agent_skills",
          "default_agent_skills",
        ]),
        System.isCreateFilesAgentAvailable(),
      ]);

      setAgentSkills(_preferences?.settings?.default_agent_skills ?? []);
      setDisabledAgentSkills(
        _preferences?.settings?.disabled_agent_skills ?? []
      );
      setCreateFilesAgentAvailable(createFilesAvailable);
      setLoading(false);
    }
    fetchSettings();
  }, []);

  function toggleDefaultSkill(skillName) {
    setDisabledAgentSkills((prev) =>
      prev.includes(skillName)
        ? prev.filter((name) => name !== skillName)
        : [...prev, skillName]
    );
    setHasChanges(true);
  }

  function toggleAgentSkill(skillName) {
    setAgentSkills((prev) =>
      prev.includes(skillName)
        ? prev.filter((name) => name !== skillName)
        : [...prev, skillName]
    );
    setHasChanges(true);
  }

  function isSkillEnabled(skillName, isDefault = false) {
    if (isDefault) return !disabledAgentSkills.includes(skillName);
    return agentSkills.includes(skillName);
  }

  function renderSelectedSkillPanel() {
    if (!selectedSkill || !allSkills[selectedSkill]) return <SkillEmptyState />;

    const skill = allSkills[selectedSkill];
    const isDefault = Object.keys(defaultSkills).includes(selectedSkill);
    const Panel = skill.component;

    return (
      <Panel
        {...skill}
        enabled={isSkillEnabled(selectedSkill, isDefault)}
        toggleSkill={isDefault ? toggleDefaultSkill : toggleAgentSkill}
        setHasChanges={setHasChanges}
        hasChanges={hasChanges}
      />
    );
  }

  async function handleSubmit(e) {
    e?.preventDefault?.();
    const { success, error } = await Admin.updateSystemPreferences({
      default_agent_skills: agentSkills.join(","),
      disabled_agent_skills: disabledAgentSkills.join(","),
    });

    if (!success) {
      showToast(error || "RITA Skills failed to save.", "error", {
        clear: true,
      });
      return;
    }

    showToast("RITA Skills saved successfully.", "success", { clear: true });
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
    <div
      id="workspace-agent-settings-container"
      className="w-screen h-screen overflow-hidden bg-theme-bg-container flex md:mt-0 mt-6"
    >
      <Sidebar />
      <div
        style={{ height: isMobile ? "100%" : "calc(100% - 32px)" }}
        className="relative md:ml-[2px] md:mr-[16px] md:my-[16px] md:rounded-[16px] w-full h-full flex"
      >
        <form onSubmit={handleSubmit} className="flex-1 flex gap-x-6 p-4 mt-10">
          <div className="flex flex-col min-w-[360px] h-[calc(100vh-90px)]">
            <div className="flex-none flex justify-between items-center mb-4">
              <div className="text-theme-text-primary flex items-center gap-x-2">
                <Robot size={24} />
                <p className="text-lg font-medium">Agent Skills</p>
              </div>
              <AgentSkillSettings />
            </div>

            <div className="flex-1 overflow-y-auto pr-2 pb-4">
              <div className="space-y-5">
                <SkillList
                  skills={defaultSkills}
                  selectedSkill={selectedSkill}
                  onSelect={setSelectedSkill}
                  isEnabled={(skill) => isSkillEnabled(skill, true)}
                />
                <SkillList
                  skills={configurableSkills}
                  selectedSkill={selectedSkill}
                  onSelect={setSelectedSkill}
                  isEnabled={(skill) => isSkillEnabled(skill)}
                />
              </div>
            </div>
          </div>

          <div className="flex-[2] flex flex-col gap-y-[18px]">
            <div className="bg-theme-bg-secondary text-white rounded-xl flex-1 p-4 overflow-y-scroll overflow-x-visible no-scroll">
              {renderSelectedSkillPanel()}
            </div>
          </div>
        </form>

        <ContextualSaveBar
          showing={hasChanges}
          onSave={handleSubmit}
          onCancel={() => window.location.reload()}
        />
      </div>
    </div>
  );
}

function SkillList({ skills = {}, selectedSkill = "", onSelect, isEnabled }) {
  if (Object.keys(skills).length === 0) return null;

  return (
    <div className="bg-theme-bg-secondary text-white rounded-xl overflow-hidden">
      {Object.entries(skills).map(([skill, settings], index) => (
        <button
          key={skill}
          type="button"
          className={`w-full py-3 px-4 flex items-center justify-between text-left ${
            index !== Object.keys(skills).length - 1
              ? "border-b border-white/10"
              : ""
          } cursor-pointer transition-all duration-300 hover:bg-theme-bg-primary ${
            selectedSkill === skill
              ? "bg-white/10 light:bg-theme-bg-sidebar"
              : ""
          }`}
          onClick={() => onSelect(skill)}
        >
          <div className="flex items-center gap-x-2 min-w-0">
            {settings.icon && <settings.icon size={16} />}
            <div className="text-sm font-light truncate">{settings.title}</div>
          </div>
          <div className="flex items-center gap-x-2">
            <div className="text-sm text-theme-text-secondary font-medium">
              {isEnabled(skill) ? "On" : "Off"}
            </div>
            <CaretRight
              size={14}
              weight="bold"
              className="text-theme-text-secondary"
            />
          </div>
        </button>
      ))}
    </div>
  );
}

function SkillEmptyState() {
  return (
    <div className="h-full w-full flex items-center justify-center">
      <div className="flex flex-col items-center justify-center text-center gap-y-3 text-theme-text-secondary">
        <Robot size={42} />
        <p className="text-xl font-semibold">
          Select an Agent Skill, Agent Flow, or MCP Server
        </p>
      </div>
    </div>
  );
}
