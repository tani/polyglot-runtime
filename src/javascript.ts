import type { Polyglot } from "./common.ts";
import {
  newQuickJSWASMModuleFromVariant,
  type QuickJSSyncVariant,
} from "quickjs-emscripten-core";

import variant from "@jitl/quickjs-wasmfile-release-sync";

const QuickJS = await newQuickJSWASMModuleFromVariant(
  variant as unknown as QuickJSSyncVariant,
);

export function run(
  polyglot: Polyglot,
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
    return promised.then(vm.unwrapResult).then(vm.dump)
  }

  const ret = vm.dump(handle);
  vm.dispose();
  return ret;
}

