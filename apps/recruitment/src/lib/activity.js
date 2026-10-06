// Counts server actions in flight so the page can show instant "working…"
// feedback the moment a button is clicked (see ActivityBar).
let active = 0;
const listeners = new Set();
const emit = () => listeners.forEach((fn) => fn(active));

export function activityStart() { active += 1; emit(); }
export function activityEnd() { active = Math.max(0, active - 1); emit(); }
export function subscribeActivity(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
