export default `
uniform float uTime;
uniform vec2 uMouse;
uniform float uMouseIntensity;
uniform float uIsDark;
uniform float uScrollY;
uniform float uIsHovering;
uniform float uCardPositions[40]; // x, y, width, height for each card
uniform float uCardCount;
uniform vec2 uMouseVelocity; // New: mouse velocity for enhanced attraction

attribute float aRandom;
attribute vec3 aOriginalPosition;

varying float vAlpha;
varying vec3 vColor;

void main() {
  vec3 pos = aOriginalPosition;
  
  // Parallax scroll effect - particles move at different speeds based on depth
  float depthFactor = 0.5 + aRandom * 0.5; // 0.5 to 1.0
  pos.y += uScrollY * depthFactor * 10.0; // Different layers move at different speeds
  
  // Infinite vertical loop - when particles go off screen, wrap them around
  float viewportHeight = 20.0;
  pos.y = mod(pos.y + viewportHeight * 0.5, viewportHeight) - viewportHeight * 0.5;
  
  // Wave animation
  float wave = sin(pos.x * 2.0 + uTime) * 0.1;
  pos.y += wave;
  
  // Enhanced mouse interaction with velocity-based attraction
  vec2 mouseOffset = uMouse - pos.xy;
  float mouseDistance = length(mouseOffset);
  
  // Smooth influence radius with enhanced range
  float mouseInfluence = 1.0 - smoothstep(0.0, 5.0, mouseDistance);
  float closeInfluence = 1.0 - smoothstep(0.0, 2.0, mouseDistance); // Stronger close influence
  
  // FOLLOW the cursor with velocity-based enhancement
  vec2 followDirection = normalize(mouseOffset);
  
  // Base attraction strength
  float baseStrength = mouseInfluence * uMouseIntensity * 0.4;
  
  // Velocity-based enhancement - particles are more attracted to fast-moving cursor
  float velocityMagnitude = length(uMouseVelocity);
  float velocityBoost = min(1.0, velocityMagnitude * 0.1);
  
  // Combined attraction with particle-specific lag
  float particleLag = 0.7 + aRandom * 0.3; // Different particles follow at different speeds
  float totalStrength = (baseStrength + velocityBoost * closeInfluence) * particleLag;
  
  pos.xy += followDirection * totalStrength;
  
  // Add swirling motion around cursor for dynamic effect
  if (mouseDistance < 3.0) {
    vec2 tangent = vec2(-followDirection.y, followDirection.x);
    float swirl = sin(uTime * 3.0 + aRandom * 6.28) * closeInfluence * 0.15;
    pos.xy += tangent * swirl;
  }
  
  // Add very subtle floating motion when hovering
  if (uIsHovering > 0.5) {
    float floatOffset = sin(uTime * 2.0 + aRandom * 6.28) * 0.05;
    pos.y += floatOffset * mouseInfluence;
  }
  
  // Fluid dynamics around cards
  vec2 totalForce = vec2(0.0);
  for (int i = 0; i < 10; i++) {
    if (float(i) >= uCardCount) break;
    
    // Get card bounds
    float cardX = uCardPositions[i * 4];
    float cardY = uCardPositions[i * 4 + 1];
    float cardWidth = uCardPositions[i * 4 + 2];
    float cardHeight = uCardPositions[i * 4 + 3];
    
    // Calculate distance to card edges
    vec2 cardCenter = vec2(cardX, cardY);
    vec2 toParticle = pos.xy - cardCenter;
    
    // Check if particle is near card
    float edgeX = max(0.0, abs(toParticle.x) - cardWidth * 0.5);
    float edgeY = max(0.0, abs(toParticle.y) - cardHeight * 0.5);
    float distToCard = length(vec2(edgeX, edgeY));
    
    // Apply fluid dynamics
    if (distToCard < 2.0) {
      // Normalize direction
      vec2 flowDir = normalize(toParticle);
      
      // Create flow around card (like water around obstacle)
      if (abs(toParticle.x) < cardWidth * 0.6 && abs(toParticle.y) < cardHeight * 0.6) {
        // Inside card bounds - strong repulsion
        float strength = 2.0 / (distToCard + 0.1);
        totalForce += flowDir * strength;
      } else {
        // Near card - create smooth flow around edges
        float strength = 1.0 - smoothstep(0.0, 2.0, distToCard);
        
        // Calculate tangent flow (perpendicular to radial)
        vec2 tangent = vec2(-flowDir.y, flowDir.x);
        
        // Determine flow direction based on particle position
        float flowAngle = atan(toParticle.y, toParticle.x);
        float cardAngle = atan(cardHeight, cardWidth);
        
        // Mix radial and tangential flow for realistic fluid dynamics
        totalForce += (flowDir * 0.3 + tangent * 0.7) * strength;
        
        // Add slight turbulence
        float turbulence = sin(uTime * 2.0 + aRandom * 6.28) * 0.1;
        totalForce += flowDir * turbulence * strength;
      }
    }
  }
  
  // Apply fluid forces with damping
  pos.xy += totalForce * 0.5;
  
  // Depth-based movement
  pos.z += sin(uTime * 0.5 + aRandom * 6.28) * 0.2;
  
  vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  
  // Size based on depth + mouse interaction
  float baseSize = 30.0 + aRandom * 20.0;
  float sizeBoost = 1.0 + mouseInfluence * 0.5; // Particles grow near mouse
  gl_PointSize = (baseSize * sizeBoost) * (1.0 / -mvPosition.z);
  
  // OKLCH-based color system for particles - Dynamic adaptation
  if (uIsDark > 0.5) {
    // Dark mode - OKLCH bright teal particles (0.68 0.08 195)
    vAlpha = (0.7 + aRandom * 0.25) * (1.0 + mouseInfluence * 0.4);
    
    // Convert OKLCH to RGB approximation for bright teal
    // OKLCH(0.68, 0.08, 195) ≈ rgb(158, 179, 189) normalized
    vColor = vec3(
      0.62 + aRandom * 0.2 + mouseInfluence * 0.15,  // Adjusted red component
      0.70 + aRandom * 0.15 + mouseInfluence * 0.1,  // Adjusted green component  
      0.74 + aRandom * 0.1 + mouseInfluence * 0.05   // Adjusted blue component
    );
    
    // Add theme transition smoothness
    vColor = mix(vColor, vec3(0.4, 0.8, 0.9), 0.3);
  } else {
    // Light mode - OKLCH teal-light particles (0.48 0.15 195)
    vAlpha = (0.85 + aRandom * 0.15) * (1.0 + mouseInfluence * 0.3);
    
    // Convert OKLCH to RGB approximation for teal-light
    // OKLCH(0.48, 0.15, 195) ≈ rgb(56, 128, 145) normalized
    vColor = vec3(
      0.22 + aRandom * 0.1 + mouseInfluence * 0.1,   // Adjusted red component
      0.50 + aRandom * 0.25 + mouseInfluence * 0.2,  // Adjusted green component
      0.57 + aRandom * 0.25 + mouseInfluence * 0.2   // Adjusted blue component
    );
    
    // Enhance vibrancy for light mode
    vColor = mix(vColor, vec3(0.1, 0.6, 0.7), 0.4);
  }
  
  // Dynamic color blending based on scroll and interaction
  float dynamicBlend = sin(uTime * 0.8 + aRandom * 3.14) * 0.1 + 0.9;
  vColor *= dynamicBlend;
  
  // Enhanced mouse interaction color shifts
  if (mouseInfluence > 0.1) {
    vec3 interactionColor = uIsDark > 0.5 ? 
      vec3(0.8, 0.9, 1.0) :  // Bright cyan for dark mode
      vec3(0.0, 0.4, 0.6);   // Deep teal for light mode
    vColor = mix(vColor, interactionColor, mouseInfluence * 0.3);
  }
}
`;