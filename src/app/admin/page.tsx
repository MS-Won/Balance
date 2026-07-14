import { createGame, deleteGame, listGames } from "@/app/admin/actions";
import { revalidatePath } from "next/cache";

// Given a YYYY-MM-DD string, return the next calendar day as YYYY-MM-DD.
// Uses UTC math on a date-only value so there is no timezone drift.
function nextDay(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

export default async function AdminPage() {
  const games = await listGames();
  // Default the date field to the day after the latest registered game.
  // listGames() returns games ordered by date desc, so games[0] is the latest.
  // With no games registered, leave it empty (browser shows mm/dd/yyyy).
  const defaultDate = games[0] ? nextDay(games[0].date) : undefined;

  async function create(formData: FormData) {
    "use server";
    await createGame(formData);
    revalidatePath("/admin");
  }

  async function remove(id: string) {
    "use server";
    await deleteGame(id);
    revalidatePath("/admin");
  }

  return (
    <main className="mx-auto max-w-lg p-4 space-y-4">
      <h1 className="font-bold text-sm">밸런스 게임 문제 관리</h1>

      <form action={create} className="space-y-2 border rounded-md p-2">
        <input
          type="date"
          name="date"
          required
          defaultValue={defaultDate}
          className="border rounded-md w-full px-2 py-1 text-sm"
        />
        <input
          name="question"
          placeholder="질문 (예: 점심 뭐 먹지?)"
          required
          className="border rounded-md w-full px-2 py-1 text-sm"
        />
        <input
          name="description"
          placeholder="질문 상세가정 (선택)"
          className="border rounded-md w-full px-2 py-1 text-sm"
        />
        <input
          name="choice_a_label"
          placeholder="선택지 A"
          required
          className="border rounded-md w-full px-2 py-1 text-sm"
        />
        <input
          name="choice_a_description"
          placeholder="선택지 A 상세가정 (선택)"
          className="border rounded-md w-full px-2 py-1 text-sm"
        />
        <input
          name="choice_b_label"
          placeholder="선택지 B"
          required
          className="border rounded-md w-full px-2 py-1 text-sm"
        />
        <input
          name="choice_b_description"
          placeholder="선택지 B 상세가정 (선택)"
          className="border rounded-md w-full px-2 py-1 text-sm"
        />
        <button type="submit" className="bg-neutral-800 text-white rounded-md px-3 py-1 text-sm">
          등록
        </button>
      </form>

      <ul className="space-y-1">
        {games.map((g) => (
          <li key={g.id} className="flex justify-between items-center border rounded-md p-2 text-xs">
            <span>
              {g.date} · {g.question ? `${g.question} — ` : ""}
              {g.choice_a_label} vs {g.choice_b_label} · {g.status}
            </span>
            <form action={remove.bind(null, g.id)}>
              <button type="submit" className="text-red-600">
                삭제
              </button>
            </form>
          </li>
        ))}
      </ul>
    </main>
  );
}
