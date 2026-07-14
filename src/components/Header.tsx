import { Countdown } from "@/components/Countdown";

export function Header() {
  return (
    <header className="bg-header">
      <div className="bg-brand">오늘의 밸런스</div>
      <div className="bg-count">
        <div className="lbl">다음 밸런스까지</div>
        <Countdown />
      </div>
    </header>
  );
}
