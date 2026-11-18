import { Types } from 'mongoose';

/**
 * In-memory stand-in for the User model, covering only the filters / updates that
 * TwoFactorService uses: equality on (dotted) paths, array contains, $ne, $exists, $lt, $or;
 * updates $set (dotted or whole field), $unset, $pull. Each updateOne is atomic, like MongoDB.
 */
export type Doc = Record<string, unknown> & { _id: Types.ObjectId };
type Filter = Record<string, unknown>;

const getPath = (doc: Doc, path: string): unknown =>
  path
    .split('.')
    .reduce<unknown>(
      (value, key) =>
        value && typeof value === 'object'
          ? (value as Record<string, unknown>)[key]
          : undefined,
      doc,
    );

const isOperator = (value: unknown): value is Record<string, unknown> =>
  !!value &&
  typeof value === 'object' &&
  !(value instanceof Types.ObjectId) &&
  !(value instanceof Date) &&
  !Array.isArray(value) &&
  Object.keys(value).every((k) => k.startsWith('$'));

const equals = (a: unknown, b: unknown) =>
  a instanceof Types.ObjectId || b instanceof Types.ObjectId
    ? String(a) === String(b)
    : a === b;

const matchValue = (actual: unknown, expected: unknown): boolean => {
  if (isOperator(expected)) {
    return Object.entries(expected).every(([op, arg]) => {
      switch (op) {
        case '$ne':
          return !matchValue(actual, arg);
        case '$exists':
          return (actual !== undefined) === arg;
        case '$lt':
          return typeof actual === 'number' && actual < (arg as number);
        default:
          throw new Error(`fake model: unsupported operator ${op}`);
      }
    });
  }
  if (Array.isArray(actual)) return actual.some((v) => equals(v, expected));
  return equals(actual, expected);
};

export const matches = (doc: Doc, filter: Filter): boolean =>
  Object.entries(filter).every(([key, expected]) =>
    key === '$or'
      ? (expected as Filter[]).some((f) => matches(doc, f))
      : matchValue(getPath(doc, key), expected),
  );

const setPath = (doc: Doc, path: string, value: unknown) => {
  const keys = path.split('.');
  let target = doc as Record<string, unknown>;
  for (const key of keys.slice(0, -1)) {
    if (!target[key] || typeof target[key] !== 'object') target[key] = {};
    target = target[key] as Record<string, unknown>;
  }
  target[keys[keys.length - 1]] = value;
};

const unsetPath = (doc: Doc, path: string) => {
  const keys = path.split('.');
  const parent = getPath(doc, keys.slice(0, -1).join('.')) ?? doc;
  if (parent && typeof parent === 'object') {
    delete (parent as Record<string, unknown>)[keys[keys.length - 1]];
  }
};

// Deep copy that keeps ObjectId / Date instances (structuredClone would drop the class)
const clone = <T>(value: T): T => {
  if (value instanceof Types.ObjectId) return value;
  if (value instanceof Date) return new Date(value.getTime()) as T;
  if (Array.isArray(value)) return value.map(clone) as T;
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [k, clone(v)]),
    ) as T;
  }
  return value;
};

export class FakeUserModel {
  readonly docs: Doc[] = [];

  add(doc: Doc) {
    this.docs.push(clone(doc));
  }

  get(id: Types.ObjectId | string): Doc | undefined {
    return this.docs.find((d) => String(d._id) === String(id));
  }

  private query(doc: Doc | undefined) {
    const chain = {
      select: () => chain,
      lean: () => Promise.resolve(doc ? clone(doc) : null),
    };
    return chain;
  }

  findById(id: string) {
    return this.query(this.get(id));
  }

  findOne(filter: Filter) {
    return this.query(this.docs.find((d) => matches(d, filter)));
  }

  exists(filter: Filter) {
    const doc = this.docs.find((d) => matches(d, filter));
    return Promise.resolve(doc ? { _id: doc._id } : null);
  }

  updateOne(filter: Filter, update: Record<string, Record<string, unknown>>) {
    const doc = this.docs.find((d) => matches(d, filter));
    if (!doc) return Promise.resolve({ matchedCount: 0, modifiedCount: 0 });
    const before = JSON.stringify(doc);
    for (const [op, fields] of Object.entries(update)) {
      for (const [path, value] of Object.entries(fields)) {
        if (op === '$set') setPath(doc, path, clone(value));
        else if (op === '$unset') unsetPath(doc, path);
        else if (op === '$pull') {
          const list = getPath(doc, path);
          if (Array.isArray(list)) {
            setPath(
              doc,
              path,
              list.filter((v) => !equals(v, value)),
            );
          }
        } else throw new Error(`fake model: unsupported update ${op}`);
      }
    }
    const modified = JSON.stringify(doc) !== before ? 1 : 0;
    return Promise.resolve({ matchedCount: 1, modifiedCount: modified });
  }
}
