import type { ChatMessage } from "@/hooks/useChatMessages";

export function ChatMessageItem({
  message,
  endorsementCount,
  endorsed,
  onEndorse,
}: {
  message: ChatMessage;
  endorsementCount: number;
  endorsed: boolean;
  onEndorse: () => void;
}) {
  const isA = message.choice === "A";
  return (
    <div
      className={`flex items-center justify-between gap-2 rounded-md px-2 py-1 text-xs border-l-4 ${
        isA ? "bg-rose-50 border-rose-500" : "bg-blue-50 border-blue-500"
      }`}
    >
      <div>
        <span className="font-bold mr-1">{isA ? "🅰" : "🅱"} {message.nickname}</span>
        <span>{message.content}</span>
      </div>
      <button
        onClick={onEndorse}
        disabled={endorsed}
        className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${
          endorsed ? "bg-amber-400 text-white" : "bg-neutral-200 text-neutral-700"
        }`}
      >
        인정 {endorsementCount}
      </button>
    </div>
  );
}
