/** A small typed publish/subscribe bus. Keys map to payload types. */
export class Emitter<Events extends object> {
  private readonly listeners = new Map<keyof Events, Set<(payload: never) => void>>();

  on<K extends keyof Events>(type: K, listener: (payload: Events[K]) => void): () => void {
    const set = this.listeners.get(type) ?? new Set<(payload: never) => void>();
    this.listeners.set(type, set);
    const entry = listener as (payload: never) => void;
    set.add(entry);
    return () => {
      set.delete(entry);
    };
  }

  emit<K extends keyof Events>(type: K, payload: Events[K]): void {
    const set = this.listeners.get(type);
    if (set === undefined) return;
    for (const listener of set) {
      (listener as (payload: Events[K]) => void)(payload);
    }
  }
}
