import { LuaFactory } from 'wasmoon';
import * as pyodideModule from "pyodide";
import variant from "npm:@jitl/quickjs-wasmfile-release-sync";
import { DefaultRubyVM } from "@ruby/wasm-wasi/dist/browser.js";
import BiwaScheme from "biwascheme";
import { compileString } from "squint-cljs";
import * as squint_core from "squint-cljs/core.js";
import { newQuickJSWASMModuleFromVariant } from "npm:quickjs-emscripten-core";


// Polyglotインターフェース定義
export interface Polyglot {
  call(lang: string, code: string): Promise<unknown>;
  lua(code: string): Promise<unknown>;
  python(code: string): Promise<unknown>;
  ruby(code: string): Promise<unknown>;
  scheme(code: string): Promise<unknown>;
  javascript(code: string): Promise<unknown>;
  clojure(code: string): Promise<unknown>;
}

// =========================
// Clojure 実行
// =========================
export function runClojure(polyglot: Polyglot, code: string): Promise<unknown> {
  const jsExpr = compileString(`(do ${code})`, {
    context: "expr",
    "elide-imports": true,
    "elide-exports": true,
  });
  const jsFunc = new Function('polyglot', 'squint_core', `return (${jsExpr});`);
  return jsFunc(polyglot, polyglot, squint_core);
}

// =========================
// JavaScript 実行
// =========================
const QuickJS = await newQuickJSWASMModuleFromVariant(variant);

async function runJavaScript(_polyglot: Polyglot, code: string): Promise<unknown> {
  using vm = QuickJS.newContext();

  // 5. ユーザーコードを評価
  const raw = vm.evalCode(code, "eval.js", { type: "global" });
  const handle = vm.unwrapResult(raw);

  // 6. Promise なら待機して結果を返す
  const state = vm.getPromiseState(handle);
  if (state !== undefined) {
    vm.runtime.executePendingJobs();
    const promised = vm.resolvePromise(handle);
    vm.runtime.executePendingJobs();
    const unwrapped = vm.unwrapResult(await promised);
    return vm.dump(unwrapped);
  }

  return vm.dump(handle);
}


// =========================
// Lua 実行
// =========================
const luaFactory = new LuaFactory()
async function runLua(polyglot: Polyglot, code: string): Promise<unknown> {
  const lua = await luaFactory.createEngine();
  await lua.global.set('polyglot', { call: polyglot.call.bind(polyglot) });
  return await lua.doString(code);
}

// =========================
// Python 実行
// =========================
async function runPython(polyglot: Polyglot, code: string): Promise<unknown> {
  const pyodide = await pyodideModule.loadPyodide();
  pyodide.registerJsModule("polyglot", { call: polyglot.call.bind(polyglot) });
  await pyodide.runPythonAsync('import polyglot');
  const result = await pyodide.runPythonAsync(code);
  return result && typeof result.toJs === "function" ? result.toJs() : result;
}

// =========================
// Ruby 実行
// =========================
const response = await fetch(import.meta.resolve("@ruby/3.4-wasm-wasi/dist/ruby+stdlib.wasm"))
const module = await WebAssembly.compileStreaming(response);
async function runRuby(_polyglot: Polyglot, code: string): Promise<unknown> {
  const { vm } = await DefaultRubyVM(module);
  await vm.evalAsync(`
    require "js"
    module Polyglot
      class << self
        def call(lang, code)
          JS.global[:Polyglot].call(lang, code).await
        end
      end
    end
  `);
  const result = await vm.evalAsync(code);
  return result.toJS();
}

// =========================
// Scheme 実行
// =========================
function runScheme(polyglot: Polyglot, code: string): Promise<unknown> {
  BiwaScheme.define_libfunc("polyglot-call", 2, 2, (args: any) => {
    const lang = args[0] as string;
    const snippet = args[1] as string;
    return new BiwaScheme.Pause((pause: any) => {
      polyglot.call(lang, snippet)
        .then((res: unknown) => {
          pause.resume(res);
        })
        .catch((err: unknown) => {
          throw new BiwaScheme.Error(`Promise rejected: ${err}`);
        })
    })
  });
  const biwa = new BiwaScheme.Interpreter((err: unknown) => { throw err; })
  return new Promise((resolve, reject) => biwa.evaluate(`(begin ${code})`, resolve, reject));
}

export const polyglot: Polyglot = {
  call: (lang: string, code: string) => {
    switch (lang) {
      case 'lua': return runLua(polyglot, code);
      case 'python': return runPython(polyglot, code);
      case 'ruby': return runRuby(polyglot, code);
      case 'scheme': return runScheme(polyglot, code);
      case 'javascript': return runJavaScript(polyglot, code);
      case 'clojure': return runClojure(polyglot, code);
      default: throw new Error(`Unsupported language '${lang}'.`);
    }
  },
  lua: code => polyglot.call('lua', code),
  python: code => polyglot.call('python', code),
  ruby: code => polyglot.call('ruby', code),
  scheme: code => polyglot.call('scheme', code),
  javascript: code => polyglot.call('javascript', code),
  clojure: code => polyglot.call('clojure', code),
}
