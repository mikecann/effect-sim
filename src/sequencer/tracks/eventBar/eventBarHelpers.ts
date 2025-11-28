/**
 * Helper function to check if two events overlap
 */
export function eventsOverlap(
  start1: number,
  end1: number,
  start2: number,
  end2: number,
): boolean {
  // Events overlap if one starts before the other ends
  return start1 < end2 && start2 < end1;
}

