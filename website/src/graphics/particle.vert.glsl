precision highp float;

uniform float uTime;
uniform float uIsDark;
uniform vec2 uViewport;
uniform vec3 uFollowerBaseColorDark;
uniform vec3 uFollowerHighlightColorDark;
uniform vec3 uFollowerBaseColorLight;
uniform vec3 uFollowerHighlightColorLight;

// GPGPU texture uniforms
uniform sampler2D texturePosition;
uniform sampler2D textureVelocity;
uniform sampler2D textureAttributes;
uniform vec2 uTextureSize;

out float vAlpha;
out vec3 vColor;
out vec3 vVelocity;
out float vIsLeader;

void main() {
  // Calculate texture UV from vertex ID
  float id = float(gl_VertexID);
  vec2 uv = vec2(mod(id, uTextureSize.x) + 0.5, floor(id / uTextureSize.x) + 0.5) / uTextureSize;
  
  // Fetch data from GPGPU textures
  vec4 positionData = texture(texturePosition, uv);
  vec4 velocityData = texture(textureVelocity, uv);
  vec4 attributesData = texture(textureAttributes, uv);
  
  // Extract position
  vec3 pos = positionData.xyz;
  
  // Extract attributes from texture data
  float aRandom = attributesData.y;
  float aParticleSize = attributesData.z;
  vIsLeader = attributesData.w;
  
  // Extract velocity
  vec3 aVelocity = velocityData.xyz;
  
  // Pass to fragment shader
  vVelocity = aVelocity;
  
  
  // Calculate velocity magnitude
  float velocityMagnitude = length(vVelocity);
  
  // GPU-based size animations - no CPU updates needed
  float gameTime = uTime * 0.3;
  float currentSize = aParticleSize;
  
  // Breathing effect - reduced frequency
  float breathPhase = gameTime * 0.8 + aRandom * 6.28 + aParticleSize * 2.0;
  float visualBreathing = 1.0 + sin(breathPhase) * 0.02;
  currentSize *= visualBreathing;
  
  // Growing/shrinking animation based on size changes
  float sizePhase = gameTime * 3.0 + aParticleSize * 10.0;
  float growEffect = smoothstep(0.4, 1.2, aParticleSize);
  currentSize *= 1.0 + sin(sizePhase) * growEffect * 0.05;
  
  // Burst effect for large particles
  float burstEffect = smoothstep(1.0, 1.3, aParticleSize);
  if (burstEffect > 0.7) {
    currentSize *= 1.0 + sin(gameTime * 8.0 + aRandom * 3.14) * 0.1 * burstEffect;
  }
  
  // Transform position using matrices
  vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  
  // Dynamic point size based on velocity magnitude and camera distance
  float velocityGlow = 1.0 + velocityMagnitude * 0.3;
  float gameSizeMultiplier = 0.8 + currentSize * 1.2;
  float cameraDistance = length(mvPosition.xyz);
  
  // Leaders are same size as followers
  
  gl_PointSize = 70.0 * gameSizeMultiplier * velocityGlow / cameraDistance * (0.6 + aRandom * 0.4);
  
  // Set vColor using uniform-based selection
  vec3 baseColor, highlightColor;
  
  // Use uniform colors for followers
  if (uIsDark > 0.5) {
    baseColor = uFollowerBaseColorDark;
    highlightColor = uFollowerHighlightColorDark;
  } else {
    baseColor = uFollowerBaseColorLight;
    highlightColor = uFollowerHighlightColorLight;
  }
  
  vColor = mix(baseColor, highlightColor, velocityMagnitude);
  
  // Simplified alpha calculation
  vAlpha = (0.5 + aRandom * 0.4) * (0.7 + currentSize * 0.6);
}