export class Multiset<T> {
  private values: Map<T, number>;
  constructor() {
    this.values = new Map<T, number>();
  }

  public get(key: T): number {
    let count = this.values.get(key);
    if (count === undefined) {
      count = 0;
    }
    return count;
  }

  public add(key: T): void {
    this.values.set(key, this.get(key) + 1);
  }

  public static max<T>(set1: Multiset<T>, set2: Multiset<T>): Multiset<T> {
    let maxSet = new Multiset<T>();
    set1.forEach((count, key) => {
      maxSet.values.set(key, Math.max(count, set2.get(key)));
    });
    set2.forEach((count, key) => {
      maxSet.values.set(key, Math.max(count, set1.get(key)));
    });
    return maxSet;
  }

  public sub(otherSet: Multiset<T>): Multiset<T> {
    let subSet = new Multiset<T>();
    this.forEach((count, key) => {
      subSet.values.set(key, Math.max(0, count - otherSet.get(key)));
    });
    return subSet;
  }

  public removeKeys(keys: Set<T>): Multiset<T> {
    let newSet = new Multiset<T>();
    this.forEach((count, key) => {
      if (keys.has(key)) {
        return;
      }
      newSet.values.set(key, count);
    });
    return newSet;
  }

  /**
   * Executes a provided function once per each key/value pair in the Map, in insertion order.
   */
  forEach(callbackfn: (count: number, key: T) => void): void {
    return this.values.forEach(callbackfn);
  }
}
