export function CSSLightRays() {
  return (
    <div className="light-rays" aria-hidden="true">
      <div className="light-ray" style={{ '--ray-angle': '5deg' } as React.CSSProperties} />
      <div className="light-ray" style={{ '--ray-angle': '-3deg' } as React.CSSProperties} />
      <div className="light-ray" style={{ '--ray-angle': '2deg' } as React.CSSProperties} />
      <div className="light-ray" style={{ '--ray-angle': '-5deg' } as React.CSSProperties} />
      <div className="light-ray" style={{ '--ray-angle': '4deg' } as React.CSSProperties} />
    </div>
  );
}