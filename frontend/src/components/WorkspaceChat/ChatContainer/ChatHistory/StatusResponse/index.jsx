import React, { useState } from "react";
import { CaretDown } from "@phosphor-icons/react";

import AgentAnimation from "@/media/animations/agent-animation.webm";
import AgentStatic from "@/media/animations/agent-static.png";
import useUser from "@/hooks/useUser";

export default function StatusResponse({ messages = [], isThinking = false }) {
  const { user } = useUser();
  const isAdmin = !user?.role || user.role === "admin";
  const [isExpanded, setIsExpanded] = useState(false);
  const currentThought = messages[messages.length - 1];
  const previousThoughts = messages.slice(0, -1);

  if (!isAdmin) {
    if (!isThinking) return null;
    return <RitaAgentProgressMessage thought={currentThought?.content} />;
  }

  function handleExpandClick() {
    if (!previousThoughts.length > 0) return;
    setIsExpanded(!isExpanded);
  }

  return (
    <div className="flex justify-center w-full pr-4">
      <div className="w-full flex flex-col">
        <div className="w-full">
          <div
            onClick={handleExpandClick}
            style={{
              transition: "all 0.1s ease-in-out",
              borderRadius: "16px",
            }}
            className="relative bg-zinc-800 light:bg-slate-100 p-4"
          >
            <div className="absolute top-4 left-4 w-[18px] h-[18px]">
              {isThinking ? (
                <video
                  autoPlay
                  loop
                  muted
                  playsInline
                  className="w-[18px] h-[18px] scale-[165%] transition-opacity duration-200 light:invert light:opacity-50"
                  data-tooltip-id="agent-thinking"
                  data-tooltip-content="Agent is thinking..."
                  aria-label="Agent is thinking..."
                >
                  <source src={AgentAnimation} type="video/webm" />
                </video>
              ) : (
                <img
                  src={AgentStatic}
                  alt="Agent complete"
                  className="w-[18px] h-[18px] transition-opacity duration-200 light:invert light:opacity-50"
                  data-tooltip-id="agent-thinking"
                  data-tooltip-content="Agent has finished thinking"
                  aria-label="Agent has finished thinking"
                />
              )}
            </div>
            {previousThoughts?.length > 0 && (
              <button
                onClick={handleExpandClick}
                className="absolute top-4 right-4 border-none text-zinc-200 light:text-slate-800 transition-colors"
                data-tooltip-id="expand-cot"
                data-tooltip-content={
                  isExpanded ? "Hide thought chain" : "Show thought chain"
                }
                aria-label={
                  isExpanded ? "Hide thought chain" : "Show thought chain"
                }
              >
                <CaretDown
                  className={`w-4 h-4 transform transition-transform duration-200 ${isExpanded ? "rotate-180" : ""}`}
                />
              </button>
            )}
            <div
              className={`ml-[28px] mr-[26px] transition-[max-height] duration-300 ease-in-out origin-top ${isExpanded ? "" : "overflow-hidden max-h-[18px]"}`}
            >
              <div className="text-zinc-200 light:text-slate-800 font-mono text-sm leading-[18px]">
                {!isExpanded ? (
                  <span className="block w-full truncate">
                    {currentThought.content}
                  </span>
                ) : (
                  <>
                    {previousThoughts.map((thought, index) => (
                      <div
                        key={`cot-${thought.uuid || index}`}
                        className="mb-2"
                      >
                        {thought.content}
                      </div>
                    ))}
                    <div>{currentThought.content}</div>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function RitaAgentProgressMessage({ thought = "" }) {
  return (
    <div className="flex justify-start w-full pr-4">
      <div className="rounded-2xl bg-zinc-800 light:bg-slate-100 px-4 py-3 flex items-center gap-3 text-zinc-200 light:text-slate-700">
        <video
          autoPlay
          loop
          muted
          playsInline
          className="h-6 w-6 scale-[135%] light:invert light:opacity-60"
        >
          <source src={AgentAnimation} type="video/webm" />
        </video>
        <div className="flex flex-col">
          <span className="text-sm font-medium">RITA is working on it</span>
          <span className="text-xs text-zinc-400 light:text-slate-500">
            {progressLabelFromThought(thought)}
          </span>
        </div>
      </div>
    </div>
  );
}

function progressLabelFromThought(thought = "") {
  const text = thought.toLowerCase();
  if (
    text.includes("attached") ||
    text.includes("document") ||
    text.includes("context") ||
    text.includes("rag")
  ) {
    return "Reading the uploaded data...";
  }
  if (
    text.includes("chart") ||
    text.includes("matplotlib") ||
    text.includes("graph")
  ) {
    return "Building the chart...";
  }
  if (
    text.includes("pdf") ||
    text.includes("docx") ||
    text.includes("file") ||
    text.includes("report")
  ) {
    return "Preparing the report preview...";
  }
  if (text.includes("tool")) return "Running the selected RITA skill...";
  return "Analysing your request...";
}
