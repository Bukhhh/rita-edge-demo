import { useEffect, useMemo, useState } from "react";
import System from "@/models/system";
import useToolsMenuItems from "../../useToolsMenuItems";
import RitaGraphAgentImage from "@/media/rita-agents/rita-graph-agent.jpg";
import RitaReportAgentImage from "@/media/rita-agents/rita-report-agent.jpg";

export const RITA_SELECTED_AGENT_KEY = "rita_selected_agent_id";
export const RITA_SELECTED_AGENT_EVENT = "rita-selected-agent-changed";

export default function RitaAgentsTab({
  setShowing,
  highlightedIndex = -1,
  registerItemCount,
}) {
  const [agents, setAgents] = useState([]);
  const [selectedAgentId, setSelectedAgentId] = useState(
    window.localStorage.getItem(RITA_SELECTED_AGENT_KEY)
  );

  useEffect(() => {
    let mounted = true;
    System.keys().then((settings) => {
      if (!mounted) return;
      setAgents((settings?.RitaAgents || []).filter((agent) => agent.enabled));
    });
    return () => {
      mounted = false;
    };
  }, []);

  const items = useMemo(() => {
    const connectedAgent = agents.find((agent) => agent.id === selectedAgentId);
    const baseItems = agents.map((agent) => ({
      type: "agent",
      agent,
      label: agent.name,
    }));
    if (connectedAgent) {
      return [
        {
          type: "disconnect",
          label: `Disconnect ${connectedAgent.name}`,
          agent: connectedAgent,
        },
        ...baseItems,
      ];
    }
    return baseItems;
  }, [agents, selectedAgentId]);

  useToolsMenuItems({
    items,
    highlightedIndex,
    registerItemCount,
    onSelect: (item) => {
      if (item.type === "disconnect") {
        window.localStorage.removeItem(RITA_SELECTED_AGENT_KEY);
        setSelectedAgentId(null);
      } else {
        window.localStorage.setItem(RITA_SELECTED_AGENT_KEY, item.agent.id);
        setSelectedAgentId(item.agent.id);
      }
      window.dispatchEvent(new CustomEvent(RITA_SELECTED_AGENT_EVENT));
      setShowing(false);
    },
  });

  if (agents.length === 0) {
    return (
      <div className="text-xs text-zinc-400 light:text-slate-500 px-2 py-3">
        No enabled RITA agents found.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      {items.map((item, index) => {
        const active = item.agent?.id === selectedAgentId;
        const highlighted = index === highlightedIndex;
        const isDisconnect = item.type === "disconnect";
        return (
          <button
            key={`${item.type}-${item.agent.id}`}
            type="button"
            onClick={() => {
              if (isDisconnect) {
                window.localStorage.removeItem(RITA_SELECTED_AGENT_KEY);
                setSelectedAgentId(null);
              } else {
                window.localStorage.setItem(
                  RITA_SELECTED_AGENT_KEY,
                  item.agent.id
                );
                setSelectedAgentId(item.agent.id);
              }
              window.dispatchEvent(new CustomEvent(RITA_SELECTED_AGENT_EVENT));
              setShowing(false);
            }}
            className={`w-full text-left rounded-md px-2 py-2 flex items-center gap-3 transition-colors ${
              highlighted
                ? "bg-zinc-700/70 light:bg-slate-100"
                : "hover:bg-zinc-700/50 light:hover:bg-slate-100"
            }`}
          >
            <RitaAgentAvatar agent={item.agent} />
            <span className="min-w-0 flex-1">
              <span
                className={`block text-sm ${
                  isDisconnect
                    ? "text-red-300 light:text-red-600"
                    : "text-white light:text-slate-800"
                }`}
              >
                {item.label}
              </span>
              {!isDisconnect && (
                <span className="block text-xs text-zinc-400 light:text-slate-500 truncate">
                  {item.agent.description}
                </span>
              )}
            </span>
            {active && !isDisconnect && (
              <span className="text-[10px] text-green-300 light:text-green-600">
                Connected
              </span>
            )}
          </button>
        );
      })}
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
        className="h-8 w-8 rounded-full object-cover shrink-0"
      />
    );
  }

  return (
    <span
      className="h-8 w-8 rounded-full flex items-center justify-center text-white text-[11px] font-bold shrink-0"
      style={{ backgroundColor: agent.color }}
    >
      {agent.icon}
    </span>
  );
}
