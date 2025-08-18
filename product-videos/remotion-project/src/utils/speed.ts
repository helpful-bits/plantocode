export type RampOptions = { 
  edgeFrames?: number; 
  midMultiplier: number; 
  totalTargetFrames: number; 
  sourceFrames: number 
};

export function createEdgeMidEdgeSpeed({edgeFrames = 60, midMultiplier, totalTargetFrames, sourceFrames}: RampOptions) {
  const actualMidMultiplier = (sourceFrames - 2 * edgeFrames) / (totalTargetFrames - 2 * edgeFrames);
  
  return (frame: number) => {
    if (frame < edgeFrames) {
      return 1;
    } else if (frame >= totalTargetFrames - edgeFrames) {
      return 1;
    } else {
      return actualMidMultiplier;
    }
  };
}

export function constantSpeedFor(sourceFrames: number, targetFrames: number) {
  return sourceFrames / targetFrames;
}