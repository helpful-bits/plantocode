import React from 'react';
import { Composition } from 'remotion';
import { EndToEnd } from './compositions/EndToEnd';
import { FileFinder } from './compositions/FileFinder';
import { PlanSynthesis } from './compositions/PlanSynthesis';
import { DeepCustomization } from './compositions/DeepCustomization';
import { CostTracking } from './compositions/CostTracking';
import { DeepResearch } from './compositions/DeepResearch';
import { TaskInputRefinement } from './compositions/TaskInputRefinement';
import { VoiceTranscription } from './compositions/VoiceTranscription';
import { RedditAd } from './compositions/RedditAd';
import { WebStep1 } from './compositions/WebStep1';
import { WebStep2 } from './compositions/WebStep2';
import { WebStep3 } from './compositions/WebStep3';
import { WebStep4 } from './compositions/WebStep4';

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="EndToEnd"
        component={EndToEnd}
        durationInFrames={2580}
        fps={60}
        width={1920}
        height={1080}
      />
      <Composition
        id="FileFinder"
        component={FileFinder}
        durationInFrames={1200}
        fps={60}
        width={1920}
        height={1080}
      />
      <Composition
        id="PlanSynthesis"
        component={PlanSynthesis}
        durationInFrames={1110}
        fps={60}
        width={1920}
        height={1080}
      />
      <Composition
        id="DeepCustomization"
        component={DeepCustomization}
        durationInFrames={840}
        fps={60}
        width={1920}
        height={1080}
      />
      <Composition
        id="CostTracking"
        component={CostTracking}
        durationInFrames={540}
        fps={60}
        width={1920}
        height={1080}
      />
      <Composition
        id="DeepResearch"
        component={DeepResearch}
        durationInFrames={1140}
        fps={60}
        width={1920}
        height={1080}
      />
      <Composition
        id="TaskInputRefinement"
        component={TaskInputRefinement}
        durationInFrames={1560}
        fps={60}
        width={1920}
        height={1080}
      />
      <Composition
        id="VoiceTranscription"
        component={VoiceTranscription}
        durationInFrames={1080}
        fps={60}
        width={1920}
        height={1080}
      />
      <Composition
        id="RedditAd"
        component={RedditAd}
        durationInFrames={450}
        fps={30}
        width={1080}
        height={1920}
      />
      <Composition
        id="WebStep1"
        component={WebStep1}
        durationInFrames={2780}
        fps={60}
        width={1920}
        height={1080}
      />
      <Composition
        id="WebStep2"
        component={WebStep2}
        durationInFrames={1430}
        fps={60}
        width={1920}
        height={1080}
      />
      <Composition
        id="WebStep3"
        component={WebStep3}
        durationInFrames={1500}
        fps={60}
        width={1920}
        height={1080}
      />
      <Composition
        id="WebStep4"
        component={WebStep4}
        durationInFrames={1800}
        fps={60}
        width={1920}
        height={1080}
      />
    </>
  );
};