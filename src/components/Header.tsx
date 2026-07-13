import { Countdown } from "@/components/Countdown";

export function Header() {
  return (
    <header className="flex items-center justify-between bg-neutral-800 text-white rounded-md px-4 py-2">
      <h1 className="text-base font-bold">오늘의 밸런스 게임</h1>
      <Countdown />
    </header>
  );
}
