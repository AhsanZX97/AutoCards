/** 0-100 mastery derived from plain answer accuracy. */
export function computeMastery(timesSeen: number, timesCorrect: number): number {
  if (timesSeen === 0) return 0;
  return Math.round((timesCorrect / timesSeen) * 100);
}
