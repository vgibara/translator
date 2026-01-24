export interface StringNode {
  path: string[];
  value: string;
}

/**
 * Recursively traverses a JSON object and extracts all string values along with their paths.
 */
export function extractStrings(obj: any, path: string[] = []): StringNode[] {
  let strings: StringNode[] = [];

  if (typeof obj === 'string') {
    strings.push({ path, value: obj });
  } else if (Array.isArray(obj)) {
    for (let i = 0; i < obj.length; i++) {
      strings = strings.concat(extractStrings(obj[i], [...path, i.toString()]));
    }
  } else if (obj !== null && typeof obj === 'object') {
    for (const key in obj) {
      if (Object.prototype.hasOwnProperty.call(obj, key)) {
        strings = strings.concat(extractStrings(obj[key], [...path, key]));
      }
    }
  }

  return strings;
}

/**
 * Reconstructs a JSON object by replacing strings at specific paths with translated versions.
 */
export function reconstructJson(originalObj: any, translatedNodes: StringNode[]): any {
  const newObj = JSON.parse(JSON.stringify(originalObj)); // Deep clone

  for (const node of translatedNodes) {
    let current = newObj;
    for (let i = 0; i < node.path.length - 1; i++) {
      current = current[node.path[i]];
    }
    current[node.path[node.path.length - 1]] = node.value;
  }

  return newObj;
}
