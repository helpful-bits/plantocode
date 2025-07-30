#ifdef GL_FRAGMENT_PRECISION_HIGH
  precision highp float;
#else
  precision mediump float;
#endif

uniform float uTime;
uniform float uIsDark;
uniform vec3 uLeaderColorDark;
uniform vec3 uLeaderColorLight;

in float vAlpha;
in vec3 vColor;
in vec3 vVelocity;
in float vIsLeader;


layout(location = 0) out vec4 fragColor;

float sdChevron(vec2 p, float w, float t) {
  p.x = abs(p.x);
  return max(abs(p.y + w * p.x) - w * t, -abs(p.y) + t * 0.2);
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
    
    // Calculate SDF chevron
    float d = sdChevron(rotatedCoord, 0.6, 0.1);
    
    // Create the chevron shape using smoothstep
    float chevron = 1.0 - smoothstep(0.0, 0.02, d);
    
    // Apply circular mask
    float alpha = chevron * (1.0 - smoothstep(0.45, 0.5, length(coord)));
    
    // Leader color selection based on theme
    vec3 leaderColor = uIsDark > 0.5 ? uLeaderColorDark : uLeaderColorLight;
    fragColor = vec4(leaderColor, alpha);
  } else {
    // Followers: existing glow effect
    float glow = pow(1.0 - smoothstep(0.0, 0.5, length(gl_PointCoord - vec2(0.5))), 2.0);
    fragColor = vec4(vColor, vAlpha * glow);
  }
}