'use client';

import { useEffect, useMemo, useState } from 'react';
import { WERExplainer } from './WERExplainer';
import { WERBarChart, type ModelWer } from '@/components/visualizations/WERBarChart';

interface Dataset {
  unit: string;
  models: ModelWer[];
  benchmark?: string;
  note?: string;
}

export interface AccuracySectionProps {
  datasetUrl?: string;
  highlightId?: string;
  className?: string;
}

const FALLBACK: Dataset = {
  unit: 'percent',
  benchmark: 'Mixed-domain technical dictation (placeholder)',
  models: [
    { id: 'primary-transcription', label: 'Primary transcription model', vendor: 'Provider A', wer: 2.1 },
    { id: 'secondary-transcription', label: 'Secondary transcription model', vendor: 'Provider B', wer: 4.0 },
    { id: 'baseline-transcription', label: 'Baseline transcription model', vendor: 'Provider C', wer: 6.2 },
    { id: 'local-baseline', label: 'Local baseline model', vendor: 'Local', wer: 5.5 },
  ],
};

export function AccuracySection({
  datasetUrl = '/data/transcription/wer-benchmarks.json',
  highlightId = 'primary-transcription',
  className
}: AccuracySectionProps) {
  const effectiveUrl =
    typeof window !== 'undefined' && process.env.NEXT_PUBLIC_WER_DATA_URL
      ? process.env.NEXT_PUBLIC_WER_DATA_URL
      : datasetUrl;
  const [data, setData] = useState<Dataset | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    fetch(effectiveUrl, { cache: 'force-cache' })
      .then(r => (r.ok ? r.json() : Promise.reject(new Error(r.statusText))))
      .then((json: Dataset) => {
        if (!active) return;
        if (!json?.models?.length) throw new Error('No models');
        setData(json);
      })
      .catch(() => {
        if (active) {
          setData(FALLBACK);
          setError('Showing placeholder benchmarks.');
        }
      });
    return () => {
      active = false;
    };
  }, [effectiveUrl]);

  const cleanedModels = useMemo(() => (data?.models ?? []).filter(m => typeof m.wer === 'number'), [data]);
  const omitted = (data?.models?.length ?? 0) - cleanedModels.length;

  return (
    <section className={className ?? ''} aria-labelledby="acc-bench">
      <h3 id="acc-bench" className="sr-only">
        Accuracy Benchmarks
      </h3>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <WERExplainer />
        <div>
          <WERBarChart
            data={cleanedModels}
            highlightId={highlightId}
            title="WER comparison"
            desc="Lower is better."
          />
          <p className="mt-3 text-sm text-foreground/80" id="acc-summary">
            {error ? error + ' ' : ''}The highlighted model shows the lowest WER in this benchmark. Even a 1–2%
            absolute WER reduction can remove multiple mistakes per paragraph.
          </p>
          {omitted > 0 && (
            <p className="mt-1 text-xs text-foreground/60">
              Some models missing WER values were omitted.
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
