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
    <div className="msg">
      <div className={`dot ${isA ? "a" : "b"}`} />
      <div className="bubble">
        <div className="nick">{message.nickname}</div>
        <div className="txt">{message.content}</div>
      </div>
      <button
        type="button"
        className={`endorse${endorsed ? " on" : ""}`}
        onClick={onEndorse}
        disabled={endorsed}
      >
        <span className="oj">ㅇㅈ</span>
        <span className="c">{endorsementCount}</span>
      </button>
    </div>
  );
}
