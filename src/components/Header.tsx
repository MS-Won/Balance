import { Countdown } from "@/components/Countdown";

export function Header({
  nickname,
  onChangeNickname,
}: {
  nickname?: string | null;
  onChangeNickname?: () => void;
}) {
  return (
    <header className="bg-header">
      <div className="bg-brand">오늘의 밸런스</div>
      <div className="bg-count">
        <div className="lbl">다음 밸런스까지</div>
        <Countdown />
      </div>
      {nickname && (
        <button type="button" className="nick-change" onClick={onChangeNickname}>
          닉네임 변경
        </button>
      )}
    </header>
  );
}
