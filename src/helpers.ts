import GObject from 'gi://GObject';

// Taken from https://github.com/material-shell/material-shell/blob/main/src/utils/gjs.ts
/// Decorator function to call `GObject.registerClass` with the given class.
/// Use like
/// ```
/// @registerGObjectClass
/// export class MyThing extends GObject.Object { ... }
/// ```
export function registerGObjectClass<
  K,
  T extends {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    metaInfo?: GObject.MetaInfo<any, any, any>;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    new (...params: any[]): K;
  },
>(target: T) {
  // Note that we use 'hasOwnProperty' because otherwise we would get inherited meta infos.
  // This would be bad because we would inherit the GObjectName too, which is supposed to be unique.
  if (Object.prototype.hasOwnProperty.call(target, 'metaInfo')) {
    // eslint-disable-next-line
    // @ts-ignore

    return GObject.registerClass<K, T>(
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      target.metaInfo!,
      target
    ) as typeof target;
  } else {
    // eslint-disable-next-line
    // @ts-ignore
    return GObject.registerClass<K, T>(target) as typeof target;
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export interface SignalRepresentationType<A extends any[]> {
  param_types: A;
  accumulator: number;
}

export type SignalsDefinition<T extends string> = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key in T]: SignalRepresentationType<any> | Record<string, never>;
};
