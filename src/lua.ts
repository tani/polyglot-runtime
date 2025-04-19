import type { Polyglot } from "./common.ts";
import { LuaFactory } from "wasmoon";

const luaFactory = new LuaFactory();
export async function run(polyglot: Polyglot, code: string): Promise<unknown> {
  const lua = await luaFactory.createEngine();
  lua.global.set("polyglot", { call: polyglot.call.bind(polyglot) });
  return await lua.doString(code);
}
