import reveal01 from '../../assets/motion/particle-reveal/reveal-01.png?no-inline';
import reveal02 from '../../assets/motion/particle-reveal/reveal-02.png?no-inline';
import reveal03 from '../../assets/motion/particle-reveal/reveal-03.jpg?no-inline';
import reveal04 from '../../assets/motion/particle-reveal/reveal-04.png?no-inline';
import reveal05 from '../../assets/motion/particle-reveal/reveal-05.png?no-inline';
import reveal06 from '../../assets/motion/particle-reveal/reveal-06.png?no-inline';
import reveal07 from '../../assets/motion/particle-reveal/reveal-07.png?no-inline';
import reveal08 from '../../assets/motion/particle-reveal/reveal-08.png?no-inline';
import reveal09 from '../../assets/motion/particle-reveal/reveal-09.png?no-inline';
import reveal10 from '../../assets/motion/particle-reveal/reveal-10.png?no-inline';

export type ParticleColor=readonly [red:number,green:number,blue:number];

export type ParticleProfile={
  cell:number;
  dotRadius:number;
  maxDpr:number;
  maxFps:number;
  baseFade:number;
};

export const PARTICLE_IMAGE_URLS=[
  reveal01,
  reveal02,
  reveal03,
  reveal04,
  reveal05,
  reveal06,
  reveal07,
  reveal08,
  reveal09,
  reveal10,
] as const;

export const PARTICLE_COLORS=[
  [212,53,28],
  [26,26,26],
  [121,85,72],
  [255,213,0],
  [46,125,50],
] as const satisfies readonly ParticleColor[];

export const PARTICLE_PROFILES={
  desktop:{cell:7,dotRadius:2.4,maxDpr:2,maxFps:60,baseFade:0.018},
  mobile:{cell:9,dotRadius:2.4,maxDpr:1.5,maxFps:30,baseFade:0.018},
} as const satisfies Record<'desktop'|'mobile',ParticleProfile>;
