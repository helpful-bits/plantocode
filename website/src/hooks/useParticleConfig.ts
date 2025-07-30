import { useState, useEffect, useCallback } from 'react';
import { ForceWeights, PhysicsConstants, AgentCounts, Breakpoints } from '@/lib/particle-config';

interface ParticleConfig {
  forceWeights: typeof ForceWeights;
  physicsConstants: typeof PhysicsConstants;
  agentCounts: typeof AgentCounts;
  breakpoints: typeof Breakpoints;
}

const defaultConfig: ParticleConfig = {
  forceWeights: ForceWeights,
  physicsConstants: PhysicsConstants,
  agentCounts: AgentCounts,
  breakpoints: Breakpoints,
};

export function useParticleConfig() {
  const [config, setConfig] = useState<ParticleConfig>(defaultConfig);

  // Load config from localStorage or external source
  useEffect(() => {
    const loadConfig = async () => {
      try {
        // Check localStorage first
        const storedConfig = localStorage.getItem('particleConfig');
        if (storedConfig) {
          const parsed = JSON.parse(storedConfig);
          setConfig(mergeConfig(defaultConfig, parsed));
        }

        // Check for external config file
        const response = await fetch('/particle-config.json');
        if (response.ok) {
          const externalConfig = await response.json();
          const merged = mergeConfig(config, externalConfig);
          setConfig(merged);
          localStorage.setItem('particleConfig', JSON.stringify(merged));
        }
      } catch (error) {
        console.error('Failed to load particle config:', error);
      }
    };

    loadConfig();
  }, []);

  // Update config and persist
  const updateConfig = useCallback((updates: Partial<ParticleConfig>) => {
    setConfig(prev => {
      const newConfig = mergeConfig(prev, updates);
      localStorage.setItem('particleConfig', JSON.stringify(newConfig));
      return newConfig;
    });
  }, []);

  // Get agent counts based on current viewport
  const getResponsiveAgentCounts = useCallback(() => {
    const width = window.innerWidth;
    
    if (width >= config.breakpoints.desktop) {
      return config.agentCounts.desktop;
    } else if (width >= config.breakpoints.tablet) {
      return config.agentCounts.tablet;
    } else {
      return config.agentCounts.mobile;
    }
  }, [config]);

  return {
    config,
    updateConfig,
    getResponsiveAgentCounts,
  };
}

// Deep merge helper
function mergeConfig(base: ParticleConfig, updates: any): ParticleConfig {
  return {
    forceWeights: { ...base.forceWeights, ...updates.forceWeights },
    physicsConstants: { ...base.physicsConstants, ...updates.physicsConstants },
    agentCounts: {
      desktop: { ...base.agentCounts.desktop, ...updates.agentCounts?.desktop },
      tablet: { ...base.agentCounts.tablet, ...updates.agentCounts?.tablet },
      mobile: { ...base.agentCounts.mobile, ...updates.agentCounts?.mobile },
    },
    breakpoints: { ...base.breakpoints, ...updates.breakpoints },
  };
}