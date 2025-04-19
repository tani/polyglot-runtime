import type { Polyglot } from './common.ts';
import { compileString } from "squint-cljs";
import * as squint_core from "squint-cljs/core.js";

export function run(polyglot: Polyglot, code: string): Promise<unknown> {
  const jsExpr = compileString(`(do ${code})`, {
    context: "expr",
    "elide-imports": true,
    "elide-exports": true,
  });
  const jsFunc = new Function("polyglot", "squint_core", `return (${jsExpr});`);
  return Promise.resolve(jsFunc(polyglot, polyglot, squint_core));
}
