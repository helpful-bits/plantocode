/**
 * Utility functions for object manipulation
 */

/**
 * Type-safe deep clone function
 * @param obj Object to clone
 * @returns Deep cloned copy of the object
 */
export function deepClone<T>(obj: T): T {
  if (obj === null || typeof obj !== "object") {
    return obj;
  }

  // Handle Date
  if (obj instanceof Date) {
    return new Date(obj.getTime()) as T;
  }

  // Handle Array
  if (Array.isArray(obj)) {
    const clonedArray = obj.map((item) => deepClone(item));
    return clonedArray as unknown as T;
  }

  // Handle Object
  if (obj instanceof Object) {
    const copy: Record<string, unknown> = {};
    Object.keys(obj).forEach((key) => {
      copy[key] = deepClone((obj as Record<string, unknown>)[key]);
    });
    return copy as T;
  }

  throw new Error(`Unable to copy object: ${String(obj)}`);
}

/**
 * Deep merges multiple objects
 * @param objects Objects to merge
 * @returns Merged object
 */
export function deepMerge<T extends Record<string, unknown>>(...objects: T[]): T {
  if (objects.length === 0) return {} as T;
  if (objects.length === 1) return deepClone(objects[0]);

  const target = deepClone(objects[0]);

  for (let i = 1; i < objects.length; i++) {
    const source = objects[i];

    for (const key in source) {
      if (Object.prototype.hasOwnProperty.call(source, key)) {
        const sourceValue = source[key];
        const targetValue = target[key];

        if (
          targetValue &&
          sourceValue &&
          typeof targetValue === "object" &&
          typeof sourceValue === "object" &&
          !Array.isArray(targetValue) &&
          !Array.isArray(sourceValue)
        ) {
          // Use type assertion to handle the target key assignment properly
          const mergedValue = deepMerge(
            targetValue as Record<string, unknown>,
            sourceValue as Record<string, unknown>
          );
          target[key] = mergedValue as T[Extract<keyof T, string>];
        } else {
          target[key] = deepClone(sourceValue);
        }
      }
    }
  }

  return target;
}

/**
 * Checks if two objects are deeply equal
 * @param obj1 First object
 * @param obj2 Second object
 * @returns True if objects are deeply equal
 */
export function isDeepEqual(obj1: unknown, obj2: unknown): boolean {
  // Check if both are the same value or reference
  if (obj1 === obj2) {
    return true;
  }

  // If either is null or not an object, they're not equal
  if (
    obj1 === null ||
    obj2 === null ||
    typeof obj1 !== "object" ||
    typeof obj2 !== "object"
  ) {
    return false;
  }

  // Handle Date objects
  if (obj1 instanceof Date && obj2 instanceof Date) {
    return obj1.getTime() === obj2.getTime();
  }

  // Handle Array objects
  if (Array.isArray(obj1) && Array.isArray(obj2)) {
    if (obj1.length !== obj2.length) {
      return false;
    }

    for (let i = 0; i < obj1.length; i++) {
      if (!isDeepEqual(obj1[i], obj2[i])) {
        return false;
      }
    }

    return true;
  }

  // Handle regular objects
  const typedObj1 = obj1 as Record<string, unknown>;
  const typedObj2 = obj2 as Record<string, unknown>;
  
  const keys1 = Object.keys(typedObj1);
  const keys2 = Object.keys(typedObj2);

  if (keys1.length !== keys2.length) {
    return false;
  }

  for (const key of keys1) {
    if (!Object.prototype.hasOwnProperty.call(typedObj2, key)) {
      return false;
    }

    if (!isDeepEqual(typedObj1[key], typedObj2[key])) {
      return false;
    }
  }

  return true;
}

/**
 * Gets a value at a path in an object
 * @param obj Object to get value from
 * @param path Path to the value (e.g., 'user.address.city')
 * @param defaultValue Default value if path doesn't exist
 * @returns Value at path or default value
 */
export function get<T, R = unknown>(
  obj: Record<string, unknown>,
  path: string,
  defaultValue?: T
): T | R | undefined {
  if (!obj || !path) {
    return defaultValue;
  }

  const parts = typeof path === "string" ? path.split(".") : path;
  let result: unknown = obj;

  for (let i = 0; i < parts.length; i++) {
    if (result === null || result === undefined) {
      return defaultValue;
    }

    result = (result as Record<string, unknown>)[parts[i]];
  }

  return (result === undefined ? defaultValue : result) as T | R;
}

/**
 * Sets a value at a path in an object
 * @param obj Object to set value in
 * @param path Path to set the value at (e.g., 'user.address.city')
 * @param value Value to set
 * @returns Modified object
 */
export function set<T extends Record<string, unknown>>(
  obj: T,
  path: string,
  value: unknown
): T {
  if (!obj || !path) {
    return obj;
  }

  const result = { ...obj };
  const parts = path.split(".");
  let current: Record<string, unknown> = result;

  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i];

    if (!current[part] || typeof current[part] !== "object") {
      current[part] = {};
    }

    current = current[part] as Record<string, unknown>;
  }

  current[parts[parts.length - 1]] = value;
  return result;
}

/**
 * Picks specified properties from an object
 * @param obj Source object
 * @param keys Keys to pick
 * @returns New object with picked properties
 */
export function pick<T extends Record<string, unknown>, K extends keyof T>(
  obj: T,
  keys: K[]
): Pick<T, K> {
  const result = {} as Pick<T, K>;

  keys.forEach((key) => {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      result[key] = obj[key];
    }
  });

  return result;
}

/**
 * Omits specified properties from an object
 * @param obj Source object
 * @param keys Keys to omit
 * @returns New object without omitted properties
 */
export function omit<T extends Record<string, unknown>, K extends keyof T>(
  obj: T,
  keys: K[]
): Omit<T, K> {
  const result = { ...obj };

  keys.forEach((key) => {
    delete result[key];
  });

  return result;
}

/**
 * Safely serializes an object to JSON, handling circular references
 * @param obj Object to serialize
 * @param space Indentation spaces
 * @returns JSON string
 */
export function safeStringify(obj: unknown, space?: number): string {
  const seen = new WeakSet<object>();

  return JSON.stringify(
    obj,
    (_key, value) => {
      if (typeof value === "object" && value !== null) {
        if (seen.has(value as object)) {
          return "[Circular]";
        }
        seen.add(value as object);
      }
      return value as unknown;
    },
    space
  );
}

/**
 * Flattens an object into a single-level object with path keys
 * @param obj Object to flatten
 * @param prefix Prefix for keys
 * @returns Flattened object
 */
export function flattenObject(
  obj: Record<string, unknown>,
  prefix = ""
): Record<string, unknown> {
  return Object.keys(obj).reduce(
    (acc, key) => {
      const prefixedKey = prefix ? `${prefix}.${key}` : key;
      const value = obj[key];

      if (
        typeof value === "object" &&
        value !== null &&
        !Array.isArray(value) &&
        Object.keys(value as Record<string, unknown>).length > 0
      ) {
        Object.assign(acc, flattenObject(value as Record<string, unknown>, prefixedKey));
      } else {
        acc[prefixedKey] = value;
      }

      return acc;
    },
    {} as Record<string, unknown>
  );
}

/**
 * Unflatten a single-level object with path keys into a nested object
 * @param obj Flattened object
 * @returns Nested object
 */
export function unflattenObject(obj: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  for (const key in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      set(result, key, obj[key]);
    }
  }

  return result;
}