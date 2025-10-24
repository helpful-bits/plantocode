export function WERExplainer() {
  return (
    <section aria-labelledby="wer-definition">
      <h3 id="wer-definition" className="text-lg font-semibold mb-2">
        What is Word Error Rate (WER)?
      </h3>
      <p className="mb-2 text-sm text-foreground/80">
        WER = (Substitutions + Deletions + Insertions) / Reference words. Lower is better.
      </p>
      <ul className="list-disc pl-5 text-sm mb-3">
        <li>Substitution: a word is transcribed incorrectly</li>
        <li>Deletion: a word is omitted</li>
        <li>Insertion: an extra word is added</li>
      </ul>
      <p className="text-sm text-foreground/80">
        In technical workflows, small WER differences can flip flags, units, or constraints—creating ambiguous tickets and rework. High accuracy preserves intent and enables precise, implementation-ready specifications.
      </p>
    </section>
  );
}
