'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { select, scaleBand, scaleLinear, axisLeft, axisBottom, max, format } from 'd3';
import { useResizeObserver } from '@/hooks/useResizeObserver';

export interface ModelWer {
  id: string;
  label: string;
  vendor: string;
  wer: number;
}

interface WERBarChartProps {
  data: ModelWer[];
  highlightId?: string;
  title?: string;
  desc?: string;
  className?: string;
}

export function WERBarChart({
  data,
  highlightId = 'gpt-4o-transcribe',
  title = 'Word Error Rate by Model',
  desc = 'Lower is better.',
  className
}: WERBarChartProps) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const { width } = useResizeObserver(wrapperRef as React.RefObject<HTMLElement>);
  const height = 320;
  const margin = { top: 24, right: 16, bottom: 56, left: 48 };

  const xDomain = useMemo(() => data.map((d: ModelWer) => d.label), [data]);
  const yDomainMax = useMemo(() => Math.max(10, Math.ceil((max(data, (d: ModelWer) => d.wer) ?? 0) / 2) * 2), [data]);
  const x = useMemo(() => scaleBand().domain(xDomain).padding(0.2), [xDomain]);
  const y = useMemo(() => scaleLinear().domain([0, yDomainMax]).nice(), [yDomainMax]);

  const [tooltip, setTooltip] = useState<null | { x: number; y: number; text: string }>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (!svgRef.current || !width) return;
    const w = Math.max(280, width);
    const h = height;
    const innerW = w - margin.left - margin.right;
    const innerH = h - margin.top - margin.bottom;

    x.range([0, innerW]);
    y.range([innerH, 0]);

    const svg = select(svgRef.current)
      .attr('viewBox', `0 0 ${w} ${h}`)
      .attr('role', 'img')
      .attr('aria-labelledby', 'werChartTitle werChartDesc');

    svg.selectAll('*').remove();
    const g = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`);

    const yAxis = axisLeft(y).ticks(5).tickFormat((d) => `${format('.1f')(Number(d))}%`);
    const xAxis = axisBottom(x);

    g.append('g').attr('class', 'y-axis').call(yAxis);
    g.append('g')
      .attr('class', 'x-axis')
      .attr('transform', `translate(0,${innerH})`)
      .call(xAxis)
      .selectAll('text')
      .style('font-size', '12px')
      .style('text-anchor', 'end')
      .attr('transform', 'rotate(-30)');

    g.selectAll('rect.bar')
      .data(data)
      .enter()
      .append('rect')
      .attr('class', 'bar')
      .attr('x', (d: ModelWer) => x(d.label) ?? 0)
      .attr('width', x.bandwidth())
      .attr('y', (d: ModelWer) => y(d.wer))
      .attr('height', (d: ModelWer) => innerH - y(d.wer))
      .attr('rx', 4)
      .attr('fill', (d: ModelWer) => d.id === highlightId ? 'var(--tw-color-primary, hsl(221 83% 53%))' : 'hsl(215 20% 65%)')
      .attr('tabindex', 0 as any)
      .attr('role', 'graphics-symbol')
      .attr('aria-label', (d: ModelWer) => `${d.label} WER ${format('.1f')(d.wer)} percent`)
      .on('focus mousemove', function (event: any, d: ModelWer) {
        const [mx, my] = [event.offsetX ?? 0, event.offsetY ?? 0];
        setTooltip({
          x: mx + 16,
          y: my + 16,
          text: `${d.label} (${d.vendor}): ${format('.1f')(d.wer)}% — lower is better`
        });
      })
      .on('blur mouseleave', () => setTooltip(null));

    const hd = data.find(d => d.id === highlightId);
    if (hd) {
      const cx = (x(hd.label) ?? 0) + x.bandwidth() / 2;
      const cy = y(hd.wer);
      g.append('text')
        .attr('x', cx)
        .attr('y', Math.max(0, cy - 10))
        .attr('text-anchor', 'middle')
        .attr('fill', 'currentColor')
        .style('font-size', '12px')
        .text(hd.label);
    }

    svg.append('title').attr('id', 'werChartTitle').text(title);
    svg.append('desc').attr('id', 'werChartDesc').text(desc);
  }, [data, width, x, y, yDomainMax, title, desc, highlightId]);

  return (
    <div ref={wrapperRef} className={className ?? ''} style={{ position: 'relative' }}>
      <svg ref={svgRef} />
      {tooltip && (
        <div
          style={{ position: 'absolute', left: tooltip.x, top: tooltip.y }}
          className="rounded-md bg-black/70 text-white px-2 py-1 text-xs pointer-events-none"
        >
          {tooltip.text}
        </div>
      )}
    </div>
  );
}
