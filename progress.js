// La meta queda ligada al día. Los días cumplidos nunca se desmarcan.
import { db, dayKey, getSetting } from './db.js';

let migration;
export function normalizeSession(s, fallbackGoal = 10) {
  const goalMin = s.goalMin || fallbackGoal;
  return { ...s, goalMin, completed: !!s.completed || s.seconds >= goalMin * 60 };
}

export function initializeProgress() {
  if (!migration) migration = (async () => {
    const goal = await getSetting('dailyGoal', 10);
    const sessions = await db.all('sessions');
    for (const s of sessions) {
      if (!s.goalMin || typeof s.completed !== 'boolean') {
        await db.update('sessions', s.date, current => current && normalizeSession(current, goal));
      }
    }
  })().catch(e => { migration = null; throw e; });
  return migration;
}

export async function recordReading(seconds, bookId, date = dayKey()) {
  await initializeProgress();
  const goal = await getSetting('dailyGoal', 10);
  return db.update('sessions', date, previous => {
    const s = previous || { date, seconds: 0, books: [], goalMin: goal };
    return normalizeSession({ ...s, seconds: s.seconds + seconds, books: [...new Set([...s.books, bookId])] }, goal);
  });
}

export function mergeSession(local, incoming, fallbackGoal = 10) {
  const b = normalizeSession(incoming, fallbackGoal);
  if (!local) return b;
  const a = normalizeSession(local, fallbackGoal);
  return { ...a, seconds: Math.max(a.seconds, b.seconds), books: [...new Set([...a.books, ...b.books])], completed: a.completed || b.completed };
}
