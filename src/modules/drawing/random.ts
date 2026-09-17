export type RandomInt = (upperExclusive: number) => number;

export function sampleWithoutReplacement<T>(
  items: readonly T[],
  count: number,
  randomInt: RandomInt,
): T[] {
  if (!Number.isInteger(count) || count < 0) {
    throw new RangeError("Count must be a non-negative integer");
  }
  if (count > items.length) {
    throw new RangeError("Count cannot exceed candidate count");
  }

  const pool = [...items];
  for (let index = 0; index < count; index += 1) {
    const remaining = pool.length - index;
    const offset = randomInt(remaining);
    if (!Number.isInteger(offset) || offset < 0 || offset >= remaining) {
      throw new RangeError("Random value is outside the requested range");
    }
    const selectedIndex = index + offset;
    [pool[index], pool[selectedIndex]] = [pool[selectedIndex], pool[index]];
  }
  return pool.slice(0, count);
}
