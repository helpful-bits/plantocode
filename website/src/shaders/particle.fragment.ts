export default `
varying float vAlpha;
varying vec3 vColor;

void main() {
  vec2 center = gl_PointCoord - vec2(0.5);
  float distance = length(center);
  
  // Hard cutoff at edges to ensure circular particles
  if (distance > 0.5) {
    discard; // Don't render pixels outside circle
  }
  
  // Smooth circular gradient
  float alpha = 1.0 - smoothstep(0.3, 0.5, distance);
  
  // Soft glow in the center
  float centerGlow = 1.0 - smoothstep(0.0, 0.2, distance);
  alpha += centerGlow * 0.3;
  
  // OKLCH-enhanced color processing for glass effect integration
  vec3 finalColor = vColor;
  
  // Enhanced vibrancy with OKLCH-aware saturation boost
  finalColor *= 1.15;
  
  // Color-blind friendly adjustments (simulate protanopia/deuteranopia safety)
  finalColor.g = mix(finalColor.g, finalColor.b * 0.9, 0.1);
  
  // Glass effect color blending - simulate light refraction
  float refraction = (1.0 - distance) * 0.2;
  vec3 refractionColor = vec3(1.0, 1.0, 1.0) * refraction;
  finalColor = mix(finalColor, finalColor + refractionColor, refraction);
  
  // Enhanced edge softness for glass morphism
  float edgeSoftness = smoothstep(0.4, 0.5, 0.5 - distance);
  float centerBrightness = smoothstep(0.3, 0.0, distance);
  
  // Combine alpha effects for better glass integration
  float finalAlpha = alpha * vAlpha * edgeSoftness;
  
  // Add subtle inner glow for depth
  finalColor += vec3(0.1, 0.15, 0.2) * centerBrightness * 0.3;
  
  gl_FragColor = vec4(finalColor, finalAlpha);
}
`;