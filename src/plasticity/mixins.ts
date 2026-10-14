export type AnyClass = abstract new (...args: never[]) => unknown;

// Copies prototype members of domain classes onto the assembled class.
// Domain classes must not declare instance fields: only prototypes are copied.
export function applyMixins(target: AnyClass, mixins: AnyClass[]): void {
  const owner = new Map<string, string>();
  for (const mixin of mixins) {
    for (const name of Object.getOwnPropertyNames(mixin.prototype)) {
      if (name === "constructor") continue;
      const previous = owner.get(name);
      if (previous !== undefined) throw new Error(`Mixin member ${name} is defined by both ${previous} and ${mixin.name}`);
      if (Object.prototype.hasOwnProperty.call(target.prototype, name)) throw new Error(`Mixin member ${name} from ${mixin.name} would override ${target.name}`);
      owner.set(name, mixin.name);
      Object.defineProperty(target.prototype, name, Object.getOwnPropertyDescriptor(mixin.prototype, name)!);
    }
  }
}
