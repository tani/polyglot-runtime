// biwascheme.d.ts （プロジェクト直下に作成）
declare module "biwascheme" {
  export class Pause {
    constructor(thunk: (pause: Pause) => void);
    resume(value?: unknown): void;
  }

  export namespace Interpreter {
    type ErrorHandler = (err: unknown) => void;
  }

  export class Interpreter {
    constructor(onError: Interpreter.ErrorHandler);
    evaluate(
      code: string,
      onSuccess: (value: unknown) => void,
      onError: Interpreter.ErrorHandler,
    ): void;
  }

  export class Error extends globalThis.Error {
  }

  export function define_libfunc(
    name: string,
    min: number,
    max: number,
    fn: (args: unknown[]) => unknown,
  ): void;
}
