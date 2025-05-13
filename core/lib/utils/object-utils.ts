/**
 * Utility functions for object manipulation
 */

/**
 * Type-safe deep clone function
 * @param obj Object to clone
 * @returns Deep cloned copy of the object
 */
export function deepClone<T>(obj: T): T {
  if (obj === null || typeof obj !== 'object') {
    return obj;
  }

  // Handle Date
  if (obj instanceof Date) {
    return new Date(obj.getTime()) as any;
  }

  // Handle Array
  if (Array.isArray(obj)) {
    return obj.map(item => deepClone(item)) as any;
  }

  // Handle Object
  if (obj instanceof Object) {
    const copy: Record<string, any> = {};
    Object.keys(obj).forEach(key => {
      copy[key] = deepClone((obj as Record<string, any>)[key]);
    });
    return copy as T;
  }

  throw new Error(`Unable to copy object: ${obj}`);
}

/**
 * Deep merges multiple objects
 * @param objects Objects to merge
 * @returns Merged object
 */
export function deepMerge<T extends Record<string, any>>(...objects: T[]): T {
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
          typeof targetValue === 'object' &&
          typeof sourceValue === 'object' &&
          !Array.isArray(targetValue) &&
          !Array.isArray(sourceValue)
        ) {
          target[key] = deepMerge(targetValue, sourceValue);
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
export function isDeepEqual(obj1: any, obj2: any): boolean {
  // Check if both are the same value or reference
  if (obj1 === obj2) {
    return true;
  }
  
  // If either is null or not an object, they're not equal
  if (
    obj1 === null ||
    obj2 === null ||
    typeof obj1 !== 'object' ||
    typeof obj2 !== 'object'
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
  const keys1 = Object.keys(obj1);
  const keys2 = Object.keys(obj2);
  
  if (keys1.length !== keys2.length) {
    return false;
  }
  
  for (const key of keys1) {
    if (!Object.prototype.hasOwnProperty.call(obj2, key)) {
      return false;
    }
    
    if (!isDeepEqual(obj1[key], obj2[key])) {
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
export function get<T>(obj: any, path: string, defaultValue?: T): T | undefined {
  if (!obj || !path) {
    return defaultValue;
  }
  
  const parts = typeof path === 'string' ? path.split('.') : path;
  let result = obj;
  
  for (let i = 0; i < parts.length; i++) {
    if (result === null || result === undefined) {
      return defaultValue;
    }
    
    result = result[parts[i]];
  }
  
  return result === undefined ? defaultValue : result;
}

/**
 * Sets a value at a path in an object
 * @param obj Object to set value in
 * @param path Path to set the value at (e.g., 'user.address.city')
 * @param value Value to set
 * @returns Modified object
 */
export function set<T extends Record<string, any>>(obj: T, path: string, value: any): T {
  if (!obj || !path) {
    return obj;
  }
  
  const result = { ...obj };
  const parts = path.split('.');
  let current: any = result;
  
  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i];
    
    if (!current[part] || typeof current[part] !== 'object') {
      current[part] = {};
    }
    
    current = current[part];
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
export function pick<T extends Record<string, any>, K extends keyof T>(
  obj: T,
  keys: K[]
): Pick<T, K> {
  const result: any = {};
  
  keys.forEach(key => {
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
export function omit<T extends Record<string, any>, K extends keyof T>(
  obj: T,
  keys: K[]
): Omit<T, K> {
  const result = { ...obj };
  
  keys.forEach(key => {
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
export function safeStringify(obj: any, space?: number): string {
  const seen = new WeakSet();
  
  return JSON.stringify(obj, (key, value) => {
    if (typeof value === 'object' && value !== null) {
      if (seen.has(value)) {
        return '[Circular]';
      }
      seen.add(value);
    }
    return value;
  }, space);
}

/**
 * Flattens an object into a single-level object with path keys
 * @param obj Object to flatten
 * @param prefix Prefix for keys
 * @returns Flattened object
 */
export function flattenObject(obj: Record<string, any>, prefix = ''): Record<string, any> {
  return Object.keys(obj).reduce((acc, key) => {
    const prefixedKey = prefix ? `${prefix}.${key}` : key;
    
    if (
      typeof obj[key] === 'object' &&
      obj[key] !== null &&
      !Array.isArray(obj[key]) &&
      Object.keys(obj[key]).length > 0
    ) {
      Object.assign(acc, flattenObject(obj[key], prefixedKey));
    } else {
      acc[prefixedKey] = obj[key];
    }
    
    return acc;
  }, {} as Record<string, any>);
}

/**
 * Unflatten a single-level object with path keys into a nested object
 * @param obj Flattened object
 * @returns Nested object
 */
export function unflattenObject(obj: Record<string, any>): Record<string, any> {
  const result: Record<string, any> = {};
  
  for (const key in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      set(result, key, obj[key]);
    }
  }
  
  return result;
}