// Velocity computation shader for GPGPU particle physics
#ifdef GL_FRAGMENT_PRECISION_HIGH
  precision highp float;
#else
  precision mediump float;
#endif

uniform sampler2D texturePosition;
uniform sampler2D textureVelocity;
uniform sampler2D textureAttributes;

uniform vec2 resolution;
uniform float uTime;
uniform vec2 uMouse;
uniform vec2 uViewport;
uniform float uDeltaTime;
uniform float uScrollVelocity;
uniform int uLeaderCount;
uniform float uAlignmentForceWeight;
uniform float uSeekForceWeight;
uniform float uSeparationForceWeight;
uniform float uEdgeAttractionWeight;
uniform float uCenterRepulsionWeight;
uniform float uCohesionForceWeight;

// Physics constants as uniforms
uniform float uMaxSpeed;
uniform float uDragCoefficient;
uniform float uSeekMaxForce;
uniform float uSeparationRadius;
uniform float uSeparationForce;
uniform float uPatrolSpeed;
uniform float uScrollImpulseStrength;
uniform vec2 uSafeZone;
uniform int uTotalCount;

layout(location = 0) out vec4 fragColor;

// Fixed constants - reduced radii for more autonomous movement
#define ARRIVE_RADIUS 50.0       // Reduced from 100
#define ARRIVE_SLOW_RADIUS 80.0  // Reduced from 200
#define FIXED_TIMESTEP 0.016666667 // 1/60s
#define NEIGHBOR_RADIUS 40.0     // Much smaller - only very close neighbors
#define ALIGNMENT_RADIUS 60.0    // Reduced from 150

#define PI 3.14159265359

// Noise uniforms for wander behavior
uniform float uNoiseScale;
uniform float uNoiseStrength;

// 2D Simplex noise implementation
vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec2 mod289(vec2 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec3 permute(vec3 x) { return mod289(((x*34.0)+1.0)*x); }

float snoise(vec2 v) {
  const vec4 C = vec4(0.211324865405187,  // (3.0-sqrt(3.0))/6.0
                      0.366025403784439,  // 0.5*(sqrt(3.0)-1.0)
                     -0.577350269189626,  // -1.0 + 2.0 * C.x
                      0.024390243902439); // 1.0 / 41.0
  vec2 i  = floor(v + dot(v, C.yy));
  vec2 x0 = v -   i + dot(i, C.xx);
  vec2 i1;
  i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
  vec4 x12 = x0.xyxy + C.xxzz;
  x12.xy -= i1;
  i = mod289(i);
  vec3 p = permute( permute( i.y + vec3(0.0, i1.y, 1.0 ))
    + i.x + vec3(0.0, i1.x, 1.0 ));
  vec3 m = max(0.5 - vec3(dot(x0,x0), dot(x12.xy,x12.xy), dot(x12.zw,x12.zw)), 0.0);
  m = m*m ;
  m = m*m ;
  vec3 x = 2.0 * fract(p * C.www) - 1.0;
  vec3 h = abs(x) - 0.5;
  vec3 ox = floor(x + 0.5);
  vec3 a0 = x - ox;
  m *= 1.79284291400159 - 0.85373472095314 * ( a0*a0 + h*h );
  vec3 g;
  g.x  = a0.x  * x0.x  + h.x  * x0.y;
  g.yz = a0.yz * x12.xz + h.yz * x12.yw;
  return 130.0 * dot(m, g);
}

// Helper function to limit vector magnitude
vec2 limit(vec2 v, float maxLength) {
    float len = length(v);
    if (len > maxLength && len > 0.0) {
        return v * (maxLength / len);
    }
    return v;
}

// Safe normalization to avoid NaN
vec2 safeNormalize(vec2 v) {
    float len = length(v);
    if (len > 1e-5) {
        return v / len;
    }
    return vec2(0.0);
}

// Seek steering behavior
vec2 seek(vec2 currentPos, vec2 targetPos, vec2 currentVel) {
    vec2 desired = targetPos - currentPos;
    float d = length(desired);
    
    if (d > 0.0) {
        desired = normalize(desired) * uMaxSpeed;
        vec2 steer = desired - currentVel;
        return limit(steer, uSeekMaxForce);
    }
    
    return vec2(0.0);
}

// Arrive steering behavior
vec2 arrive(vec2 currentPos, vec2 targetPos, vec2 currentVel, float arriveRadius) {
    vec2 desired = targetPos - currentPos;
    float d = length(desired);
    
    if (d > 0.0) {
        // Scale down speed as we approach target
        float targetSpeed = uMaxSpeed;
        if (d < arriveRadius) {
            targetSpeed = uMaxSpeed * (d / arriveRadius);
        }
        
        desired = normalize(desired) * targetSpeed;
        vec2 steer = desired - currentVel;
        return limit(steer, uSeekMaxForce);
    }
    
    return vec2(0.0);
}

// Calculate separation, alignment, and cohesion forces by checking nearby particles
void calculateFlockingForces(vec2 pos, vec2 vel, ivec2 currentCoord, out vec2 separationForce, out vec2 alignmentVel, out vec2 cohesionForce) {
    separationForce = vec2(0.0);
    alignmentVel = vec2(0.0);
    cohesionForce = vec2(0.0);
    
    int separationCount = 0;
    int alignmentCount = 0;
    vec2 cohesionSum = vec2(0.0);
    int cohesionCount = 0;
    
    // Sample nearby particles in a grid pattern
    ivec2 texSize = textureSize(texturePosition, 0);
    int gridStep = max(1, texSize.x / 32); // Adaptive sampling based on texture size
    
    for (int dy = -2; dy <= 2; dy++) {
        for (int dx = -2; dx <= 2; dx++) {
            if (dx == 0 && dy == 0) continue;
            
            // Calculate neighbor coordinates with wrapping
            ivec2 ncoord = (currentCoord + ivec2(dx * gridStep, dy * gridStep) + texSize) % texSize;
            
            // Sample neighbor data using texelFetch
            vec4 neighborPos = texelFetch(texturePosition, ncoord, 0);
            vec4 neighborVel = texelFetch(textureVelocity, ncoord, 0);
            vec4 neighborAttr = texelFetch(textureAttributes, ncoord, 0);
            
            // Skip if neighbor is inactive (lifetime <= 0) or is a leader
            if (neighborPos.w <= 0.0 || neighborAttr.w > 0.5) continue;
            
            float dist = distance(pos, neighborPos.xy);
            
            // Separation with smooth falloff
            if (dist > 0.0 && dist < uSeparationRadius) {
                vec2 diff = pos - neighborPos.xy;
                // Smooth falloff instead of harsh inverse distance
                float strength = 1.0 - smoothstep(0.0, uSeparationRadius, dist);
                // Prevent extreme forces when very close
                strength = min(strength, 3.0);
                separationForce += safeNormalize(diff) * strength;
                separationCount++;
            }
            
            // Alignment
            if (dist < ALIGNMENT_RADIUS) {
                alignmentVel += neighborVel.xy;
                alignmentCount++;
            }
            
            // Cohesion - average position of neighbors
            if (dist < NEIGHBOR_RADIUS) {
                cohesionSum += neighborPos.xy;
                cohesionCount++;
            }
        }
    }
    
    // Average the forces
    if (separationCount > 0) {
        separationForce = separationForce / float(separationCount) * uSeparationForce;
    }
    
    if (alignmentCount > 0) {
        alignmentVel = alignmentVel / float(alignmentCount);
    }
    
    if (cohesionCount > 0) {
        vec2 centerOfMass = cohesionSum / float(cohesionCount);
        cohesionForce = centerOfMass - pos;
    }
}

// Edge attraction force - keeps particles near the edges using a ring SDF
vec2 edgeAttraction(vec2 pos, vec2 viewport) {
    vec2 halfViewport = viewport * 0.5;
    
    // Calculate normalized position (-1 to 1)
    vec2 normPos = pos / halfViewport;
    
    // Calculate distance from center (0 = center, 1 = edge)
    float distFromCenter = length(normPos);
    
    // We want particles to stay in a band near the edges
    float idealRadius = 0.90; // Target distance from center
    float bandWidth = 0.40;   // Much wider acceptable band for freedom
    
    vec2 force = vec2(0.0);
    
    if (distFromCenter < 0.001) {
        // Avoid division by zero
        force = vec2(1.0, 0.0) * 2.0;
    } else {
        // Calculate radial direction from center
        vec2 radialDir = normPos / distFromCenter;
        
        // Signed distance to the ideal ring
        float signedDist = abs(distFromCenter - idealRadius) - bandWidth;
        
        if (signedDist > 0.0) {
            // Outside the band - apply force towards ideal radius
            if (distFromCenter < idealRadius) {
                force = radialDir * 2.0 * (1.0 + signedDist);
            } else {
                force = -radialDir * 2.0 * (1.0 + signedDist);
            }
        } else {
            // Inside the band - apply gentle maintenance force
            float deviation = distFromCenter - idealRadius;
            force = -radialDir * deviation * 1.5;
        }
    }
    
    return force;
}

// Center repulsion steering behavior - smooth and natural
vec2 centerRepulsion(vec2 pos, vec2 viewport) {
    vec2 halfViewport = viewport * 0.5;
    vec2 noFlyZoneSize = halfViewport * uSafeZone;
    
    // Calculate distance from center
    float distFromCenter = length(pos);
    float zoneRadius = length(noFlyZoneSize);
    
    vec2 force = vec2(0.0);
    
    // Apply force only when close to or inside the zone
    if (distFromCenter < zoneRadius * 1.05) { // Very close to actual boundary
        if (distFromCenter < 0.001) {
            // At exact center, gentle push in a random direction
            force = vec2(1.0, 0.0) * 5.0;
        } else {
            // Smooth force that increases as we approach center
            vec2 awayFromCenter = safeNormalize(pos);
            
            // Use smoothstep for very gradual, fluid-like transition
            float influence = 1.0 - smoothstep(zoneRadius * 0.7, zoneRadius * 1.05, distFromCenter);
            
            // Very gentle steering force for natural movement
            force = awayFromCenter * influence * 15.0; // Gentle guidance
        }
    }
    
    return force;
}

void main() {
    ivec2 texSize = textureSize(texturePosition, 0);
    ivec2 coord = ivec2(gl_FragCoord.xy);
    int index = coord.y * texSize.x + coord.x;
    
    // Early-out for texels beyond particle count
    if (index >= uTotalCount) {
        fragColor = vec4(0.0);
        return;
    }
    
    // Use texelFetch for precise sampling without interpolation
    vec4 position = texelFetch(texturePosition, coord, 0);
    vec4 velocity = texelFetch(textureVelocity, coord, 0);
    vec4 attributes = texelFetch(textureAttributes, coord, 0);
    
    vec3 pos = position.xyz;
    vec3 vel = velocity.xyz;
    float lifetime = position.w;
    
    // Get particle index
    float particleId = gl_FragCoord.x + gl_FragCoord.y * resolution.x;
    
    // Check if this is a leader particle from the attributes texture
    float isLeader = attributes.w;
    
    if (isLeader > 0.5) {
        // Leader patrol logic - organic wander behavior with edge attraction
        float leaderIndex = mod(particleId, float(uLeaderCount));
        
        // Wander force using noise - creates organic, non-linear movement
        vec2 wanderForce = vec2(
            snoise(vec2(pos.x * uNoiseScale * 0.5, pos.y * uNoiseScale * 0.5 + uTime * 0.2 + leaderIndex * 10.0)),
            snoise(vec2(pos.x * uNoiseScale * 0.5 + 100.0, pos.y * uNoiseScale * 0.5 + uTime * 0.2 + leaderIndex * 10.0))
        ) * uNoiseStrength * 2.0;
        
        // Edge attraction force to keep leaders patrolling the perimeter
        vec2 edgeForce = edgeAttraction(pos.xy, uViewport);
        
        // Center repulsion to keep leaders out of the middle
        vec2 centerForce = centerRepulsion(pos.xy, uViewport);
        
        // Combine forces with appropriate weights
        vec2 acceleration = wanderForce * 0.5 + edgeForce * 1.5 + centerForce * 2.0;
        
        // Update velocity with acceleration (clamp dt for stability)
        float dt = min(FIXED_TIMESTEP, 0.1);
        vec2 newVel = vel.xy + acceleration * dt;
        
        // Apply drag
        newVel *= uDragCoefficient;
        
        // Limit speed
        newVel = limit(newVel, uMaxSpeed);
        
        fragColor = vec4(newVel, 0.0, 0.0);
    } else {
        // Follower physics
        vec2 acceleration = vec2(0.0);
        
        // Find nearest leader
        float minDist = 999999.0;
        vec2 nearestLeaderPos = vec2(0.0);
        vec2 nearestLeaderVel = vec2(0.0);
        
        for (int i = 0; i < uLeaderCount; i++) {
            // Calculate UV for this leader using actual texture size
            float leaderIndex = float(i);
            float texWidth = float(texSize.x);
            float leaderX = mod(leaderIndex, texWidth) + 0.5;
            float leaderY = floor(leaderIndex / texWidth) + 0.5;
            ivec2 leaderCoord = ivec2(int(leaderX), int(leaderY));
            
            vec4 leaderPosData = texelFetch(texturePosition, leaderCoord, 0);
            vec4 leaderVelData = texelFetch(textureVelocity, leaderCoord, 0);
            vec4 leaderAttrs = texelFetch(textureAttributes, leaderCoord, 0);
            
            // Check if this is actually a leader
            if (leaderAttrs.w > 0.5) {
                float dist = distance(pos.xy, leaderPosData.xy);
                if (dist < minDist) {
                    minDist = dist;
                    nearestLeaderPos = leaderPosData.xy;
                    nearestLeaderVel = leaderVelData.xy;
                }
            }
        }
        
        // Calculate flocking forces from nearby followers
        vec2 separationForce, localAlignmentVel, cohesionForce;
        calculateFlockingForces(pos.xy, vel.xy, coord, separationForce, localAlignmentVel, cohesionForce);
        
        // Calculate steering forces based on nearest leader
        // Followers should orbit around leaders, not seek their exact position
        vec2 toLeader = nearestLeaderPos - pos.xy;
        float leaderDist = length(toLeader);
        vec2 seekForce = vec2(0.0);
        
        if (leaderDist > 80.0) {  // Reduced from 150
            // Too far - move closer
            seekForce = seek(pos.xy, nearestLeaderPos, vel.xy) * 0.5; // Gentler approach
        } else if (leaderDist < 40.0) {  // Reduced from 80
            // Too close - move away
            seekForce = -safeNormalize(toLeader) * uSeekMaxForce * 0.3; // Gentle push
        }
        
        vec2 arriveForce = arrive(pos.xy, nearestLeaderPos, vel.xy, ARRIVE_RADIUS);
        
        // Alignment combines local flock alignment with leader velocity
        vec2 alignmentForce = mix(localAlignmentVel - vel.xy, nearestLeaderVel - vel.xy, 0.7);
        
        vec2 centerRepelForce = centerRepulsion(pos.xy, uViewport);
        
        // Subtle edge preference for followers (much weaker than leaders)
        vec2 edgeForce = edgeAttraction(pos.xy, uViewport) * 0.3;
        
        // Add wander force using simplex noise
        vec2 wander = vec2(
            snoise(vec2(pos.x * uNoiseScale, pos.y * uNoiseScale + uTime * 0.1)),
            snoise(vec2(pos.x * uNoiseScale + 100.0, pos.y * uNoiseScale + uTime * 0.1))
        ) * uNoiseStrength;
        
        // Combine forces with appropriate weights - balanced to avoid conflicts
        acceleration = seekForce * uSeekForceWeight + 
                      separationForce * uSeparationForceWeight + 
                      alignmentForce * uAlignmentForceWeight * 0.5 + // Softer alignment
                      cohesionForce * uCohesionForceWeight + 
                      centerRepelForce * uCenterRepulsionWeight * 0.8 + // Slightly reduced
                      edgeForce * 0.2 + // Very subtle edge preference
                      wander * 0.3; // Slightly more random movement
        
        // Add responsive, natural scroll response
        if (abs(uScrollVelocity) > 0.005) { // More sensitive to gentle scrolls
            // Create a wave-like response to scrolling
            float scrollResponse = uScrollVelocity * uScrollImpulseStrength * 1.2; // Increased strength
            
            // Add some randomness based on particle position for natural variation
            float positionVariance = sin(pos.x * 0.01 + pos.y * 0.01) * 0.5 + 0.5;
            
            // Less dampening - particles throughout the screen respond
            float distFromCenter = length(pos.xy) / length(uViewport * 0.5);
            float responsiveness = 1.0 - smoothstep(0.8, 1.2, distFromCenter) * 0.3; // Only 30% reduction at edges
            
            // Add both vertical and slight horizontal movement for fluid effect
            acceleration.y += scrollResponse * (0.7 + positionVariance * 0.3) * responsiveness;
            acceleration.x += scrollResponse * sin(pos.y * 0.01) * 0.2; // Subtle horizontal drift
        }
        
        // Update velocity with acceleration using clamped timestep
        float dt = min(FIXED_TIMESTEP, 0.1);
        vec2 newVel = vel.xy + acceleration * dt;
        
        // Apply drag
        newVel *= uDragCoefficient;
        
        // Cap speed at maximum
        newVel = limit(newVel, uMaxSpeed);
        
        fragColor = vec4(newVel, 0.0, 0.0);
    }
}