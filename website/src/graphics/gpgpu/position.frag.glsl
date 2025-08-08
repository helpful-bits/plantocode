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
uniform int uTotalCount;

layout(location = 0) out vec4 fragColor;

// Simple hash function for jitter
float hash11(float x) {
    return fract(sin(x * 43758.5453123) * 43758.5453123);
}

#define FIXED_TIMESTEP 0.016666667 // 1/60s
#define OFF_SCREEN_MARGIN 50.0 // Reduced for quicker wrapping

void main() {
    ivec2 texSize = textureSize(texturePosition, 0);
    ivec2 coord = ivec2(gl_FragCoord.xy);
    int index = coord.y * texSize.x + coord.x;
    
    // Early-out for texels beyond particle count
    if (index >= uTotalCount) {
        vec4 pos = texelFetch(texturePosition, coord, 0);
        fragColor = vec4(pos.xyz, 0.0);
        return;
    }
    
    // Use texelFetch for precise sampling
    vec4 position = texelFetch(texturePosition, coord, 0);
    vec4 velocity = texelFetch(textureVelocity, coord, 0);
    vec4 attributes = texelFetch(textureAttributes, coord, 0);
    
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
    
    // Vertical wrapping with jitter to avoid banding
    if (newPos.y > uViewportBounds.y + OFF_SCREEN_MARGIN) {
        newPos.y = -uViewportBounds.y - OFF_SCREEN_MARGIN + 10.0;
        // Add horizontal jitter when wrapping vertically
        newPos.x += (hash11(randomSeed + 7.0) - 0.5) * 40.0;
    } else if (newPos.y < -uViewportBounds.y - OFF_SCREEN_MARGIN) {
        newPos.y = uViewportBounds.y + OFF_SCREEN_MARGIN - 10.0;
        // Add horizontal jitter when wrapping vertically
        newPos.x += (hash11(randomSeed + 11.0) - 0.5) * 40.0;
    }
    
    // Horizontal wrapping with jitter
    if (newPos.x > uViewportBounds.x + OFF_SCREEN_MARGIN) {
        newPos.x = -uViewportBounds.x - OFF_SCREEN_MARGIN + 10.0;
        // Add vertical jitter when wrapping horizontally
        newPos.y += (hash11(randomSeed + 13.0) - 0.5) * 40.0;
    } else if (newPos.x < -uViewportBounds.x - OFF_SCREEN_MARGIN) {
        newPos.x = uViewportBounds.x + OFF_SCREEN_MARGIN - 10.0;
        // Add vertical jitter when wrapping horizontally
        newPos.y += (hash11(randomSeed + 17.0) - 0.5) * 40.0;
    }
    
    // Only reset for lifetime expiration, not position
    if (isLeader < 0.5 && newLifetime <= 0.0) {
        // Fix: Use direct uniform distribution for angle, no fract() bias
        float angle = randomSeed * 6.28318530718;
        // Add jitter to radius to avoid concentric rings
        float distance = min(uViewportBounds.x, uViewportBounds.y) * (0.8 + randomSeed * 0.15);
        distance *= mix(0.97, 1.03, hash11(randomSeed + 17.0));
        newPos.xy = vec2(cos(angle), sin(angle)) * distance;
        newPos.z = -5.0;
        // Add slight jitter to lifetime to desynchronize respawns
        newLifetime = initialLifetime * mix(0.95, 1.05, hash11(randomSeed + 29.0));
    }
    
    newPos.z = -5.0;
    
    fragColor = vec4(newPos, newLifetime);
}