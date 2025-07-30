#ifdef GL_FRAGMENT_PRECISION_HIGH
  precision highp float;
#else
  precision mediump float;
#endif
uniform sampler2D texturePosition;
uniform sampler2D textureVelocity;
uniform sampler2D textureAttributes;

uniform float uDeltaTime;
uniform vec2 uViewportBounds;
uniform float uTime;
uniform int uLeaderCount;

layout(location = 0) out vec4 fragColor;

#define FIXED_TIMESTEP 0.016666667 // 1/60s
#define OFF_SCREEN_MARGIN 50.0 // Reduced for quicker wrapping

void main() {
    ivec2 texSize = textureSize(texturePosition, 0);
    vec2 uv = gl_FragCoord.xy / vec2(texSize);
    
    vec4 position = texture(texturePosition, uv);
    vec4 velocity = texture(textureVelocity, uv);
    vec4 attributes = texture(textureAttributes, uv);
    
    vec3 pos = position.xyz;
    float currentLifetime = position.w;
    vec3 vel = velocity.xyz;
    
    float isLeader = attributes.w;
    float randomSeed = attributes.y;
    float initialLifetime = 8.0 + randomSeed * 4.0;
    
    // Decay lifetime faster when moving fast (during scroll)
    float speed = length(vel.xy);
    float lifetimeDecay = 0.1 + smoothstep(50.0, 150.0, speed) * 0.2; // Faster decay when scrolling
    float newLifetime = currentLifetime - FIXED_TIMESTEP * lifetimeDecay;
    
    vec3 newPos = pos + vel * FIXED_TIMESTEP;
    
    // Handle screen wrapping for smooth scroll behavior
    bool needsReset = false;
    
    // Vertical wrapping - important for scroll response
    if (newPos.y > uViewportBounds.y + OFF_SCREEN_MARGIN) {
        newPos.y = -uViewportBounds.y - OFF_SCREEN_MARGIN + 10.0; // Wrap to bottom
    } else if (newPos.y < -uViewportBounds.y - OFF_SCREEN_MARGIN) {
        newPos.y = uViewportBounds.y + OFF_SCREEN_MARGIN - 10.0; // Wrap to top
    }
    
    // Horizontal wrapping
    if (newPos.x > uViewportBounds.x + OFF_SCREEN_MARGIN) {
        newPos.x = -uViewportBounds.x - OFF_SCREEN_MARGIN + 10.0; // Wrap to left
    } else if (newPos.x < -uViewportBounds.x - OFF_SCREEN_MARGIN) {
        newPos.x = uViewportBounds.x + OFF_SCREEN_MARGIN - 10.0; // Wrap to right
    }
    
    // Only reset for lifetime expiration, not position
    if (isLeader < 0.5 && newLifetime <= 0.0) {
        float angle = fract(randomSeed * 6.28318) * 6.28318;
        float distance = min(uViewportBounds.x, uViewportBounds.y) * (0.8 + randomSeed * 0.15);
        newPos.xy = vec2(cos(angle), sin(angle)) * distance;
        newPos.z = -5.0;
        newLifetime = initialLifetime;
    }
    
    newPos.z = -5.0;
    
    fragColor = vec4(newPos, newLifetime);
}