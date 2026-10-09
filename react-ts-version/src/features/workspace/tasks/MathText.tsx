import { mathTextParts } from './mathTextParts';

/**
 * A child-facing sentence with every exercise in it isolated left to right
 * (mathTextParts.ts), so "4▢2 − 128 = 314" shows as written and not mirrored.
 * Display only: the data string is unchanged, and the read-aloud keeps the
 * plain text, since speech already follows the logical order.
 */
export function MathText({ text }: { text: string }) {
  return (
    <>
      {mathTextParts(text).map((part, i) =>
        part.ltr ? (
          // One line: an exercise broken across two lines reads as two numbers
          // (live check 4.10.2026: "6,0▢▢ − 2,847 =" | "3,158").
          <bdi key={i} dir="ltr" className="whitespace-nowrap">
            {part.text}
          </bdi>
        ) : (
          part.text
        )
      )}
    </>
  );
}

/**
 * Each sentence of a child-facing text on its own line (Ministry of Education,
 * special-education adaptations: "כל משפט כתוב בשורה נפרדת" — a technical,
 * recommended adaptation; coordinator, 9.10.2026). Display only: the string,
 * its read-aloud and its textContent (one space between sentences) are unchanged.
 * A sentence ends at ".", "?" or "!" followed by a space; an exercise
 * ("1,245 + 328") holds none, so it is never split.
 */
export function splitSentences(text: string): string[] {
  return text.split(/(?<=[.?!])\s+(?=\S)/).filter((s) => s.length > 0);
}

export function SentenceLines({ text }: { text: string }) {
  const sentences = splitSentences(text);
  if (sentences.length <= 1) return <MathText text={text} />;
  return (
    <>
      {sentences.map((s, i) => (
        <span key={i}>
          {i > 0 ? ' ' : null}
          <span className="block">
            <MathText text={s} />
          </span>
        </span>
      ))}
    </>
  );
}
