import type { Polyglot} from "./common.ts";
import { DefaultRubyVM } from "@ruby/wasm-wasi/dist/browser";

const response = await fetch(
  import.meta.resolve("@ruby/3.4-wasm-wasi/dist/ruby+stdlib.wasm"),
);

const module = await WebAssembly.compileStreaming(response);

type GlobalWithPolyglot = typeof globalThis & {
  RubyPolyglot: Polyglot;
};

export async function run(polyglot: Polyglot, code: string): Promise<unknown> {
  (globalThis as unknown as GlobalWithPolyglot).RubyPolyglot = polyglot;
  const { vm } = await DefaultRubyVM(module);
  await vm.evalAsync(`
    require "js"
    module Polyglot
      def self.call(lang, code)
        JS.global[:RubyPolyglot].call(
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
