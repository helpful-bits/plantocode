"use client";

import { ParallaxWrapper, ParallaxLayer, ParallaxContainer, ScrollFade, ScrollScale, StickyParallax } from './ParallaxWrapper';
import { useScrollAnimation, useStaggeredAnimation } from '@/hooks/useScrollAnimation';

// Example component showcasing all animation features
export function AnimationShowcase() {
  const { ref: staggerRef, getItemStyle } = useStaggeredAnimation(5, 150);
  const { ref: scrollRef, getTransform, getOpacity } = useScrollAnimation();

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-900 to-black">
      {/* Parallax Container with Multiple Layers */}
      <ParallaxContainer height="100vh" className="relative">
        <ParallaxLayer speed={-0.5} depth={-1} className="bg-gradient-to-r from-blue-900/20 to-purple-900/20">
          <div className="absolute inset-0" />
        </ParallaxLayer>
        <ParallaxLayer speed={-0.3} depth={0} className="flex items-center justify-center">
          <ScrollScale startScale={0.8} endScale={1.2}>
            <h1 className="text-6xl font-bold text-white text-center">
              Parallax Hero Section
            </h1>
          </ScrollScale>
        </ParallaxLayer>
        <ParallaxLayer speed={-0.1} depth={1} className="flex items-end justify-center pb-20">
          <ScrollFade direction="up" distance={30}>
            <p className="text-xl text-gray-300 text-center max-w-2xl">
              Experience smooth 60fps animations with React 19 concurrent features
            </p>
          </ScrollFade>
        </ParallaxLayer>
      </ParallaxContainer>

      {/* Basic Parallax Wrapper */}
      <section className="py-20 bg-gray-800">
        <ParallaxWrapper speed={-0.2} className="container mx-auto px-4">
          <ScrollFade direction="left" distance={40}>
            <h2 className="text-4xl font-bold text-white mb-8">Basic Parallax</h2>
          </ScrollFade>
          <ScrollFade direction="right" distance={40} delay={0.2}>
            <p className="text-lg text-gray-300 max-w-3xl">
              This section demonstrates basic parallax scrolling with optimized performance
              and reduced motion support.
            </p>
          </ScrollFade>
        </ParallaxWrapper>
      </section>

      {/* Staggered Animation */}
      <section className="py-20 bg-gray-900">
        <div className="container mx-auto px-4">
          <ScrollFade direction="up" distance={20}>
            <h2 className="text-4xl font-bold text-white mb-12 text-center">
              Staggered Animations
            </h2>
          </ScrollFade>
          <div ref={staggerRef} className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {[1, 2, 3, 4, 5].map((item, index) => (
              <div
                key={item}
                className="bg-gray-800 p-6 rounded-lg"
                style={getItemStyle(index)}
              >
                <h3 className="text-xl font-semibold text-white mb-4">
                  Feature {item}
                </h3>
                <p className="text-gray-300">
                  This card animates in with a staggered delay for a smooth reveal effect.
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Sticky Parallax */}
      <StickyParallax height="200vh" speed={0.3}>
        <section className="min-h-screen bg-gradient-to-b from-purple-900 to-blue-900 flex items-center justify-center">
          <div className="text-center">
            <ScrollScale startScale={0.9} endScale={1.1}>
              <h2 className="text-5xl font-bold text-white mb-6">
                Sticky Parallax
              </h2>
            </ScrollScale>
            <ScrollFade direction="up" distance={25} delay={0.3}>
              <p className="text-xl text-gray-200 max-w-2xl mx-auto">
                This section uses sticky positioning combined with parallax for immersive scrolling experiences.
              </p>
            </ScrollFade>
          </div>
        </section>
      </StickyParallax>

      {/* Custom Scroll Animation */}
      <section className="py-20 bg-black">
        <div className="container mx-auto px-4">
          <div
            ref={scrollRef}
            className="text-center"
            style={{
              transform: getTransform(0, 0, 1.1, 5),
              opacity: getOpacity(0.3, 1),
            }}
          >
            <h2 className="text-4xl font-bold text-white mb-8">
              Custom Scroll Effects
            </h2>
            <p className="text-lg text-gray-300 max-w-3xl mx-auto">
              This section demonstrates custom scroll animations with transform, opacity, and rotation effects
              that respond to scroll position with smooth transitions.
            </p>
          </div>
        </div>
      </section>

      {/* Multiple Parallax Speeds */}
      <section className="relative py-40 bg-gradient-to-r from-gray-900 to-black overflow-hidden">
        <ParallaxWrapper speed={-0.5} className="absolute inset-0">
          <div className="w-full h-full bg-gradient-to-r from-blue-500/10 to-purple-500/10" />
        </ParallaxWrapper>
        <ParallaxWrapper speed={-0.3} className="absolute inset-0">
          <div className="w-full h-full bg-gradient-to-l from-green-500/5 to-blue-500/5" />
        </ParallaxWrapper>
        <ParallaxWrapper speed={-0.1} className="relative z-10">
          <div className="container mx-auto px-4 text-center">
            <ScrollFade direction="up" distance={30}>
              <h2 className="text-5xl font-bold text-white mb-8">
                Multi-Layer Parallax
              </h2>
            </ScrollFade>
            <ScrollFade direction="up" distance={30} delay={0.2}>
              <p className="text-xl text-gray-300 max-w-3xl mx-auto">
                Multiple layers moving at different speeds create depth and visual interest
                while maintaining smooth 60fps performance.
              </p>
            </ScrollFade>
          </div>
        </ParallaxWrapper>
      </section>
    </div>
  );
}