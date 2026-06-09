/* eslint-disable react-hooks/refs */
import { memo, useRef, useEffect } from "react";
import { Warning } from "@phosphor-icons/react";
import renderMarkdown from "@/utils/chat/markdown";
import DOMPurify from "@/utils/chat/purify";
import Citations from "../Citation";
import {
  THOUGHT_REGEX_CLOSE,
  THOUGHT_REGEX_COMPLETE,
  THOUGHT_REGEX_OPEN,
  ThoughtChainComponent,
} from "../ThoughtContainer";
import useUser from "@/hooks/useUser";
import ThinkingAnimation from "@/media/animations/thinking-animation.webm";

const PromptReply = ({ uuid, reply, pending, error, sources = [] }) => {
  if (!reply && sources.length === 0 && !pending && !error) return null;

  if (pending) {
    return (
      <div className="flex justify-start w-full">
        <div className="py-4 pl-0 pr-4 flex flex-col md:max-w-[80%]">
          <RitaProgressMessage />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex justify-start w-full">
        <div className="py-4 pl-0 pr-4 flex flex-col md:max-w-[80%]">
          <span className="inline-block p-2 rounded-lg bg-red-50 text-red-500">
            <Warning className="h-4 w-4 mb-1 inline-block" /> Could not respond
            to message.
            <span className="text-xs">Reason: {error || "unknown"}</span>
          </span>
        </div>
      </div>
    );
  }

  return (
    <div key={uuid} className="flex justify-start w-full">
      <div className="py-4 pl-0 pr-4 flex flex-col w-full">
        <RenderAssistantChatContent
          key={`${uuid}-prompt-reply-content`}
          message={reply}
          messageId={uuid}
        />
        <Citations sources={sources} />
      </div>
    </div>
  );
};

function RenderAssistantChatContent({ message, messageId }) {
  const { user } = useUser();
  const isAdmin = !user?.role || user.role === "admin";
  const contentRef = useRef("");
  const thoughtChainRef = useRef(null);

  useEffect(() => {
    const thinking =
      message.match(THOUGHT_REGEX_OPEN) && !message.match(THOUGHT_REGEX_CLOSE);

    if (thinking && thoughtChainRef.current) {
      thoughtChainRef.current.updateContent(message);
      return;
    }

    const completeThoughtChain = message.match(THOUGHT_REGEX_COMPLETE)?.[0];
    const msgToRender = message.replace(THOUGHT_REGEX_COMPLETE, "");

    if (completeThoughtChain && thoughtChainRef.current) {
      thoughtChainRef.current.updateContent(completeThoughtChain);
    }

    contentRef.current = msgToRender;
  }, [message]);

  const thinking =
    message.match(THOUGHT_REGEX_OPEN) && !message.match(THOUGHT_REGEX_CLOSE);
  if (thinking && !isAdmin) return <RitaProgressMessage />;
  if (thinking)
    return (
      <ThoughtChainComponent
        ref={thoughtChainRef}
        content=""
        messageId={messageId}
      />
    );

  return (
    <div className="flex flex-col gap-y-1">
      {isAdmin && message.match(THOUGHT_REGEX_COMPLETE) && (
        <ThoughtChainComponent
          ref={thoughtChainRef}
          content=""
          messageId={messageId}
        />
      )}
      <span
        className="break-words"
        dangerouslySetInnerHTML={{
          __html: DOMPurify.sanitize(renderMarkdown(contentRef.current)),
        }}
      />
    </div>
  );
}

function RitaProgressMessage() {
  return (
    <div className="flex items-center gap-3 rounded-2xl bg-zinc-800 light:bg-slate-100 px-4 py-3 text-zinc-200 light:text-slate-700">
      <video
        autoPlay
        loop
        muted
        playsInline
        className="h-6 w-6 light:invert light:opacity-60"
      >
        <source src={ThinkingAnimation} type="video/webm" />
      </video>
      <div className="flex flex-col">
        <span className="text-sm font-medium">
          RITA is preparing your answer
        </span>
        <span className="text-xs text-zinc-400 light:text-slate-500">
          Please wait a moment...
        </span>
      </div>
    </div>
  );
}

export default memo(PromptReply);
