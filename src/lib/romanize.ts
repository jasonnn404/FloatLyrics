import Kuroshiro from "kuroshiro";
import KuromojiAnalyzer from "kuroshiro-analyzer-kuromoji";
import { transliterate } from "transliteration";
import type { LyricLine } from "./lyrics";

const japaneseCharacterPattern = /[\u3040-\u30ff]/;
const koreanCharacterPattern = /[\uac00-\ud7af]/;
const nonLatinCharacterPattern = /[^\u0000-\u024f\s\d\p{P}\p{S}]/u;

let japaneseRomanizer: Promise<Kuroshiro> | null = null;

export async function romanizeLyrics(lines: LyricLine[]): Promise<LyricLine[]> {
  if (!lines.some((line) => nonLatinCharacterPattern.test(line.text))) return [];

  const isJapanese = lines.some((line) => japaneseCharacterPattern.test(line.text));
  const texts = isJapanese
    ? await romanizeJapanese(lines.map((line) => line.text))
    : lines.map((line) => transliterate(line.text));

  const romanizedLines = lines.map((line, index) => ({
    ...line,
    text: normalizeRomanization(texts[index] ?? line.text)
  }));

  return romanizedLines.some((line, index) => line.text !== lines[index].text)
    ? romanizedLines
    : [];
}

async function romanizeJapanese(texts: string[]) {
  const romanizer = await getJapaneseRomanizer();

  return Promise.all(
    texts.map((text) =>
      koreanCharacterPattern.test(text)
        ? transliterate(text)
        : romanizer.convert(text, { to: "romaji", mode: "spaced" })
    )
  );
}

function getJapaneseRomanizer() {
  if (!japaneseRomanizer) {
    japaneseRomanizer = (async () => {
      const romanizer = new Kuroshiro();
      const dictionaryUrl = new URL("dict/", window.location.href).toString();
      await romanizer.init(new KuromojiAnalyzer({ dictPath: dictionaryUrl }));
      return romanizer;
    })();
  }

  return japaneseRomanizer;
}

function normalizeRomanization(value: string) {
  return value.replace(/\s+/g, " ").trim();
}
