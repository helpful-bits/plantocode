#ifdef GL_FRAGMENT_PRECISION_HIGH
  precision highp float;
#else
  precision mediump float;
#endif

uniform float uTime;
uniform float uIsDark;
uniform vec3 uLeaderColor;

in float vAlpha;
in vec3 vColor;
in vec3 vVelocity;
in float vIsLeader;


layout(location = 0) out vec4 fragColor;

// Simple triangle/chevron shape
float sdTriangle(vec2 p) {
  // Create a simple triangle pointing right
  float k = 0.5;
  p.x = abs(p.x) - 0.3;
  p.y = p.y + 0.5;
  if (p.x + k * p.y > 0.0) {
    vec2 q = vec2(p.x - k * p.y, -k * p.x - p.y) / sqrt(1.0 + k * k);
    p = vec2(clamp(q.x, -0.3, 0.3), q.y);
  }
  return -length(p) * sign(p.y);
}

void main() {
  if (vIsLeader > 0.5) {
    // Leaders: render as a crisp chevron using SDF
    vec2 coord = gl_PointCoord - vec2(0.5);
    coord *= 2.0; // Scale to [-1, 1]
    
    // Get velocity direction
    vec2 dir = normalize(vVelocity.xy);
    if (length(dir) < 0.1) dir = vec2(1.0, 0.0); // Default direction if stationary
    
    // Rotate coordinate system to align with velocity
    float angle = atan(dir.y, dir.x);
    float c = cos(-angle);
    float s = sin(-angle);
    vec2 rotatedCoord = vec2(
      coord.x * c - coord.y * s,
      coord.x * s + coord.y * c
    );
    
    // Simple approach: just render a circle for now to debug
    float dist = length(coord);
    float circle = 1.0 - smoothstep(0.3, 0.4, dist);
    
    // Add a simple directional indicator
    float arrow = step(0.0, rotatedCoord.x) * (1.0 - smoothstep(0.1, 0.2, abs(rotatedCoord.y)));
    
    float alpha = max(circle * 0.8, arrow * circle);
    
    // Use unified leader color
    vec3 finalColor = uLeaderColor;
    fragColor = vec4(finalColor, alpha);
  } else {
    // Followers: existing glow effect
    float glow = pow(1.0 - smoothstep(0.0, 0.5, length(gl_PointCoord - vec2(0.5))), 2.0);
    fragColor = vec4(vColor, vAlpha * glow);
  }
}