import {act,render,screen} from '@testing-library/react';
import {beforeEach,describe,expect,it,vi} from 'vitest';
import {PARTICLE_PROFILES} from './particleRevealAssets';

const engineFactory=vi.hoisted(()=>vi.fn());

vi.mock('./particleRevealEngine',()=>({
  createParticleRevealEngine:engineFactory,
}));

import {ParticleRevealBackground} from './ParticleRevealBackground';

type MediaController={
  listeners:Set<(event:MediaQueryListEvent)=>void>;
  matches:boolean;
};

const mediaControllers=new Map<string,MediaController>();
const initialMediaMatches=new Map<string,boolean>();
let resizeCallback:ResizeObserverCallback;

function getMediaController(query:string):MediaController{
  const controller=mediaControllers.get(query);
  if(!controller) throw new Error(`缺少媒体查询：${query}`);
  return controller;
}

function setMediaMatch(query:string,matches:boolean){
  const controller=getMediaController(query);
  controller.matches=matches;
  const event={matches,media:query} as MediaQueryListEvent;
  controller.listeners.forEach(listener=>listener(event));
}

function makeEngine(){
  return {
    ready:Promise.resolve(),
    start:vi.fn(),
    pause:vi.fn(),
    resize:vi.fn(),
    destroy:vi.fn(),
  };
}

beforeEach(()=>{
  mediaControllers.clear();
  initialMediaMatches.clear();
  engineFactory.mockReset();
  vi.useRealTimers();
  vi.stubGlobal('matchMedia',vi.fn((query:string)=>{
    const controller:MediaController={
      listeners:new Set(),
      matches:initialMediaMatches.get(query)??false,
    };
    mediaControllers.set(query,controller);
    return {
      get matches(){return controller.matches;},
      media:query,
      onchange:null,
      addEventListener:(_type:string,listener:(event:MediaQueryListEvent)=>void)=>controller.listeners.add(listener),
      removeEventListener:(_type:string,listener:(event:MediaQueryListEvent)=>void)=>controller.listeners.delete(listener),
      addListener:vi.fn(),
      removeListener:vi.fn(),
      dispatchEvent:vi.fn(),
    } as MediaQueryList;
  }));
  vi.stubGlobal('ResizeObserver',class{
    constructor(callback:ResizeObserverCallback){resizeCallback=callback;}
    observe=vi.fn();
    unobserve=vi.fn();
    disconnect=vi.fn();
  });
  Object.defineProperty(document,'visibilityState',{configurable:true,value:'visible'});
  Object.defineProperty(window,'devicePixelRatio',{configurable:true,value:2.5});
  Object.defineProperty(window,'innerWidth',{configurable:true,value:1440});
  Object.defineProperty(window,'innerHeight',{configurable:true,value:900});
});

describe('ParticleRevealBackground',()=>{
  it('渲染无障碍背景并在可见性变化和卸载时管理引擎',()=>{
    const engine=makeEngine();
    engineFactory.mockReturnValue(engine);

    const {unmount}=render(<ParticleRevealBackground seed={42} />);

    expect(screen.getByTestId('particle-reveal-canvas')).toHaveAttribute('aria-hidden','true');
    expect(engineFactory).toHaveBeenCalledWith(expect.objectContaining({
      profile:PARTICLE_PROFILES.desktop,
      seed:42,
    }));
    expect(engine.resize).toHaveBeenCalledWith(1440,900,2.5);
    expect(engine.start).toHaveBeenCalledTimes(1);

    Object.defineProperty(document,'visibilityState',{configurable:true,value:'hidden'});
    document.dispatchEvent(new Event('visibilitychange'));
    expect(engine.pause).toHaveBeenCalledTimes(1);

    Object.defineProperty(document,'visibilityState',{configurable:true,value:'visible'});
    document.dispatchEvent(new Event('visibilitychange'));
    expect(engine.start).toHaveBeenCalledTimes(2);

    unmount();
    expect(engine.destroy).toHaveBeenCalledTimes(1);
  });

  it('减少动态效果时不启动循环',()=>{
    initialMediaMatches.set('(prefers-reduced-motion: reduce)',true);
    const engine=makeEngine();
    engineFactory.mockReturnValue(engine);
    render(<ParticleRevealBackground />);

    expect(engine.start).not.toHaveBeenCalled();
    expect(engine.pause).toHaveBeenCalledTimes(1);
  });

  it('窄屏使用移动配置',()=>{
    const desktopEngine=makeEngine();
    engineFactory.mockReturnValue(desktopEngine);
    render(<ParticleRevealBackground />);
    const mobileEngine=makeEngine();
    engineFactory.mockReturnValue(mobileEngine);

    act(()=>setMediaMatch('(max-width: 767px)',true));

    expect(desktopEngine.destroy).toHaveBeenCalledTimes(1);
    expect(engineFactory).toHaveBeenLastCalledWith(expect.objectContaining({
      profile:PARTICLE_PROFILES.mobile,
    }));
  });

  it('把连续 ResizeObserver 通知合并为一次 resize',()=>{
    vi.useFakeTimers();
    const engine=makeEngine();
    engineFactory.mockReturnValue(engine);
    render(<ParticleRevealBackground />);
    const entry={contentRect:{width:1200,height:760}} as ResizeObserverEntry;

    act(()=>{
      resizeCallback([entry],{} as ResizeObserver);
      resizeCallback([entry],{} as ResizeObserver);
      resizeCallback([entry],{} as ResizeObserver);
      vi.advanceTimersByTime(199);
    });
    expect(engine.resize).toHaveBeenCalledTimes(1);
    act(()=>vi.advanceTimersByTime(1));
    expect(engine.resize).toHaveBeenLastCalledWith(1200,760,2.5);
    expect(engine.resize).toHaveBeenCalledTimes(2);
  });
});
