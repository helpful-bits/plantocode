varying float vAlpha;
varying vec3 vColor;
varying float vHasTarget;
varying vec3 vVelocity;
varying float vNearestAngle;

void main() {
  vec2 center = gl_PointCoord - vec2(0.5);
  
  // Rotate coordinates based on velocity for stretching effect
  float velocityAngle = atan(vVelocity.y, vVelocity.x);
  float cosAngle = cos(velocityAngle);
  float sinAngle = sin(velocityAngle);
  vec2 rotatedCenter = vec2(
    center.x * cosAngle - center.y * sinAngle,
    center.x * sinAngle + center.y * cosAngle
  );
  
  // Apply stretch based on velocity magnitude
  float velocityMag = length(vVelocity);
  float stretch = 1.0 + velocityMag * 0.3;
  rotatedCenter.x /= stretch;
  
  float distance = length(rotatedCenter);
  
  if (distance > 0.5) {
    discard;
  }
  
  float innerGlow = 1.0 - smoothstep(0.0, 0.2, distance);
  float outerGlow = 1.0 - smoothstep(0.2, 0.5, distance);
  
  // Add teal hunting glow when chasing a target
  float huntGlow = 0.0;
  if (vHasTarget > 0.5) {
    huntGlow = innerGlow * 0.3 * (0.5 + sin(vNearestAngle * 3.0) * 0.5);
  }
  
  float alpha = (innerGlow * 0.9 + outerGlow * 0.3) * vAlpha;
  vec3 finalColor = vColor + (innerGlow * 0.3) + vec3(0.0, huntGlow * 0.8, huntGlow * 0.7);
  
  gl_FragColor = vec4(finalColor, alpha);
}