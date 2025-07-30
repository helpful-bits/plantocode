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

// Physics constants as uniforms
uniform float uMaxSpeed;
uniform float uDragCoefficient;
uniform float uSeekMaxForce;
uniform float uSeparationRadius;
uniform float uSeparationForce;
uniform float uPatrolSpeed;
uniform float uScrollImpulseStrength;
uniform vec2 uSafeZone;

layout(location = 0) out vec4 fragColor;

// Fixed constants
#define ARRIVE_RADIUS 100.0
#define ARRIVE_SLOW_RADIUS 200.0
#define FIXED_TIMESTEP 0.016666667 // 1/60s
#define NEIGHBOR_RADIUS 100.0
#define ALIGNMENT_RADIUS 150.0

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

// Calculate separation and alignment forces by checking nearby particles
void calculateFlockingForces(vec2 pos, vec2 vel, out vec2 separationForce, out vec2 alignmentVel) {
    separationForce = vec2(0.0);
    alignmentVel = vec2(0.0);
    
    int separationCount = 0;
    int alignmentCount = 0;
    
    // Sample nearby particles in a grid pattern
    ivec2 texSize = textureSize(texturePosition, 0);
    int gridStep = max(1, texSize.x / 32); // Adaptive sampling based on texture size
    
    for (int dy = -2; dy <= 2; dy++) {
        for (int dx = -2; dx <= 2; dx++) {
            if (dx == 0 && dy == 0) continue;
            
            // Calculate neighbor UV
            vec2 offset = vec2(float(dx * gridStep), float(dy * gridStep)) / vec2(texSize);
            vec2 neighborUV = gl_FragCoord.xy / vec2(texSize) + offset;
            
            // Wrap around texture edges
            neighborUV = fract(neighborUV);
            
            // Sample neighbor data
            vec4 neighborPos = texture(texturePosition, neighborUV);
            vec4 neighborVel = texture(textureVelocity, neighborUV);
            vec4 neighborAttr = texture(textureAttributes, neighborUV);
            
            // Skip if neighbor is a leader
            if (neighborAttr.w > 0.5) continue;
            
            float dist = distance(pos, neighborPos.xy);
            
            // Separation
            if (dist > 0.0 && dist < uSeparationRadius) {
                vec2 diff = pos - neighborPos.xy;
                diff = normalize(diff) / dist; // Weight by inverse distance
                separationForce += diff;
                separationCount++;
            }
            
            // Alignment
            if (dist < ALIGNMENT_RADIUS) {
                alignmentVel += neighborVel.xy;
                alignmentCount++;
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
}

// Edge attraction force - keeps particles near the edges using a ring SDF
vec2 edgeAttraction(vec2 pos, vec2 viewport) {
    vec2 halfViewport = viewport * 0.5;
    
    // Calculate normalized position (-1 to 1)
    vec2 normPos = pos / halfViewport;
    
    // Calculate distance from center (0 = center, 1 = edge)
    float distFromCenter = length(normPos);
    
    // We want particles to stay in a band near the edges
    float idealRadius = 0.85; // Target distance from center
    float bandWidth = 0.15;   // Width of the acceptable band
    
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

// Center repulsion steering behavior
vec2 centerRepulsion(vec2 pos, vec2 viewport) {
    vec2 halfViewport = viewport * 0.5;
    vec2 noFlyZoneSize = halfViewport * uSafeZone;
    
    vec2 force = vec2(0.0);
    if (abs(pos.x) < noFlyZoneSize.x && abs(pos.y) < noFlyZoneSize.y) {
        // Particle is inside no-fly zone. Push it away from center.
        if (length(pos) < 0.001) {
            // At exact center, push in a random direction
            force = vec2(1.0, 0.0) * uMaxSpeed;
        } else {
            // Create force pointing away from center (outward radial direction)
            vec2 awayFromCenter = normalize(pos);
            // Stronger force when deeper inside the zone
            float depth = 1.0 - (length(pos) / length(noFlyZoneSize));
            force = awayFromCenter * uMaxSpeed * (0.5 + depth * 0.5);
        }
    }
    return force;
}

void main() {
    ivec2 texSize = textureSize(texturePosition, 0);
    vec2 uv = gl_FragCoord.xy / vec2(texSize);
    
    vec4 position = texture(texturePosition, uv);
    vec4 velocity = texture(textureVelocity, uv);
    vec4 attributes = texture(textureAttributes, uv);
    
    vec3 pos = position.xyz;
    vec3 vel = velocity.xyz;
    float lifetime = position.w;
    
    // Get particle index
    float particleId = gl_FragCoord.x + gl_FragCoord.y * resolution.x;
    
    // Check if this is a leader particle from the attributes texture
    float isLeader = texture(textureAttributes, uv).w;
    
    if (isLeader > 0.5) {
        // Leader patrol logic - Bézier curve path inset 6vh from viewport edges
        // Use modulo to keep particleId reasonable for phase offset
        float leaderIndex = mod(particleId, float(uLeaderCount));
        float patrolTime = uTime * 0.3 + leaderIndex * 2.0; // Phase offset for distribution
        float t = fract(patrolTime * 0.2); // Complete circuit every 5 seconds
        
        // Calculate viewport dimensions with 6vh inset
        vec2 halfViewport = uViewport * 0.5;
        float insetPixels = max(uViewport.y * 0.06, 20.0); // 6vh converted to pixels with minimum
        vec2 insetHalfViewport = halfViewport - vec2(insetPixels);
        
        // Ensure we have valid viewport
        if (halfViewport.x < 10.0 || halfViewport.y < 10.0) {
            fragColor = vec4(10.0, 0.0, 0.0, 0.0); // Default velocity
            return;
        }
        
        // Define Bézier control points for a smooth rounded rectangle path
        // We'll use 4 cubic Bézier curves, one for each side
        vec2 p0, p1, p2, p3; // Control points for current segment
        float localT = fract(t * 4.0); // Progress within current segment
        int segment = int(t * 4.0);
        
        float cornerRadius = insetPixels * 1.5; // Smooth corners
        
        if (segment == 0) {
            // Top edge, moving right
            p0 = vec2(-insetHalfViewport.x + cornerRadius, insetHalfViewport.y);
            p1 = vec2(-insetHalfViewport.x + cornerRadius * 2.5, insetHalfViewport.y);
            p2 = vec2(insetHalfViewport.x - cornerRadius * 2.5, insetHalfViewport.y);
            p3 = vec2(insetHalfViewport.x - cornerRadius, insetHalfViewport.y);
        } else if (segment == 1) {
            // Right edge, moving down  
            p0 = vec2(insetHalfViewport.x, insetHalfViewport.y - cornerRadius);
            p1 = vec2(insetHalfViewport.x, insetHalfViewport.y - cornerRadius * 2.5);
            p2 = vec2(insetHalfViewport.x, -insetHalfViewport.y + cornerRadius * 2.5);
            p3 = vec2(insetHalfViewport.x, -insetHalfViewport.y + cornerRadius);
        } else if (segment == 2) {
            // Bottom edge, moving left
            p0 = vec2(insetHalfViewport.x - cornerRadius, -insetHalfViewport.y);
            p1 = vec2(insetHalfViewport.x - cornerRadius * 2.5, -insetHalfViewport.y);
            p2 = vec2(-insetHalfViewport.x + cornerRadius * 2.5, -insetHalfViewport.y);
            p3 = vec2(-insetHalfViewport.x + cornerRadius, -insetHalfViewport.y);
        } else {
            // Left edge, moving up
            p0 = vec2(-insetHalfViewport.x, -insetHalfViewport.y + cornerRadius);
            p1 = vec2(-insetHalfViewport.x, -insetHalfViewport.y + cornerRadius * 2.5);
            p2 = vec2(-insetHalfViewport.x, insetHalfViewport.y - cornerRadius * 2.5);
            p3 = vec2(-insetHalfViewport.x, insetHalfViewport.y - cornerRadius);
        }
        
        // Evaluate cubic Bézier curve position
        float t1 = 1.0 - localT;
        vec2 targetPos = p0 * t1 * t1 * t1 + 
                        3.0 * p1 * t1 * t1 * localT + 
                        3.0 * p2 * t1 * localT * localT + 
                        p3 * localT * localT * localT;
        
        // Calculate the derivative of the cubic Bézier curve to get the tangent vector
        vec2 desiredVel = 3.0 * (1.0 - localT) * (1.0 - localT) * (p1 - p0) + 
                         6.0 * (1.0 - localT) * localT * (p2 - p1) + 
                         3.0 * localT * localT * (p3 - p2);
        
        // Set the new velocity by normalizing desiredVel and scaling by patrol speed
        vec2 newVel = normalize(desiredVel) * uPatrolSpeed;
        
        // Add a small corrective force to pull the particle back to the path if it drifts
        vec2 correction = (targetPos - pos.xy) * 0.5;
        newVel += correction;
        
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
            // Calculate UV for this leader
            float leaderIndex = float(i);
            float leaderX = mod(leaderIndex, resolution.x) + 0.5;
            float leaderY = floor(leaderIndex / resolution.x) + 0.5;
            vec2 leaderUV = vec2(leaderX, leaderY) / resolution;
            
            vec4 leaderPosData = texture(texturePosition, leaderUV);
            vec4 leaderVelData = texture(textureVelocity, leaderUV);
            vec4 leaderAttrs = texture(textureAttributes, leaderUV);
            
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
        vec2 separationForce, localAlignmentVel;
        calculateFlockingForces(pos.xy, vel.xy, separationForce, localAlignmentVel);
        
        // Calculate steering forces based on nearest leader
        vec2 seekForce = seek(pos.xy, nearestLeaderPos, vel.xy);
        vec2 arriveForce = arrive(pos.xy, nearestLeaderPos, vel.xy, ARRIVE_RADIUS);
        
        // Alignment combines local flock alignment with leader velocity
        vec2 alignmentForce = mix(localAlignmentVel - vel.xy, nearestLeaderVel - vel.xy, 0.7);
        
        vec2 edgeForce = edgeAttraction(pos.xy, uViewport);
        vec2 centerRepelForce = centerRepulsion(pos.xy, uViewport);
        
        // Add wander force using simplex noise
        vec2 wander = vec2(
            snoise(vec2(pos.x * uNoiseScale, pos.y * uNoiseScale + uTime * 0.3)),
            snoise(vec2(pos.x * uNoiseScale + 100.0, pos.y * uNoiseScale + uTime * 0.3))
        ) * uNoiseStrength;
        
        // Combine forces with appropriate weights
        acceleration = seekForce * uSeekForceWeight + 
                      separationForce * uSeparationForceWeight + 
                      alignmentForce * uAlignmentForceWeight +
                      edgeForce * uEdgeAttractionWeight +
                      centerRepelForce * uCenterRepulsionWeight +
                      wander;
        
        // Add vertical impulse based on scroll velocity
        if (abs(uScrollVelocity) > 0.01) {
            acceleration.y += uScrollVelocity * uScrollImpulseStrength;
        }
        
        // Update velocity with acceleration using fixed timestep
        vec2 newVel = vel.xy + acceleration * FIXED_TIMESTEP;
        
        // Apply drag
        newVel *= uDragCoefficient;
        
        // Cap speed at maximum
        newVel = limit(newVel, uMaxSpeed);
        
        fragColor = vec4(newVel, 0.0, 0.0);
    }
}