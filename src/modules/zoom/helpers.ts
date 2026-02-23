import { DateTime } from "luxon";
import { ZoomMeetingParticipant } from "./types";

export const toDT = (iso: string) => {
  return DateTime.fromISO(iso, { zone: "utc" });
};

export const mapWithConcurrency = async <T, R>(
  items: readonly T[],
  concurrency: number,
  worker: (item: T) => Promise<R>,
) => {
  const results: R[] = new Array(items.length);
  let index = 0;

  const run = async () => {
    while (true) {
      const current = index++;
      if (current >= items.length) break;

      const item = items[current];
      if (item === undefined) continue;
      results[current] = await worker(item);
    }
  };

  const workers = Array.from(
    { length: Math.min(concurrency, items.length) },
    () => run(),
  );

  await Promise.all(workers);
  return results;
};

export function mergeParticipant(
  participants: ZoomMeetingParticipant[],
  gapMinutes = 5,
): ZoomMeetingParticipant[] {
  const gapMs = gapMinutes * 60 * 1000;

  const normName = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");

  // 1) excluir "SALA..." (docente/host)
  const filtered = participants.filter((p) => {
    const n = normName(p.name || "");
    return !n.includes("sala");
  });

  // key: usa participant_user_id/id si existe, si no email, si no user_id, si no nombre
  const keyOf = (p: ZoomMeetingParticipant) =>
    (p.id && p.id.trim()) || `name:${normName(p.name || "")}`;

  const byKey = new Map<string, ZoomMeetingParticipant[]>();

  for (const p of filtered) {
    if (!p.join_time || !p.leave_time) continue;
    const k = keyOf(p);
    const arr = byKey.get(k);
    if (arr) arr.push(p);
    else byKey.set(k, [p]);
  }

  const out: ZoomMeetingParticipant[] = [];

  for (const [, arr] of byKey) {
    if (arr.length === 0) continue;

    arr.sort((a, b) => Date.parse(a.join_time) - Date.parse(b.join_time));

    type Segment = { join: number; leave: number; duration: number };
    const segments: Segment[] = [];

    for (const p of arr) {
      const join = Date.parse(p.join_time);
      const leave = Date.parse(p.leave_time);
      const dur = Number(p.duration || 0); // Zoom: segundos

      if (segments.length === 0) {
        segments.push({ join, leave, duration: dur });
        continue;
      }

      // ✅ aquí TS se queja con noUncheckedIndexedAccess, así que aseguramos
      const last = segments[segments.length - 1];
      if (!last) {
        segments.push({ join, leave, duration: dur });
        continue;
      }

      if (join <= last.leave + gapMs) {
        if (leave > last.leave) last.leave = leave;
        last.duration += dur;
      } else {
        segments.push({ join, leave, duration: dur });
      }
    }

    // ✅ arr[0] puede ser undefined para TS, así que lo fijamos
    const first = arr[0];
    if (!first) continue;

    // ✅ base queda tipado como ZoomMeetingParticipant (no “opcional”)
    const base: ZoomMeetingParticipant = { ...first };

    const minJoin = Math.min(...segments.map((s) => s.join));
    const maxLeave = Math.max(...segments.map((s) => s.leave));
    const sumDur = segments.reduce((acc, s) => acc + s.duration, 0);

    base.join_time = new Date(minJoin).toISOString();
    base.leave_time = new Date(maxLeave).toISOString();
    base.duration = sumDur;

    out.push(base);
  }

  return out;
}
