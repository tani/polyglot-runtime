import type { Polyglot } from "./common.ts";
import * as lua from "./lua.ts";
import * as ruby from "./ruby.ts";
import * as python from "./python.ts";
import * as scheme from "./scheme.ts";
import * as javascript from "./javascript.ts";
import * as clojure from "./clojure.ts";

export const polyglot: Polyglot = {
  call: (lang: string, code: string): Promise<unknown> => {
    switch (lang) {
      case "lua":
        return lua.run(polyglot, code);
      case "python":
        return python.run(polyglot, code);
      case "ruby":
        return ruby.run(polyglot, code);
      case "scheme":
        return scheme.run(polyglot, code);
      case "javascript":
        return javascript.run(polyglot, code);
      case "clojure":
        return clojure.run(polyglot, code);
      default:
        throw new Error(`Unsupported language '${lang}'.`);
    }
  },
};

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
