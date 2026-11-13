/**
 * Watch an object with a proxy, only fires if property value is different
 */
export function watch<T extends object>(type: T, change: (type: T) => any): T {
  if (!type) {
    return type;
  }
  if ((type as any).__isProxy === undefined) {
    // expando hack to mark a proxy
    return new Proxy(type, {
      set: (obj, prop, value) => {
        // The default behavior to store the value
        if ((obj as any)[prop] !== value) {
          (obj as any)[prop] = value;
          // Avoid watching private junk
          if (typeof prop === 'string') {
            if (prop[0] !== '_') {
              change(obj);
            }
          }
        }
        // Indicate success
        return true;
      },
      get: (obj, prop) => {
        if (prop !== '__isProxy') {
          return (obj as any)[prop];
        }
        return true;
      }
    });
  }
  return type;
}

const createHandler = <T>(path: string[] = [], change: (type: T) => any, typeType: T) => {
  // one proxy per nested object, kept for as long as the property holds that object
  const nested = new Map<string, { value: object; proxy: object }>();
  return {
    get: (target: T, key: string): any => {
      if (key === '__isProxy') {
        return true;
      }
      const value = (target as any)[key];
      if (typeof value === 'object' && value != null) {
        let entry = nested.get(key);
        if (!entry || entry.value !== value) {
          entry = { value, proxy: new Proxy(value, createHandler<any>([...path, key as string], change, typeType)) };
          nested.set(key, entry);
        }
        return entry.proxy;
      }
      return value;
    },
    set: (target: T, key: string, value: any) => {
      if (typeof key === 'string') {
        if (key[0] !== '_') {
          change(typeType);
        }
      }
      (target as any)[key] = value;
      return true;
    }
  };
};

/**
 *
 */
export function watchDeep<T extends object>(type: T, change: (type: T) => any): T {
  if (!type) {
    return type;
  }
  if ((type as any).__isProxy === undefined) {
    // expando hack to mark a proxy
    return new Proxy(type, createHandler<T>([], change, type));
  }
  return type;
}

/**
 * Watch an object with a proxy, fires change on any property value change
 */
export function watchAny<T extends object>(type: T, change: (type: T) => any): T {
  if (!type) {
    return type;
  }
  if ((type as any).__isProxy === undefined) {
    // expando hack to mark a proxy
    return new Proxy(type, {
      set: (obj, prop, value) => {
        // The default behavior to store the value
        (obj as any)[prop] = value;
        // Avoid watching private junk
        if (typeof prop === 'string') {
          if (prop[0] !== '_') {
            change(obj);
          }
        }

        // Indicate success
        return true;
      },
      get: (obj, prop) => {
        if (prop !== '__isProxy') {
          return (obj as any)[prop];
        }
        return true;
      }
    });
  }
  return type;
}
