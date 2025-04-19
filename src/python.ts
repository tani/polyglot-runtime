import type { Polyglot } from "./common.ts";
import * as pyodideModule from "pyodide";

export async function run(polyglot: Polyglot, code: string): Promise<unknown> {
  const pyodide = await pyodideModule.loadPyodide();
  pyodide.registerJsModule("polyglot", polyglot);
  const result = await pyodide.runPythonAsync(`import polyglot; ${code}`);
  return result && typeof result.toJs === "function" ? result.toJs() : result;
}
