import type { ChatMessage } from "@/hooks/useChatMessages";

export function ChatMessageItem({
  message,
  endorsementCount,
  endorsed,
  isOwn,
  onEndorse,
  onDelete,
}: {
  message: ChatMessage;
  endorsementCount: number;
  endorsed: boolean;
  isOwn: boolean;
  onEndorse: () => void;
  onDelete: () => void;
}) {
  const isA = message.choice === "A";
  return (
    <div className="msg">
      <div className={`dot ${isA ? "a" : "b"}`} />
      <div className="bubble">
        <div className="nick">{message.nickname}</div>
        <div className="txt">{message.content}</div>
        {isOwn && (
          <button
            type="button"
            className="msgdelete"
            onClick={() => {
              if (window.confirm("삭제하시겠습니까?")) onDelete();
            }}
            aria-label="메시지 삭제"
          >
            🗑
          </button>
        )}
      </div>
      <button type="button" className={`endorse${endorsed ? " on" : ""}`} onClick={onEndorse}>
        <span className="oj">ㅇㅈ</span>
        <span className="c">{endorsementCount}</span>
      </button>
    </div>
  );
}
