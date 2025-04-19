import { LuaFactory } from "wasmoon";
import * as pyodideModule from "pyodide";
import variant from "@jitl/quickjs-wasmfile-release-sync";
import { DefaultRubyVM } from "@ruby/wasm-wasi/dist/browser";
import BiwaScheme from "biwascheme";
import { compileString } from "squint-cljs";
import * as squint_core from "squint-cljs/core.js";
import {
  newQuickJSWASMModuleFromVariant,
  type QuickJSSyncVariant,
} from "quickjs-emscripten-core";

export interface Polyglot {
  call(lang: string, code: string): Promise<unknown>;
}

export function runClojure(polyglot: Polyglot, code: string): Promise<unknown> {
  const jsExpr = compileString(`(do ${code})`, {
    context: "expr",
    "elide-imports": true,
    "elide-exports": true,
  });
  const jsFunc = new Function("polyglot", "squint_core", `return (${jsExpr});`);
  return Promise.resolve(jsFunc(polyglot, polyglot, squint_core));
}

const QuickJS = await newQuickJSWASMModuleFromVariant(
  variant as unknown as QuickJSSyncVariant,
);

async function runJavaScript(
  _polyglot: Polyglot,
  code: string,
): Promise<unknown> {
  const vm = QuickJS.newContext();

  const callFn = vm.newFunction("call", (...args) => {
    const lang = vm.dump(args[0]);
    const userCode = vm.dump(args[1]);
    const promise = vm.newPromise();

    polyglot.call(lang, userCode)
      .then((res) => {
        const json = JSON.stringify(res);
        const parsed = vm.evalCode(
          `JSON.parse(${JSON.stringify(json)})`,
          "json.js",
          { type: "global" },
        );
        const resultHandle = vm.unwrapResult(parsed);
        promise.resolve(resultHandle);
        vm.runtime.executePendingJobs();
      })
      .catch((err) => {
        promise.reject(vm.newString(JSON.stringify(err)));
        vm.runtime.executePendingJobs();
      });

    return promise.handle;
  });

  const polyObj = vm.newObject();
  vm.setProp(polyObj, "call", callFn);
  vm.setProp(vm.global, "polyglot", polyObj);

  const raw = vm.evalCode(code, "eval.js", { type: "global" });
  const handle = vm.unwrapResult(raw);

  const state = vm.getPromiseState(handle);
  if (state !== undefined) {
    vm.runtime.executePendingJobs();
    const promised = vm.resolvePromise(handle);
    vm.runtime.executePendingJobs();
    const unwrapped = vm.unwrapResult(await promised);
    return vm.dump(unwrapped);
  }

  const ret = vm.dump(handle);
  vm.dispose();
  return ret;
}

const luaFactory = new LuaFactory();
async function runLua(polyglot: Polyglot, code: string): Promise<unknown> {
  const lua = await luaFactory.createEngine();
  await lua.global.set("polyglot", { call: polyglot.call.bind(polyglot) });
  return await lua.doString(code);
}

async function runPython(polyglot: Polyglot, code: string): Promise<unknown> {
  const pyodide = await pyodideModule.loadPyodide();
  pyodide.registerJsModule("polyglot", polyglot);
  const result = await pyodide.runPythonAsync(`import polyglot; ${code}`);
  return result && typeof result.toJs === "function" ? result.toJs() : result;
}

const response = await fetch(
  import.meta.resolve("@ruby/3.4-wasm-wasi/dist/ruby+stdlib.wasm"),
);
const module = await WebAssembly.compileStreaming(response);
async function runRuby(_polyglot: Polyglot, code: string): Promise<unknown> {
  const { vm } = await DefaultRubyVM(module);
  await vm.evalAsync(`
    require "js"
    module Polyglot
      def self.call(lang, code)
        JS.global[:Polyglot].call(
          :call,
          lang.to_js,
          code.to_js
        )
      end
    end
  `);
  const result = await vm.evalAsync(code);
  return result.toJS();
}

function runScheme(polyglot: Polyglot, code: string): Promise<unknown> {
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

export const polyglot: Polyglot = {
  call: (lang: string, code: string): Promise<unknown> => {
    switch (lang) {
      case "lua":
        return runLua(polyglot, code);
      case "python":
        return runPython(polyglot, code);
      case "ruby":
        return runRuby(polyglot, code);
      case "scheme":
        return runScheme(polyglot, code);
      case "javascript":
        return runJavaScript(polyglot, code);
      case "clojure":
        return runClojure(polyglot, code);
      default:
        throw new Error(`Unsupported language '${lang}'.`);
    }
  },
};

type GlobalWithPolyglot = typeof globalThis & {
  Polyglot: Polyglot;
};
(globalThis as unknown as GlobalWithPolyglot).Polyglot = polyglot;

if (import.meta.main) {
  const lua_code = `
ruby_code = [=[
python_code = <<-EOF
scheme_code = """
(define clojure-code "(* 11 13)")
(* 9 (polyglot-call "clojure" "11"))
"""
7 * await polyglot.call("scheme", scheme_code)
EOF
5 * Polyglot.call("python", python_code).await.to_i
]=]
return 3 * polyglot.call("ruby", ruby_code):await()
`;
  console.log(await polyglot.call("lua", lua_code));
}
