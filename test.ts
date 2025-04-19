import { test } from "@cross/test";
import {
  assertEquals,
  assertRejects,
} from "@std/assert";

// Import the polyglot driver you want to test. Adjust the path if necessary.
import { polyglot } from "./src/index.ts";

/*************************************************
 * 1.  Basic sanity checks for every supported VM *
 *************************************************/

test("javascript ‑ simple arithmetic", async () => {
  const result = await polyglot.call("javascript", "1 + 2");
  assertEquals(result, 3);
});

test("lua ‑ simple arithmetic", async () => {
  const result = await polyglot.call("lua", "return 6 * 7");
  assertEquals(result, 42);
});

test("python ‑ simple arithmetic", async () => {
  const result = await polyglot.call(
    "python",
    "3 * (4 + 2)  # 18",
  );
  assertEquals(result, 18);
});

test("ruby ‑ simple arithmetic", async () => {
  const result = await polyglot.call("ruby", "(8 + 1) * 2");
  assertEquals(result, 18);
});

test("scheme ‑ simple arithmetic", async () => {
  const schemeSrc = "(+ 40 2)";
  const result = await polyglot.call("scheme", schemeSrc);
  assertEquals(result, 42);
});

test("clojure ‑ simple arithmetic", async () => {
  const cljSrc = "(* 3 7)";
  const result = await polyglot.call("clojure", cljSrc);
  assertEquals(result, 21);
});

/*************************************************
 * 2.  Error handling – unsupported language      *
 *************************************************/

test("throws for unsupported language", async () => {
  await assertRejects(
    async () => await polyglot.call("brainfuck" as never, "+"),
    Error,
    "Unsupported language",
  );
});

/*************************************************
 * 3.  Deeply‑nested polyglot interaction         *
 *************************************************/

test(
  "lua → ruby → python → scheme → clojure pipeline", 
  async () => {
    /* The expression evaluates to:
     *   3 * (5 * (7 * (9 * 11)))  = 10 395
     * See README or polyglot example for the full derivation.
     */
    const lua_code = `
ruby_code = [=[
python_code = <<-EOF
scheme_code = """
(define clojure-code "(* 11 13)")
(* 9 (polyglot-call \"clojure\" \"11\"))
"""
7 * await polyglot.call("scheme", scheme_code)
EOF
5 * Polyglot.call("python", python_code).await.to_i
]=]
return 3 * polyglot.call("ruby", ruby_code):await()
`;

    const result = await polyglot.call("lua", lua_code);
    assertEquals(result, 10395);
  },
  { timeout: 20_000 }, // give the WASM VMs plenty of time to spin up
);

/*************************************************
 * 4.  Concurrency – calls can run in parallel    *
 *************************************************/

test("parallel calls are independent", async () => {
  const [jsRes, luaRes] = await Promise.all([
    polyglot.call("javascript", "Math.pow(2, 10)"),
    polyglot.call("lua", "return 2 ^ 10"),
  ]);
  assertEquals(jsRes, 1024);
  assertEquals(luaRes, 1024);
});
