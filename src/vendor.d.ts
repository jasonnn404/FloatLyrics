declare module "kuroshiro" {
  type KuroshiroAnalyzer = {
    init: () => Promise<void>;
    parse: (text: string) => Promise<unknown[]>;
  };

  export default class Kuroshiro {
    init(analyzer: KuroshiroAnalyzer): Promise<void>;
    convert(
      text: string,
      options: { to: "hiragana" | "katakana" | "romaji"; mode?: "normal" | "spaced" | "okurigana" }
    ): Promise<string>;
  }
}

declare module "kuroshiro-analyzer-kuromoji" {
  export default class KuromojiAnalyzer {
    constructor(options?: { dictPath?: string });
    init(): Promise<void>;
    parse(text: string): Promise<unknown[]>;
  }
}
