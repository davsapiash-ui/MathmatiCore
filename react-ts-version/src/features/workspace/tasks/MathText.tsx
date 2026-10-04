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
