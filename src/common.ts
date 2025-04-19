export interface Polyglot {
  call(lang: string, code: string): Promise<unknown>;
}

