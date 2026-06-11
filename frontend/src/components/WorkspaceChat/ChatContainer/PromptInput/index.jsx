import { useState, useRef, useEffect } from "react";
import debounce from "lodash.debounce";
import {
  ArrowUp,
  At,
  ChartBar,
  ChartLine,
  ChartPie,
  X,
  FileDoc,
  FilePdf,
  ImageSquare,
  Table,
} from "@phosphor-icons/react";
import StopGenerationButton from "./StopGenerationButton";
import SpeechToText from "./SpeechToText";
import { Tooltip } from "react-tooltip";
import AttachmentManager from "./Attachments";
import AttachItem from "./AttachItem";
import { PASTE_ATTACHMENT_EVENT } from "../DnDWrapper";
import useTextSize from "@/hooks/useTextSize";
import { useTranslation } from "react-i18next";
import Appearance from "@/models/appearance";
import System from "@/models/system";
import usePromptInputStorage from "@/hooks/usePromptInputStorage";
import ToolsMenu, { TOOLS_MENU_KEYBOARD_EVENT } from "./ToolsMenu";
import {
  RITA_SELECTED_AGENT_EVENT,
  RITA_SELECTED_AGENT_KEY,
} from "./ToolsMenu/Tabs/RitaAgents";
import { useSearchParams } from "react-router-dom";
import { useIsAgentSessionActive } from "@/utils/chat/agent";
import RitaGraphAgentImage from "@/media/rita-agents/rita-graph-agent.jpg";
import RitaReportAgentImage from "@/media/rita-agents/rita-report-agent.jpg";

export const PROMPT_INPUT_ID = "primary-prompt-input";
export const PROMPT_INPUT_EVENT = "set_prompt_input";
const MAX_EDIT_STACK_SIZE = 100;

/**
 * @param {Workspace} props.workspace - workspace object
 * @param {function} props.submit - form submit handler
 * @param {boolean} props.isStreaming - disables input while streaming response
 * @param {function} props.sendCommand - handler for slash commands and agent mentions
 * @param {Array} [props.attachments] - file attachments array
 * @param {boolean} [props.centered] - renders in centered layout mode (for home page)
 * @param {string} [props.workspaceSlug] - workspace slug for home page context
 * @param {string} [props.threadSlug] - thread slug for home page context
 */
export default function PromptInput({
  workspace = {},
  submit,
  isStreaming,
  sendCommand,
  attachments = [],
  centered = false,
  workspaceSlug = null,
  threadSlug = null,
}) {
  const { t } = useTranslation();
  const { showAgentCommand = true } = workspace ?? {};
  const { isDisabled } = useIsDisabled(attachments);
  const agentSessionActive = useIsAgentSessionActive();
  const [promptInput, setPromptInput] = useState("");
  const [showTools, setShowTools] = useState(false);
  const [selectedRitaAgent, setSelectedRitaAgent] = useState(null);
  const autoOpenedToolsRef = useRef(false);
  const toolsHighlightRef = useRef(-1);
  const formRef = useRef(null);
  const textareaRef = useRef(null);
  const [_, setFocused] = useState(false);
  const undoStack = useRef([]);
  const redoStack = useRef([]);
  const { textSizeClass } = useTextSize();
  const [searchParams] = useSearchParams();

  function disconnectRitaAgent() {
    window.localStorage.removeItem(RITA_SELECTED_AGENT_KEY);
    window.dispatchEvent(new CustomEvent(RITA_SELECTED_AGENT_EVENT));
    textareaRef.current?.focus();
  }

  async function syncSelectedRitaAgent() {
    const selectedId = window.localStorage.getItem(RITA_SELECTED_AGENT_KEY);
    if (!selectedId) {
      setSelectedRitaAgent(null);
      return;
    }
    const settings = await System.keys();
    const agent = (settings?.RitaAgents || []).find(
      (agent) => agent.id === selectedId && agent.enabled
    );
    setSelectedRitaAgent(agent || null);
  }

  useEffect(() => {
    syncSelectedRitaAgent();
    window.addEventListener(RITA_SELECTED_AGENT_EVENT, syncSelectedRitaAgent);
    return () =>
      window.removeEventListener(
        RITA_SELECTED_AGENT_EVENT,
        syncSelectedRitaAgent
      );
  }, []);

  // Synchronizes prompt input value with localStorage, scoped to the current thread.
  usePromptInputStorage({
    promptInput,
    setPromptInput,
  });

  /*
   * @checklist-item
   * If the URL has the agent param, open the agent menu for the user
   * automatically when the component mounts.
   */
  useEffect(() => {
    if (searchParams.get("action") === "set-agent-chat") {
      sendCommand({ text: "@agent " });
      textareaRef.current?.focus();
    }
  }, [textareaRef.current]);

  /**
   * To prevent too many re-renders we remotely listen for updates from the parent
   * via an event cycle. Otherwise, using message as a prop leads to a re-render every
   * change on the input.
   * @param {{detail: {messageContent: string, writeMode: 'replace' | 'append'}}} e
   */
  function handlePromptUpdate(e) {
    const { messageContent, writeMode = "replace" } = e?.detail ?? {};
    if (writeMode === "append") setPromptInput((prev) => prev + messageContent);
    else if (writeMode === "prepend")
      setPromptInput((prev) => messageContent + " " + prev);
    else setPromptInput(messageContent ?? "");
  }

  useEffect(() => {
    if (!!window)
      window.addEventListener(PROMPT_INPUT_EVENT, handlePromptUpdate);
    return () =>
      window?.removeEventListener(PROMPT_INPUT_EVENT, handlePromptUpdate);
  }, []);

  useEffect(() => {
    if (!isStreaming && textareaRef.current) textareaRef.current.focus();
    resetTextAreaHeight();
  }, [isStreaming]);

  /**
   * Save the current state before changes
   * @param {number} adjustment
   */
  function saveCurrentState(adjustment = 0) {
    if (undoStack.current.length >= MAX_EDIT_STACK_SIZE)
      undoStack.current.shift();
    undoStack.current.push({
      value: promptInput,
      cursorPositionStart: textareaRef.current.selectionStart + adjustment,
      cursorPositionEnd: textareaRef.current.selectionEnd + adjustment,
    });
  }
  const debouncedSaveState = debounce(saveCurrentState, 250);

  function handleSubmit(e) {
    // Ignore submits from portaled modals (slash command preset forms)
    if (e.target !== e.currentTarget) return;
    setFocused(false);
    setShowTools(false);
    submit(e, promptInput);
  }

  function resetTextAreaHeight() {
    if (!textareaRef.current) return;
    textareaRef.current.style.height = "auto";
  }

  /**
   * Capture enter key press to handle submission, redo, or undo
   * via keyboard shortcuts
   * @param {KeyboardEvent} event
   */
  function captureEnterOrUndo(event) {
    // Forward keyboard events to the ToolsMenu when open
    if (showTools) {
      if (
        ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.key)
      ) {
        event.preventDefault();
        window.dispatchEvent(
          new CustomEvent(TOOLS_MENU_KEYBOARD_EVENT, {
            detail: { key: event.key },
          })
        );
        return;
      }
      // When an item is highlighted via arrow keys, Enter selects it.
      // Otherwise, Enter falls through to submit the form normally.
      if (event.key === "Enter" && toolsHighlightRef.current >= 0) {
        event.preventDefault();
        window.dispatchEvent(
          new CustomEvent(TOOLS_MENU_KEYBOARD_EVENT, {
            detail: { key: "Enter" },
          })
        );
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        setShowTools(false);
        textareaRef.current?.focus();
        return;
      }
    }

    // "/" toggles the Tools menu only when the input is empty
    if (
      event.key === "/" &&
      !event.ctrlKey &&
      !event.metaKey &&
      promptInput.trim() === ""
    ) {
      setShowTools((prev) => {
        autoOpenedToolsRef.current = !prev;
        return !prev;
      });
      return;
    }

    // Is simple enter key press w/o shift key
    if (event.keyCode === 13 && !event.shiftKey) {
      event.preventDefault();
      if (isStreaming || isDisabled) return; // Prevent submission if streaming or disabled
      setShowTools(false);
      return submit(event, promptInput);
    }

    // Is undo with Ctrl+Z or Cmd+Z + Shift key = Redo
    if (
      (event.ctrlKey || event.metaKey) &&
      event.key === "z" &&
      event.shiftKey
    ) {
      event.preventDefault();
      if (redoStack.current.length === 0) return;

      const nextState = redoStack.current.pop();
      if (!nextState) return;

      undoStack.current.push({
        value: promptInput,
        cursorPositionStart: textareaRef.current.selectionStart,
        cursorPositionEnd: textareaRef.current.selectionEnd,
      });
      setPromptInput(nextState.value);
      setTimeout(() => {
        textareaRef.current.setSelectionRange(
          nextState.cursorPositionStart,
          nextState.cursorPositionEnd
        );
      }, 0);
    }

    // Undo with Ctrl+Z or Cmd+Z
    if (
      (event.ctrlKey || event.metaKey) &&
      event.key === "z" &&
      !event.shiftKey
    ) {
      if (undoStack.current.length === 0) return;
      const lastState = undoStack.current.pop();
      if (!lastState) return;

      redoStack.current.push({
        value: promptInput,
        cursorPositionStart: textareaRef.current.selectionStart,
        cursorPositionEnd: textareaRef.current.selectionEnd,
      });
      setPromptInput(lastState.value);
      setTimeout(() => {
        textareaRef.current.setSelectionRange(
          lastState.cursorPositionStart,
          lastState.cursorPositionEnd
        );
      }, 0);
    }
  }

  function adjustTextArea(event) {
    const element = event.target;
    element.style.height = "auto";
    element.style.height = `${element.scrollHeight}px`;
  }

  function handlePasteEvent(e) {
    e.preventDefault();
    if (e.clipboardData.items.length === 0) return false;

    // paste any clipboard items that are images.
    for (const item of e.clipboardData.items) {
      if (item.type.startsWith("image/")) {
        const file = item.getAsFile();
        window.dispatchEvent(
          new CustomEvent(PASTE_ATTACHMENT_EVENT, {
            detail: { files: [file] },
          })
        );
        continue;
      }

      // handle files specifically that are not images as uploads
      if (item.kind === "file") {
        const file = item.getAsFile();
        window.dispatchEvent(
          new CustomEvent(PASTE_ATTACHMENT_EVENT, {
            detail: { files: [file] },
          })
        );
        continue;
      }
    }

    const pasteText = e.clipboardData.getData("text/plain");
    if (pasteText) {
      const textarea = textareaRef.current;
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const newPromptInput =
        promptInput.substring(0, start) +
        pasteText +
        promptInput.substring(end);
      setPromptInput(newPromptInput);

      // Set the cursor position after the pasted text
      // we need to use setTimeout to prevent the cursor from being set to the end of the text
      setTimeout(() => {
        textarea.selectionStart = textarea.selectionEnd =
          start + pasteText.length;
        adjustTextArea({ target: textarea });
      }, 0);
    }
    return;
  }

  function handleChange(e) {
    debouncedSaveState(-1);
    adjustTextArea(e);
    const value = e.target.value;
    setPromptInput(value);

    // Auto-dismiss the tools menu when the "/" that opened it is modified
    if (autoOpenedToolsRef.current && showTools && value !== "/") {
      setShowTools(false);
      autoOpenedToolsRef.current = false;
    }
  }

  return (
    <div
      className={
        centered
          ? "w-full relative flex justify-center items-center"
          : "w-full fixed md:absolute bottom-0 left-0 z-10 flex justify-center items-center pwa:pb-5"
      }
    >
      <form
        onSubmit={handleSubmit}
        className={
          centered
            ? "flex flex-col gap-y-1 rounded-t-lg w-full items-center"
            : "flex flex-col gap-y-1 rounded-t-lg md:w-full w-full mx-auto max-w-[750px] items-center"
        }
      >
        <div
          className={`flex items-center rounded-lg md:w-full ${centered ? "mb-0" : "mb-4"}`}
        >
          <div className="relative w-[95vw] md:w-[750px]">
            <ToolsMenu
              workspace={workspace}
              showing={showTools}
              setShowing={setShowTools}
              sendCommand={sendCommand}
              promptRef={textareaRef}
              centered={centered}
              highlightedIndexRef={toolsHighlightRef}
            />
            <RitaAgentBuilderPanel
              agent={selectedRitaAgent}
              promptInput={promptInput}
              setPromptInput={setPromptInput}
              attachments={attachments}
              sendCommand={sendCommand}
              textareaRef={textareaRef}
              onDisconnect={disconnectRitaAgent}
              disabled={isStreaming || isDisabled}
            />
            <div className="bg-zinc-800 light:bg-white light:border light:border-slate-300 rounded-[20px] pwa:rounded-3xl flex flex-col px-5 overflow-hidden">
              <AttachmentManager attachments={attachments} />
              <div className="flex items-center">
                <textarea
                  id={PROMPT_INPUT_ID}
                  ref={textareaRef}
                  onChange={handleChange}
                  onKeyDown={captureEnterOrUndo}
                  onPaste={(e) => {
                    saveCurrentState();
                    handlePasteEvent(e);
                  }}
                  required={true}
                  onFocus={() => setFocused(true)}
                  onBlur={(e) => {
                    setFocused(false);
                    adjustTextArea(e);
                  }}
                  value={promptInput}
                  spellCheck={Appearance.get("enableSpellCheck")}
                  className={`border-none cursor-text max-h-[50vh] md:max-h-[350px] md:min-h-[40px] pt-[20px] w-full leading-5 text-white light:text-slate-600 bg-transparent placeholder:text-white/60 light:placeholder:text-slate-400 resize-none active:outline-none focus:outline-none flex-grow pwa:!text-[16px] ${textSizeClass}`}
                  placeholder={t("chat_window.send_message")}
                />
              </div>
              <div className="flex justify-between items-center pt-3.5 pb-3">
                <div className="flex items-center gap-x-0.25">
                  <div className="flex items-center gap-x-1">
                    <AttachItem
                      workspaceSlug={workspaceSlug}
                      workspaceThreadSlug={threadSlug}
                    />
                    <SelectedRitaAgentBadge
                      agent={selectedRitaAgent}
                      onDisconnect={disconnectRitaAgent}
                    />
                    <AgentSessionButton
                      sendCommand={sendCommand}
                      promptInput={promptInput}
                      textareaRef={textareaRef}
                      visible={!agentSessionActive && showAgentCommand}
                    />
                  </div>
                  <ToolsButton
                    showTools={showTools}
                    setShowTools={setShowTools}
                    textareaRef={textareaRef}
                    autoOpenedToolsRef={autoOpenedToolsRef}
                  />
                </div>
                <div className="flex gap-x-2 items-center">
                  <SpeechToText sendCommand={sendCommand} />
                  {isStreaming ? (
                    <StopGenerationButton />
                  ) : (
                    <SendPromptButton
                      formRef={formRef}
                      promptInput={promptInput}
                      isDisabled={isDisabled}
                    />
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </form>
    </div>
  );
}

const ANALYSIS_OPTIONS = [
  "sales trend",
  "top performing items",
  "regional breakdown",
  "category comparison",
  "monthly summary",
  "anomalies or outliers",
];

const REPORT_CHART_OPTIONS = [
  {
    label: "Auto choose",
    value: "auto choose the best chart type",
    icon: Table,
  },
  { label: "Bar", value: "bar chart", icon: ChartBar },
  { label: "Horizontal bar", value: "horizontal_bar chart", icon: ChartBar },
  { label: "Stacked bar", value: "stacked_bar chart", icon: ChartBar },
  { label: "Line", value: "line chart", icon: ChartLine },
  { label: "Area", value: "area chart", icon: ChartLine },
  { label: "Pie", value: "pie chart", icon: ChartPie },
  { label: "Donut", value: "donut chart", icon: ChartPie },
  { label: "Histogram", value: "histogram", icon: ChartBar },
  { label: "Scatter", value: "scatter plot", icon: ChartLine },
  { label: "Table", value: "table only", icon: Table },
];
const REPORT_MAX_CHARTS = 3;

const GRAPH_CHART_OPTIONS = [
  { label: "Auto", value: "auto choose the best single chart", icon: Table },
  { label: "Bar", value: "bar chart", icon: ChartBar },
  { label: "Horizontal bar", value: "horizontal_bar chart", icon: ChartBar },
  { label: "Stacked bar", value: "stacked_bar chart", icon: ChartBar },
  { label: "Line", value: "line chart", icon: ChartLine },
  { label: "Area", value: "area chart", icon: ChartLine },
  { label: "Pie", value: "pie chart", icon: ChartPie },
  { label: "Donut", value: "donut chart", icon: ChartPie },
  { label: "Histogram", value: "histogram", icon: ChartBar },
  { label: "Scatter", value: "scatter plot", icon: ChartLine },
];

function RitaAgentBuilderPanel({
  agent = null,
  promptInput = "",
  setPromptInput,
  attachments = [],
  sendCommand,
  textareaRef,
  onDisconnect,
  disabled = false,
}) {
  const [dismissedBuilderAgentId, setDismissedBuilderAgentId] = useState(null);

  useEffect(() => {
    setDismissedBuilderAgentId(null);
  }, [agent?.id]);

  if (!agent) return null;
  if (dismissedBuilderAgentId === agent.id) return null;
  if (agent.id === "rita-report-agent") {
    return (
      <ReportAgentBuilder
        promptInput={promptInput}
        setPromptInput={setPromptInput}
        attachments={attachments}
        sendCommand={sendCommand}
        textareaRef={textareaRef}
        onDisconnect={onDisconnect}
        disabled={disabled}
        onSubmitted={() => setDismissedBuilderAgentId(agent.id)}
      />
    );
  }
  if (agent.id === "rita-graph-agent") {
    return (
      <GraphAgentBuilder
        promptInput={promptInput}
        setPromptInput={setPromptInput}
        attachments={attachments}
        sendCommand={sendCommand}
        textareaRef={textareaRef}
        onDisconnect={onDisconnect}
        disabled={disabled}
        onSubmitted={() => setDismissedBuilderAgentId(agent.id)}
      />
    );
  }
  return null;
}

function ReportAgentBuilder({
  promptInput,
  setPromptInput,
  attachments = [],
  sendCommand,
  textareaRef,
  onDisconnect,
  onSubmitted,
  disabled = false,
}) {
  const [analysis, setAnalysis] = useState(() => new Set(["sales trend"]));
  const [chartTypes, setChartTypes] = useState(
    () => new Set(["auto choose the best chart type"])
  );
  const [output, setOutput] = useState("pdf");
  const [builderError, setBuilderError] = useState(null);

  function toggleAnalysis(value) {
    setAnalysis((prev) => {
      const next = new Set(prev);
      if (next.has(value)) {
        if (next.size === 1) return next;
        next.delete(value);
      } else {
        next.add(value);
      }
      return next;
    });
  }

  function toggleChartType(value) {
    setChartTypes((prev) => {
      const next = new Set(prev);
      const isAuto = value === "auto choose the best chart type";

      if (isAuto) return new Set([value]);
      next.delete("auto choose the best chart type");

      if (next.has(value)) {
        if (next.size === 1) return next;
        next.delete(value);
      } else if (next.size < REPORT_MAX_CHARTS) {
        next.add(value);
      }

      return next.size ? next : new Set(["auto choose the best chart type"]);
    });
  }

  function generateReport() {
    if (disabled) return;
    const fileBlocker = getRitaBuilderFileBlocker(attachments);
    if (fileBlocker) {
      setBuilderError(fileBlocker);
      return;
    }
    setBuilderError(null);
    const extra = promptInput.trim();
    const prompt = buildReportAgentPrompt({
      analysis: [...analysis],
      chartTypes: [...chartTypes],
      output,
      extra,
    });
    sendCommand({
      text: prompt,
      displayText: `Generate ${output.toUpperCase()} report with ${[...chartTypes].length} chart option(s): ${[...analysis].join(", ")}`,
      selectedRitaAgentId: "rita-report-agent",
      autoSubmit: true,
    });
    setPromptInput("");
    onSubmitted?.();
    textareaRef.current?.focus();
  }

  return (
    <BuilderPanel title="RITA Report Builder" onClose={onDisconnect}>
      <BuilderHint>
        Upload your PDF/document using the attach button, choose the report
        options, then add extra notes in chat if needed.
      </BuilderHint>
      <BuilderSection label="Report focus">
        <div className="flex flex-wrap gap-1.5">
          {ANALYSIS_OPTIONS.map((option) => (
            <BuilderChip
              key={option}
              active={analysis.has(option)}
              onClick={() => toggleAnalysis(option)}
            >
              {option}
            </BuilderChip>
          ))}
        </div>
      </BuilderSection>
      <BuilderSection label={`Charts: choose up to ${REPORT_MAX_CHARTS}`}>
        <IconOptionGrid>
          {REPORT_CHART_OPTIONS.map((option) => (
            <IconOption
              key={option.value}
              option={option}
              active={chartTypes.has(option.value)}
              disabled={
                !chartTypes.has(option.value) &&
                option.value !== "auto choose the best chart type" &&
                chartTypes.size >= REPORT_MAX_CHARTS
              }
              onClick={() => toggleChartType(option.value)}
            />
          ))}
        </IconOptionGrid>
        <p className="text-[10px] text-zinc-500 light:text-slate-500">
          Selected {chartTypes.size}/{REPORT_MAX_CHARTS}. The report can include
          up to three charts.
        </p>
      </BuilderSection>
      <BuilderSection label="Output">
        <div className="grid grid-cols-3 gap-1.5">
          <OutputOption
            label="PDF"
            icon={FilePdf}
            active={output === "pdf"}
            onClick={() => setOutput("pdf")}
          />
          <OutputOption
            label="DOCX"
            icon={FileDoc}
            active={output === "docx"}
            onClick={() => setOutput("docx")}
          />
          <OutputOption
            label="Both"
            icon={FilePdf}
            active={output === "pdf and docx"}
            onClick={() => setOutput("pdf and docx")}
          />
        </div>
      </BuilderSection>
      {builderError && <BuilderError>{builderError}</BuilderError>}
      <button
        type="button"
        onClick={generateReport}
        disabled={disabled}
        className={`w-full rounded-md text-xs font-semibold px-3 py-2 transition-colors ${
          disabled
            ? "cursor-not-allowed bg-zinc-700 light:bg-slate-300 text-zinc-400 light:text-slate-500"
            : "bg-white hover:bg-zinc-200 light:bg-slate-800 light:hover:bg-slate-700 text-zinc-900 light:text-white"
        }`}
      >
        {disabled ? "Waiting for file/context..." : "Generate Report"}
      </button>
    </BuilderPanel>
  );
}

function GraphAgentBuilder({
  promptInput,
  setPromptInput,
  attachments = [],
  sendCommand,
  textareaRef,
  onDisconnect,
  onSubmitted,
  disabled = false,
}) {
  const [focus, setFocus] = useState("key statistics");
  const [chartType, setChartType] = useState(
    "auto choose the best single chart"
  );
  const [output, setOutput] = useState("png");
  const [builderError, setBuilderError] = useState(null);

  function generateGraph() {
    if (disabled) return;
    const fileBlocker = getRitaBuilderFileBlocker(attachments);
    if (fileBlocker) {
      setBuilderError(fileBlocker);
      return;
    }
    setBuilderError(null);
    const extra = promptInput.trim();
    const prompt = buildGraphAgentPrompt({
      focus,
      chartType,
      output,
      extra,
    });
    sendCommand({
      text: prompt,
      displayText: `Generate one ${chartType.replace("auto choose the best single chart", "auto-selected chart")} as ${output.toUpperCase()}`,
      selectedRitaAgentId: "rita-graph-agent",
      autoSubmit: true,
    });
    setPromptInput("");
    onSubmitted?.();
    textareaRef.current?.focus();
  }

  return (
    <BuilderPanel title="RITA Graph Builder" onClose={onDisconnect}>
      <BuilderHint>
        Graph Agent creates exactly one graph. Upload a document or describe the
        data in chat, then choose the chart and output.
      </BuilderHint>
      <BuilderSection label="Data to analyse">
        <input
          type="text"
          value={focus}
          onChange={(e) => setFocus(e.target.value)}
          placeholder="Example: monthly sales, parliament seats, revenue by state"
          className="w-full rounded-md border border-zinc-700 light:border-slate-300 bg-zinc-900 light:bg-white px-2 py-2 text-xs text-white light:text-slate-900 placeholder:text-zinc-500"
        />
      </BuilderSection>
      <BuilderSection label="One graph only">
        <IconOptionGrid>
          {GRAPH_CHART_OPTIONS.map((option) => (
            <IconOption
              key={option.value}
              option={option}
              active={chartType === option.value}
              onClick={() => setChartType(option.value)}
            />
          ))}
        </IconOptionGrid>
      </BuilderSection>
      <BuilderSection label="Output">
        <div className="grid grid-cols-2 gap-1.5">
          <OutputOption
            label="PNG"
            icon={ImageSquare}
            active={output === "png"}
            onClick={() => setOutput("png")}
          />
          <OutputOption
            label="PDF"
            icon={FilePdf}
            active={output === "pdf"}
            onClick={() => setOutput("pdf")}
          />
        </div>
      </BuilderSection>
      {builderError && <BuilderError>{builderError}</BuilderError>}
      <button
        type="button"
        onClick={generateGraph}
        disabled={disabled}
        className={`w-full rounded-md text-xs font-semibold px-3 py-2 transition-colors ${
          disabled
            ? "cursor-not-allowed bg-zinc-700 light:bg-slate-300 text-zinc-400 light:text-slate-500"
            : "bg-white hover:bg-zinc-200 light:bg-slate-800 light:hover:bg-slate-700 text-zinc-900 light:text-white"
        }`}
      >
        {disabled ? "Waiting for file/context..." : "Generate One Graph"}
      </button>
    </BuilderPanel>
  );
}

function buildReportAgentPrompt({ analysis, chartTypes, output, extra }) {
  const outputInstructions = {
    pdf: "Create a polished PDF report by calling create-chart-pdf-report. Do not only describe the report plan.",
    docx: "Create a polished DOCX report using the document creation tool. Do not only describe the report plan.",
    "pdf and docx":
      "Create both a polished PDF report and a DOCX report. Call chart/report tools where appropriate. Do not only describe the report plan.",
  }[output];

  return [
    "RITA Report Builder request.",
    "This is an execution request, not a planning request.",
    "Use the uploaded/attached document, parsed file context, or workspace context.",
    "If <attached_documents> context is present in the conversation, treat it as the uploaded source data and do not ask the user to upload again.",
    "If the user recently embedded a file into the workspace, use RAG/long-term memory or workspace context before asking them to upload again.",
    `Analyse: ${analysis.join(", ")}.`,
    `Preferred charts: ${chartTypes.join(", ")}.`,
    "Generate up to three charts in the report. Each chart should cover a different useful angle and should not duplicate the same insight.",
    `Output: ${output}.`,
    outputInstructions,
    "For PDF chart reports, the next action must be a create-chart-pdf-report tool call with filename, title, summary, sections, charts, and recommendations.",
    "Do not answer with 'I will proceed', 'Now I will create', or similar narration unless the tool is unavailable.",
    "Write for non-technical users. Keep the report structured, clear, and management-friendly.",
    "If the source document is unclear but context exists, make reasonable assumptions and state them briefly.",
    "Only ask the user to upload data when there is no attached document, no parsed file context, no embedded workspace context, no workspace context, and no user-provided data.",
    extra ? `Additional user notes: ${extra}` : null,
  ]
    .filter(Boolean)
    .join("\n");
}

function buildGraphAgentPrompt({ focus, chartType, output, extra }) {
  return [
    "RITA Graph Builder request.",
    "Use the uploaded/attached document, parsed file context, workspace context, or user-provided data.",
    "If <attached_documents> context is present in the conversation, treat it as the uploaded source data and do not ask the user to upload again.",
    "If the user recently embedded a file into the workspace, use RAG/long-term memory or workspace context before asking them to upload again.",
    "Create exactly one graph only. Do not create multiple charts.",
    `Data/focus to analyse: ${focus}.`,
    `Chart type: ${chartType}.`,
    `Output: ${output}.`,
    output === "png"
      ? "Call create-matplotlib-chart to generate the PNG file. Do not only describe the chart plan."
      : "Call create-chart-pdf-report to generate a one-chart PDF output. Do not only describe the chart plan.",
    "This is an execution request, not a planning request.",
    "Include a short plain-language insight explaining the graph.",
    "Only ask the user to upload data when there is no attached document, no parsed file context, no embedded workspace context, no workspace context, and no user-provided data.",
    extra ? `Additional user notes: ${extra}` : null,
  ]
    .filter(Boolean)
    .join("\n");
}

function BuilderPanel({ title, onClose, children }) {
  return (
    <div className="mb-2 rounded-xl border border-white/10 light:border-slate-300 bg-zinc-900 light:bg-slate-50 p-3 shadow-lg">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-semibold text-white light:text-slate-900">
          {title}
        </p>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-green-300 light:text-green-700">
            Connected
          </span>
          <button
            type="button"
            onClick={onClose}
            className="h-7 w-7 rounded-full flex items-center justify-center text-zinc-400 hover:text-white hover:bg-zinc-700 light:text-slate-500 light:hover:text-slate-900 light:hover:bg-slate-200 transition-colors"
            aria-label="Disconnect RITA Agent"
            title="Disconnect RITA Agent"
          >
            <X size={16} />
          </button>
        </div>
      </div>
      <div className="mt-3 flex flex-col gap-3">{children}</div>
    </div>
  );
}

function BuilderHint({ children }) {
  return (
    <p className="text-[11px] leading-relaxed text-zinc-400 light:text-slate-600">
      {children}
    </p>
  );
}

function BuilderError({ children }) {
  return (
    <div className="rounded-md border border-red-400/30 bg-red-500/10 px-3 py-2 text-[11px] leading-relaxed text-red-200 light:text-red-700 light:bg-red-50 light:border-red-200">
      {children}
    </div>
  );
}

function BuilderSection({ label, children }) {
  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-[10px] uppercase tracking-wide font-semibold text-zinc-500 light:text-slate-500">
        {label}
      </p>
      {children}
    </div>
  );
}

function BuilderChip({ active, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full px-2.5 py-1 border text-[11px] transition-colors ${
        active
          ? "border-blue-400 bg-blue-500/10 text-blue-100 light:bg-blue-50 light:text-blue-800"
          : "border-zinc-700 light:border-slate-300 text-zinc-300 light:text-slate-700 hover:bg-zinc-700/50 light:hover:bg-slate-100"
      }`}
    >
      {children}
    </button>
  );
}

function IconOptionGrid({ children }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 gap-1.5">{children}</div>
  );
}

function IconOption({ option, active, disabled = false, onClick }) {
  const Icon = option.icon;
  const stateClass = active
    ? "border-blue-400 bg-blue-500/10 light:bg-blue-50"
    : disabled
      ? "border-zinc-800 light:border-slate-200 opacity-40 cursor-not-allowed"
      : "border-zinc-700 light:border-slate-300 hover:bg-zinc-700/50 light:hover:bg-slate-100";

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`rounded-md border px-2 py-2 flex items-center gap-1.5 text-left transition-colors ${stateClass}`}
    >
      <Icon size={16} className="text-white light:text-slate-700 shrink-0" />
      <span className="text-[11px] text-white light:text-slate-800 truncate">
        {option.label}
      </span>
    </button>
  );
}

function OutputOption({ label, icon: Icon, active, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-md border px-2 py-2 flex items-center justify-center gap-1.5 transition-colors ${
        active
          ? "border-blue-400 bg-blue-500/10 light:bg-blue-50"
          : "border-zinc-700 light:border-slate-300 hover:bg-zinc-700/50 light:hover:bg-slate-100"
      }`}
    >
      <Icon size={16} className="text-white light:text-slate-700" />
      <span className="text-[11px] font-medium text-white light:text-slate-800">
        {label}
      </span>
    </button>
  );
}

function SelectedRitaAgentBadge({ agent = null, onDisconnect }) {
  if (!agent) return null;
  return (
    <div className="flex items-center gap-x-1.5 rounded-full py-1 pl-2.5 pr-1 bg-white/10 light:bg-slate-100 text-white light:text-slate-700 text-xs">
      <RitaAgentAvatar agent={agent} size="sm" />
      <span>{agent.name}</span>
      <button
        type="button"
        onClick={onDisconnect}
        className="h-5 w-5 rounded-full flex items-center justify-center text-zinc-400 hover:text-white hover:bg-white/10 light:text-slate-500 light:hover:text-slate-900 light:hover:bg-slate-200 transition-colors"
        title="Disconnect RITA Agent"
        aria-label="Disconnect RITA Agent"
      >
        <X size={12} />
      </button>
    </div>
  );
}

function RitaAgentAvatar({ agent, size = "md" }) {
  const image = {
    "rita-report-agent": RitaReportAgentImage,
    "rita-graph-agent": RitaGraphAgentImage,
  }[agent?.id];
  const sizeClass = size === "sm" ? "h-4 w-4" : "h-8 w-8";
  if (image) {
    return (
      <img
        src={image}
        alt={agent.name}
        className={`${sizeClass} rounded-full object-cover shrink-0`}
      />
    );
  }

  return (
    <span
      className={`${sizeClass} rounded-full flex items-center justify-center text-[8px] text-white font-bold shrink-0`}
      style={{ backgroundColor: agent.color }}
    >
      {agent.icon}
    </span>
  );
}

function AgentSessionButton({
  sendCommand,
  promptInput,
  textareaRef,
  visible = true,
}) {
  const { t } = useTranslation();
  if (!visible) return null;

  function handleClick() {
    try {
      if (promptInput?.trim()?.startsWith("@agent")) return;
      sendCommand({ text: "@agent", writeMode: "prepend" });
    } finally {
      textareaRef?.current?.focus();
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        data-tooltip-id="agent-session"
        data-tooltip-content={t("chat_window.start_agent_session")}
        aria-label={t("chat_window.start_agent_session")}
        className="group border-none relative flex justify-center items-center cursor-pointer w-6 h-6 rounded-full hover:bg-zinc-700 light:hover:bg-slate-200"
      >
        <At
          size={18}
          className="pointer-events-none text-zinc-300 light:text-slate-600 group-hover:text-white light:group-hover:text-slate-600 shrink-0"
        />
      </button>
      <Tooltip
        id="agent-session"
        place="bottom"
        delayShow={300}
        className="tooltip !text-xs z-99"
      />
    </>
  );
}

function ToolsButton({
  showTools,
  setShowTools,
  textareaRef,
  autoOpenedToolsRef,
}) {
  const { t } = useTranslation();

  return (
    <button
      id="tools-btn"
      type="button"
      onClick={() => {
        autoOpenedToolsRef.current = false;
        setShowTools(!showTools);
        textareaRef.current?.focus();
      }}
      className={`group border-none cursor-pointer flex items-center justify-center h-6 px-2 rounded-full ${
        showTools
          ? "bg-zinc-700 light:bg-slate-200"
          : "hover:bg-zinc-700 light:hover:bg-slate-200"
      }`}
    >
      <span
        className={`text-sm font-medium ${
          showTools
            ? "text-white light:text-slate-800"
            : "text-zinc-300 light:text-slate-600 group-hover:text-white light:group-hover:text-slate-800"
        }`}
      >
        {t("chat_window.tools")}
      </span>
    </button>
  );
}

function SendPromptButton({ formRef, promptInput, isDisabled }) {
  const { t } = useTranslation();

  return (
    <>
      <button
        ref={formRef}
        type="submit"
        disabled={isDisabled || !promptInput.trim().length}
        className={`border-none flex justify-center items-center rounded-full w-8 h-8 transition-all ${
          promptInput.trim().length && !isDisabled
            ? "cursor-pointer bg-white hover:bg-zinc-200 light:bg-slate-800 light:hover:bg-slate-600"
            : "cursor-not-allowed bg-zinc-600 light:bg-slate-400"
        }`}
        data-tooltip-id="send-prompt"
        data-tooltip-content={
          isDisabled
            ? t("chat_window.attachments_processing")
            : t("chat_window.send")
        }
        aria-label={t("chat_window.send")}
      >
        <ArrowUp
          className="w-[18px] h-[18px] pointer-events-none text-zinc-800 light:text-white"
          weight="bold"
        />
        <span className="sr-only">{t("chat_window.send")}</span>
      </button>
      <Tooltip
        id="send-prompt"
        place="bottom"
        delayShow={300}
        className="tooltip !text-xs z-99"
      />
    </>
  );
}

/**
 * Handle event listeners to prevent the send button from being used
 * for whatever reason that may we may want to prevent the user from sending a message.
 */
function useIsDisabled(attachments = []) {
  const isDisabled = attachments.some(
    (attachment) => attachment.status === "in_progress"
  );

  return { isDisabled };
}

function getRitaBuilderFileBlocker(attachments = []) {
  const documentAttachments = attachments.filter(
    (attachment) => attachment.type === "upload"
  );
  if (!documentAttachments.length) return null;

  const processing = documentAttachments.find(
    (attachment) => attachment.status === "in_progress"
  );
  if (processing) {
    return `RITA is still preparing "${processing.file?.name || "your file"}". Please wait a moment before generating.`;
  }

  const failed = documentAttachments.find(
    (attachment) => attachment.status === "failed"
  );
  if (failed) {
    return `RITA could not read "${failed.file?.name || "this file"}" properly. Please upload a clearer PDF, CSV, Excel, or Word file.`;
  }

  return null;
}
