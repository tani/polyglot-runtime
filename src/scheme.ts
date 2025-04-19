import type { Polyglot } from "./common.ts";
import BiwaScheme from "biwascheme";

export function run(polyglot: Polyglot, code: string): Promise<unknown> {
  BiwaScheme.define_libfunc("polyglot-call", 2, 2, (args: unknown) => {
    if (!Array.isArray(args) || args.length !== 2) {
      throw new BiwaScheme.Error("polyglot-call expects exactly 2 arguments");
    }

    const [lang, snippet] = args;

    if (typeof lang !== "string") {
      throw new BiwaScheme.Error(
        "First argument to polyglot-call must be a string",
      );
    }

    if (typeof snippet !== "string") {
      throw new BiwaScheme.Error(
        "Second argument to polyglot-call must be a string",
      );
    }

    return new BiwaScheme.Pause(
      (pause: { resume: (obj: unknown) => unknown }) => {
        polyglot.call(lang, snippet)
          .then((res) => {
            pause.resume(res);
          })
          .catch((err) => {
            throw new BiwaScheme.Error(`Promise rejected: ${err}`);
          });
      },
    );
  });

  const biwa = new BiwaScheme.Interpreter((err: unknown) => {
    if (err instanceof Error) {
      throw err;
    } else {
      throw new Error(String(err));
    }
  });

  return new Promise((resolve, reject) =>
    biwa.evaluate(`(begin ${code})`, resolve, reject)
  );
}
