import { createGame, deleteGame, listGames, updateGame } from "@/app/admin/actions";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

// Given a YYYY-MM-DD string, return the next calendar day as YYYY-MM-DD.
// Uses UTC math on a date-only value so there is no timezone drift.
function nextDay(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<{ edit?: string }>;
}) {
  const { edit: editId } = await searchParams;
  const games = await listGames();
  // Default the date field to the day after the latest registered game.
  // listGames() returns games ordered by date desc, so games[0] is the latest.
  // With no games registered, leave it empty (browser shows mm/dd/yyyy).
  const defaultDate = games[0] ? nextDay(games[0].date) : undefined;
  const editingGame = editId ? games.find((g) => g.id === editId) : undefined;

  async function create(formData: FormData) {
    "use server";
    await createGame(formData);
    revalidatePath("/admin");
  }

  async function update(formData: FormData) {
    "use server";
    await updateGame(editId!, formData);
    revalidatePath("/admin");
    redirect("/admin");
  }

  async function remove(id: string) {
    "use server";
    await deleteGame(id);
    revalidatePath("/admin");
  }

  return (
    <main className="mx-auto max-w-lg p-4 space-y-4">
      <h1 className="font-bold text-sm">밸런스 게임 문제 관리</h1>

      <form
        action={editingGame ? update : create}
        className="space-y-2 border rounded-md p-2"
      >
        {editingGame && (
          <p className="text-xs text-neutral-500">
            {editingGame.date} 문제 수정 중 — 투표/댓글 등 기존 데이터는 그대로 유지됩니다.
          </p>
        )}
        <input
          type="date"
          name="date"
          required
          defaultValue={editingGame?.date ?? defaultDate}
          className="border rounded-md w-full px-2 py-1 text-sm"
        />
        <input
          name="question"
          placeholder="질문 (예: 점심 뭐 먹지?)"
          required
          defaultValue={editingGame?.question ?? ""}
          className="border rounded-md w-full px-2 py-1 text-sm"
        />
        <input
          name="description"
          placeholder="질문 상세가정 (선택)"
          defaultValue={editingGame?.description ?? ""}
          className="border rounded-md w-full px-2 py-1 text-sm"
        />
        <input
          name="choice_a_label"
          placeholder="선택지 A"
          required
          defaultValue={editingGame?.choice_a_label ?? ""}
          className="border rounded-md w-full px-2 py-1 text-sm"
        />
        <input
          name="choice_a_description"
          placeholder="선택지 A 상세가정 (선택)"
          defaultValue={editingGame?.choice_a_description ?? ""}
          className="border rounded-md w-full px-2 py-1 text-sm"
        />
        <input
          name="choice_b_label"
          placeholder="선택지 B"
          required
          defaultValue={editingGame?.choice_b_label ?? ""}
          className="border rounded-md w-full px-2 py-1 text-sm"
        />
        <input
          name="choice_b_description"
          placeholder="선택지 B 상세가정 (선택)"
          defaultValue={editingGame?.choice_b_description ?? ""}
          className="border rounded-md w-full px-2 py-1 text-sm"
        />
        <div className="flex gap-2">
          <button type="submit" className="bg-neutral-800 text-white rounded-md px-3 py-1 text-sm">
            {editingGame ? "수정 완료" : "등록"}
          </button>
          {editingGame && (
            <a
              href="/admin"
              className="rounded-md px-3 py-1 text-sm border border-neutral-300 text-neutral-600"
            >
              취소
            </a>
          )}
        </div>
      </form>

      <ul className="space-y-1">
        {games.map((g) => (
          <li key={g.id} className="flex justify-between items-center border rounded-md p-2 text-xs">
            <span>
              {g.date} · {g.question ? `${g.question} — ` : ""}
              {g.choice_a_label} vs {g.choice_b_label} · {g.status}
            </span>
            <span className="flex gap-2 items-center">
              <a href={`/admin?edit=${g.id}`} className="text-neutral-600">
                수정
              </a>
              <form action={remove.bind(null, g.id)}>
                <button type="submit" className="text-red-600">
                  삭제
                </button>
              </form>
            </span>
          </li>
        ))}
      </ul>
    </main>
  );
}
