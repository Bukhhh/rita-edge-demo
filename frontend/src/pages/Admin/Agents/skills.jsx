import GenericSkillPanel from "./GenericSkillPanel";
import DefaultSkillPanel from "./DefaultSkillPanel";
import CreateFileSkillPanel from "./CreateFileSkillPanel";
import { Brain, File, ChartBar, FilePlus } from "@phosphor-icons/react";
import RAGImage from "@/media/agents/rag-memory.png";
import SummarizeImage from "@/media/agents/view-summarize.png";
import GenerateChartsImage from "@/media/agents/generate-charts.png";
import GenerateSaveImages from "@/media/agents/generate-save-files.png";

export const getDefaultSkills = (t) => ({
  "rag-memory": {
    title: t("agent.skill.rag.title"),
    description: t("agent.skill.rag.description"),
    component: DefaultSkillPanel,
    icon: Brain,
    image: RAGImage,
    skill: "rag-memory",
  },
  "document-summarizer": {
    title: t("agent.skill.view.title"),
    description: t("agent.skill.view.description"),
    component: DefaultSkillPanel,
    icon: File,
    image: SummarizeImage,
    skill: "document-summarizer",
  },
});

export const getConfigurableSkills = (
  t,
  { createFilesAgentAvailable = true } = {}
) => ({
  ...(createFilesAgentAvailable && {
    "create-files-agent": {
      title: t("agent.skill.createFiles.title"),
      description: t("agent.skill.createFiles.description"),
      component: CreateFileSkillPanel,
      skill: "create-files-agent",
      icon: FilePlus,
      image: GenerateSaveImages,
    },
  }),
  "create-chart": {
    title: t("agent.skill.generate.title"),
    description: t("agent.skill.generate.description"),
    component: GenericSkillPanel,
    skill: "create-chart",
    icon: ChartBar,
    image: GenerateChartsImage,
  },
});

export const getAppIntegrationSkills = () => ({});
