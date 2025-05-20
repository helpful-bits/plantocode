/**
 * Utility functions for array manipulation
 */

/**
 * Removes duplicate items from an array
 * @param array Array with possible duplicates
 * @param keyFn Optional function to extract comparison key from objects
 * @returns Array with duplicates removed
 */
export function uniqueArray<T>(array: T[], keyFn?: (item: T) => unknown): T[] {
  if (!array || !Array.isArray(array)) {
    return [];
  }

  if (!keyFn) {
    return [...new Set(array)];
  }

  const seen = new Set();
  return array.filter((item) => {
    const key = keyFn(item);
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

/**
 * Chunk an array into smaller arrays of specified size
 * @param array Array to chunk
 * @param size Size of each chunk
 * @returns Array of chunks
 */
export function chunkArray<T>(array: T[], size: number): T[][] {
  if (!array || !Array.isArray(array) || size <= 0) {
    return [];
  }

  const chunks: T[][] = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }

  return chunks;
}

/**
 * Safely get an item from an array with index wrapping
 * @param array Source array
 * @param index Index to get (will be wrapped if out of bounds)
 * @returns Array item or undefined if array is empty
 */
export function getWrappedItem<T>(array: T[], index: number): T | undefined {
  if (!array || !array.length) {
    return undefined;
  }

  // Handle negative indices and wrap around for indices beyond array length
  const wrappedIndex = ((index % array.length) + array.length) % array.length;
  return array[wrappedIndex];
}

/**
 * Sorts an array of objects by a specific property
 * @param array Array to sort
 * @param key Key to sort by
 * @param direction Sort direction ('asc' or 'desc')
 * @returns Sorted array
 */
export function sortByProperty<T>(
  array: T[],
  key: keyof T,
  direction: "asc" | "desc" = "asc"
): T[] {
  if (!array || !Array.isArray(array)) {
    return [];
  }

  const sortedArray = [...array];

  sortedArray.sort((a, b) => {
    const aValue = a[key];
    const bValue = b[key];

    // Handle undefined or null values
    if (aValue === null && bValue === null) return 0;
    if (aValue === undefined && bValue === undefined) return 0; 
    if (aValue === null || aValue === undefined) return direction === "asc" ? -1 : 1;
    if (bValue === null || bValue === undefined) return direction === "asc" ? 1 : -1;

    // Compare values
    if (aValue < bValue) return direction === "asc" ? -1 : 1;
    if (aValue > bValue) return direction === "asc" ? 1 : -1;

    return 0;
  });

  return sortedArray;
}

/**
 * Groups an array of objects by a specific property
 * @param array Array to group
 * @param key Key to group by
 * @returns Object with groups
 */
export function groupBy<T>(array: T[], key: keyof T): Record<string, T[]> {
  if (!array || !Array.isArray(array)) {
    return {};
  }

  return array.reduce(
    (result, item) => {
      const groupKey = String(item[key] ?? "undefined");

      if (!result[groupKey]) {
        result[groupKey] = [];
      }

      result[groupKey].push(item);
      return result;
    },
    {} as Record<string, T[]>
  );
}

/**
 * Finds the difference between two arrays
 * @param array1 First array
 * @param array2 Second array
 * @param keyFn Optional function to extract comparison key from objects
 * @returns Array of items in array1 that are not in array2
 */
export function arrayDifference<T>(
  array1: T[],
  array2: T[],
  keyFn?: (item: T) => unknown
): T[] {
  if (!array1 || !Array.isArray(array1)) {
    return [];
  }

  if (!array2 || !Array.isArray(array2) || array2.length === 0) {
    return [...array1];
  }

  if (keyFn) {
    const set2 = new Set(array2.map(keyFn));
    return array1.filter((item) => !set2.has(keyFn(item)));
  }

  const set2 = new Set(array2);
  return array1.filter((item) => !set2.has(item));
}

/**
 * Finds the intersection of two arrays
 * @param array1 First array
 * @param array2 Second array
 * @param keyFn Optional function to extract comparison key from objects
 * @returns Array of items that are in both arrays
 */
export function arrayIntersection<T>(
  array1: T[],
  array2: T[],
  keyFn?: (item: T) => unknown
): T[] {
  if (
    !array1 ||
    !Array.isArray(array1) ||
    array1.length === 0 ||
    !array2 ||
    !Array.isArray(array2) ||
    array2.length === 0
  ) {
    return [];
  }

  if (keyFn) {
    const map2 = new Map(array2.map((item) => [keyFn(item), item]));
    return array1.filter((item) => map2.has(keyFn(item)));
  }

  const set2 = new Set(array2);
  return array1.filter((item) => set2.has(item));
}

/**
 * Flattens a nested array structure
 * @param array Array to flatten
 * @param depth Maximum depth to flatten (default: Infinity)
 * @returns Flattened array
 */
export function flattenArray<T>(array: unknown[], depth: number = Infinity): T[] {
  if (!array || !Array.isArray(array)) {
    return [];
  }

  if (depth < 1) {
    return array.slice() as T[];
  }

  const result: T[] = [];
  
  // Manual implementation to avoid type issues
  for (const item of array) {
    if (Array.isArray(item)) {
      // Recursively flatten array items
      const flattened = flattenArray<T>(item as unknown[], depth - 1);
      result.push(...flattened);
    } else {
      // Add the item directly
      result.push(item as T);
    }
  }
  
  return result;
}

/**
 * Shuffles an array using Fisher-Yates algorithm
 * @param array Array to shuffle
 * @returns New shuffled array
 */
export function shuffleArray<T>(array: T[]): T[] {
  if (!array || !Array.isArray(array)) {
    return [];
  }

  const shuffled = [...array];

  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }

  return shuffled;
}

/**
 * Moves an item in an array from one index to another
 * @param array Array to modify
 * @param fromIndex Current index of the item
 * @param toIndex Target index for the item
 * @returns New array with the item moved
 */
export function moveArrayItem<T>(
  array: T[],
  fromIndex: number,
  toIndex: number
): T[] {
  if (
    !array ||
    !Array.isArray(array) ||
    fromIndex < 0 ||
    fromIndex >= array.length ||
    toIndex < 0 ||
    toIndex >= array.length
  ) {
    return array ? [...array] : [];
  }

  const result = [...array];
  const [removed] = result.splice(fromIndex, 1);
  result.splice(toIndex, 0, removed);

  return result;
}

/**
 * Divides an array into two arrays based on a predicate
 * @param array Array to partition
 * @param predicate Function that determines which partition an item belongs to
 * @returns Array containing two arrays: items that passed the predicate and items that didn't
 */
export function partitionArray<T>(
  array: T[],
  predicate: (item: T) => boolean
): [T[], T[]] {
  if (!array || !Array.isArray(array)) {
    return [[], []];
  }

  return array.reduce(
    (result, item) => {
      result[predicate(item) ? 0 : 1].push(item);
      return result;
    },
    [[], []] as [T[], T[]]
  );
}

/**
 * Returns a random item from an array
 * @param array Source array
 * @returns Random item from the array or undefined if array is empty
 */
export function getRandomItem<T>(array: T[]): T | undefined {
  if (!array || !Array.isArray(array) || array.length === 0) {
    return undefined;
  }

  const index = Math.floor(Math.random() * array.length);
  return array[index];
}

/**
 * Compare two arrays for equality
 * @param array1 First array
 * @param array2 Second array
 * @param compareFn Optional function to compare items
 * @returns Boolean indicating if arrays are equal
 */
export function areArraysEqual<T>(
  array1: T[],
  array2: T[],
  compareFn?: (a: T, b: T) => boolean
): boolean {
  if (array1 === array2) {
    return true;
  }

  if (!array1 || !array2 || array1.length !== array2.length) {
    return false;
  }

  if (compareFn) {
    return array1.every((item, index) => compareFn(item, array2[index]));
  }

  return array1.every((item, index) => item === array2[index]);
}
