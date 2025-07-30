// Utility to test particle configuration changes
// Run in browser console: testParticleConfig()

export function testParticleConfig(overrides?: any) {
  const currentConfig = localStorage.getItem('particleConfig');
  console.log('Current config:', currentConfig ? JSON.parse(currentConfig) : 'None');
  
  if (overrides) {
    console.log('Applying overrides:', overrides);
    localStorage.setItem('particleConfig', JSON.stringify(overrides));
    console.log('Config updated! Refresh the page to see changes.');
  }
  
  console.log(`
To test different configurations:

1. Change force weights:
   testParticleConfig({
     forceWeights: { 
       seek: 2.0,
       alignment: 0.2,
       separation: 3.0,
       edgeAttraction: 0.5
     }
   })

2. Change particle counts:
   testParticleConfig({
     agentCounts: {
       desktop: { leaders: 3, followers: 200 },
       tablet: { leaders: 2, followers: 150 },
       mobile: { leaders: 1, followers: 100 }
     }
   })

3. Reset to defaults:
   localStorage.removeItem('particleConfig')
   location.reload()
  `);
}

// Make it available globally in development
if (typeof window !== 'undefined' && process.env.NODE_ENV === 'development') {
  (window as any).testParticleConfig = testParticleConfig;
}