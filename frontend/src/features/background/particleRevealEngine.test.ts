import {describe,expect,it,vi} from 'vitest';
import {
  createParticleRevealEngine,
  createSeededRandom,
  getRevealStrength,
  type AnimationScheduler,
} from './particleRevealEngine';
import {
  PARTICLE_COLORS,
  PARTICLE_IMAGE_URLS,
  PARTICLE_PROFILES,
} from './particleRevealAssets';

function makeContext():CanvasRenderingContext2D{
  return {
    arc:vi.fn(),
    beginPath:vi.fn(),
    clearRect:vi.fn(),
    fill:vi.fn(),
    fillRect:vi.fn(),
    fillStyle:'#fafafa',
    setTransform:vi.fn(),
  } as unknown as CanvasRenderingContext2D;
}

function makeScheduler(){
  let callback:FrameRequestCallback|undefined;
  const scheduler:AnimationScheduler={
    request:vi.fn(next=>{
      callback=next;
      return 17;
    }),
    cancel:vi.fn(),
    now:vi.fn(()=>100),
  };
  return {scheduler,run:(time:number)=>callback?.(time)};
}

describe('particle reveal configuration',()=>{
  it('锁定桌面、移动和五色参数',()=>{
    expect(PARTICLE_PROFILES.desktop).toMatchObject({cell:7,dotRadius:2.4,maxDpr:2,maxFps:60});
    expect(PARTICLE_PROFILES.mobile).toMatchObject({cell:9,dotRadius:2.4,maxDpr:1.5,maxFps:30});
    expect(PARTICLE_COLORS).toEqual([
      [212,53,28],
      [26,26,26],
      [121,85,72],
      [255,213,0],
      [46,125,50],
    ]);
    expect(PARTICLE_IMAGE_URLS).toHaveLength(10);
    expect(PARTICLE_IMAGE_URLS.join('\n')).not.toMatch(/Users|trae-cn|data:image/);
  });

  it('同一 seed 产生相同随机序列',()=>{
    const first=createSeededRandom(42);
    const second=createSeededRandom(42);
    expect(Array.from({length:8},()=>first())).toEqual(Array.from({length:8},()=>second()));
  });

  it('按流动、显入、停留和显出计算强度',()=>{
    const timing={flow:4,revealIn:1.2,hold:1.5,revealOut:1.2,phaseOffset:0};
    expect(getRevealStrength(timing,2)).toBe(0);
    expect(getRevealStrength(timing,4.6)).toBeCloseTo(0.5,5);
    expect(getRevealStrength(timing,5.4)).toBe(1);
    expect(getRevealStrength(timing,7.3)).toBeCloseTo(0.5,5);
  });
});

describe('createParticleRevealEngine',()=>{
  it('start、pause 和 destroy 幂等管理唯一 RAF',async()=>{
    const {scheduler,run}=makeScheduler();
    const context=makeContext();
    const canvas=document.createElement('canvas');
    const engine=createParticleRevealEngine({
      canvas,
      context,
      imageUrls:['/missing.png'],
      imageLoader:vi.fn(async()=>{throw new Error('missing');}),
      profile:PARTICLE_PROFILES.desktop,
      scheduler,
      seed:42,
    });

    engine.resize(200,100,3);
    expect(canvas.width).toBe(400);
    expect(canvas.height).toBe(200);
    engine.start();
    engine.start();
    expect(scheduler.request).toHaveBeenCalledTimes(1);
    run(120);
    expect(scheduler.request).toHaveBeenCalledTimes(2);
    engine.pause();
    engine.pause();
    expect(scheduler.cancel).toHaveBeenCalledTimes(1);
    await engine.ready;
    engine.destroy();
    engine.destroy();
    expect(scheduler.cancel).toHaveBeenCalledTimes(1);
    expect(context.clearRect).toHaveBeenCalledWith(0,0,200,100);
  });
});
