'use client';

import { useMemo } from 'react';

type Op = 'eq' | 'sub' | 'del' | 'ins';

function tokenize(s: string) {
  return s.trim().split(/(\s+|[.,;:()])/).filter(Boolean);
}

function align(ref: string[], hyp: string[]) {
  const m = ref.length, n = hyp.length;
  const dp = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i]![0] = i;
  for (let j = 0; j <= n; j++) dp[0]![j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = ref[i - 1] === hyp[j - 1] ? 0 : 1;
      dp[i]![j] = Math.min(
        dp[i - 1]![j]! + 1,
        dp[i]![j - 1]! + 1,
        dp[i - 1]![j - 1]! + cost
      );
    }
  }
  const ops: { op: Op; ref?: string; hyp?: string }[] = [];
  let i = m, j = n;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && dp[i]?.[j] === dp[i - 1]?.[j - 1] && ref[i - 1] === hyp[j - 1]) {
      ops.unshift({ op: 'eq', ref: ref[i - 1]!, hyp: hyp[j - 1]! });
      i--;
      j--;
    } else if (i > 0 && j > 0 && dp[i]?.[j] === (dp[i - 1]?.[j - 1] ?? 0) + 1) {
      ops.unshift({ op: 'sub', ref: ref[i - 1]!, hyp: hyp[j - 1]! });
      i--;
      j--;
    } else if (i > 0 && dp[i]?.[j] === (dp[i - 1]?.[j] ?? 0) + 1) {
      ops.unshift({ op: 'del', ref: ref[i - 1]! });
      i--;
    } else {
      ops.unshift({ op: 'ins', hyp: hyp[j - 1]! });
      j--;
    }
  }
  return ops;
}

export interface TranscriptPairProps {
  reference?: string;
  gpt?: string;
  competitor?: { label: string; text: string };
  title?: string;
  primaryLabel?: string;
  primaryBadge?: string;
  errorSummaryTemplate?: string;
  impactSummary?: string;
}

const DEFAULT_REF = "Create a Postgres read-replica in us-east-1 with 2 vCPU, 8GB RAM, and enable logical replication; set wal_level=logical and max_wal_senders=10.";
const DEFAULT_GPT = "Create a Postgres read-replica in us-east-1 with 2 vCPU, 8 GB RAM, and enable logical replication; set wal_level=logical and max_wal_senders=10.";
const DEFAULT_COMP = {
  label: "Baseline transcription",
  text: "Create a Postgres replica in us-east with 2 CPUs, 8GB RAM, and enable replication; set wal level logical and max senders equals ten."
};
const DEFAULT_TITLE = "Illustrative Example: Capturing Specifications";
const DEFAULT_PRIMARY_LABEL = "Primary transcription model";
const DEFAULT_PRIMARY_BADGE = "reference-aligned";
const DEFAULT_ERROR_SUMMARY = "Errors — Substitutions: {sub}, Deletions: {del}, Insertions: {ins}. Small errors can flip units or flags.";
const DEFAULT_IMPACT_SUMMARY =
  'Impact: Mishearing "read-replica" as "replica", dropping region suffix "-1", or changing "wal_level=logical" can lead to incorrect deployments or data flows.';

export function TranscriptionComparison({
  reference = DEFAULT_REF,
  gpt = DEFAULT_GPT,
  competitor = DEFAULT_COMP,
  title = DEFAULT_TITLE,
  primaryLabel = DEFAULT_PRIMARY_LABEL,
  primaryBadge = DEFAULT_PRIMARY_BADGE,
  errorSummaryTemplate = DEFAULT_ERROR_SUMMARY,
  impactSummary = DEFAULT_IMPACT_SUMMARY,
}: TranscriptPairProps) {
  const refToks = useMemo(() => tokenize(reference), [reference]);
  const gptToks = useMemo(() => tokenize(gpt), [gpt]);
  const compToks = useMemo(() => tokenize(competitor.text), [competitor]);

  const gptOps = useMemo(() => align(refToks, gptToks), [refToks, gptToks]);
  const compOps = useMemo(() => align(refToks, compToks), [refToks, compToks]);

  const compCounts = useMemo(
    () => ({
      sub: compOps.filter(o => o.op === 'sub').length,
      del: compOps.filter(o => o.op === 'del').length,
      ins: compOps.filter(o => o.op === 'ins').length,
    }),
    [compOps]
  );
  const errorSummaryText = errorSummaryTemplate
    .replace('{sub}', String(compCounts.sub))
    .replace('{del}', String(compCounts.del))
    .replace('{ins}', String(compCounts.ins));

  return (
    <section aria-labelledby="comparison-title" className="space-y-4">
      <h3 id="comparison-title" className="text-lg font-semibold">
        {title}
      </h3>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="p-4 rounded-lg border bg-card">
          <h4 className="font-medium mb-2">{primaryLabel}</h4>
          <p className="text-sm leading-6">
            {gptOps.map((o, idx) => {
              const t = o.hyp ?? o.ref ?? '';
              const isSpec = /\b(us-east-1|vCPU|GB|wal_level=logical|max_wal_senders=10|read-replica)\b/i.test(t);
              return (
                <span key={idx} className={isSpec ? "underline decoration-emerald-500/70 decoration-2" : ""}>
                  {t}
                </span>
              );
            })}
          </p>
          <div className="mt-2 inline-flex items-center gap-2 text-xs text-emerald-600">
            <span className="i-lucide-badge-check" aria-hidden />
            {primaryBadge}
          </div>
        </div>
        <div className="p-4 rounded-lg border bg-card" aria-live="polite">
          <h4 className="font-medium mb-2">{competitor.label}</h4>
          <p className="text-sm leading-6">
            {compOps.map((o, idx) => {
              if (o.op === 'eq') return <span key={idx}>{o.hyp}</span>;
              if (o.op === 'sub')
                return (
                  <span key={idx} className="wer-sub" title="Substitution">
                    {o.hyp}
                  </span>
                );
              if (o.op === 'del')
                return (
                  <span key={idx} className="wer-del" title="Deletion (missing word)">
                    {o.ref}
                  </span>
                );
              return (
                <span key={idx} className="wer-ins" title="Insertion">
                  {o.hyp}
                </span>
              );
            })}
          </p>
          <p className="mt-2 text-xs text-foreground/70">
            {errorSummaryText}
          </p>
        </div>
      </div>
      <p className="text-sm text-foreground/80">
        {impactSummary}
      </p>
    </section>
  );
}
