import {useEffect,useRef,useState} from 'react';
import '../../styles/particle-reveal.css';
import {
  PARTICLE_IMAGE_URLS,
  PARTICLE_PROFILES,
} from './particleRevealAssets';
import {createParticleRevealEngine} from './particleRevealEngine';

export type ParticleRevealBackgroundProps={
  className?:string;
  seed?:number;
};

function useMediaQuery(query:string):boolean{
  const [matches,setMatches]=useState(()=>
    typeof window!=='undefined'&&typeof window.matchMedia==='function'
      ?window.matchMedia(query).matches
      :false,
  );

  useEffect(()=>{
    if(typeof window.matchMedia!=='function') return;
    const mediaQuery=window.matchMedia(query);
    const update=(event:MediaQueryListEvent)=>setMatches(event.matches);
    setMatches(mediaQuery.matches);
    mediaQuery.addEventListener('change',update);
    return ()=>mediaQuery.removeEventListener('change',update);
  },[query]);

  return matches;
}

export function ParticleRevealBackground({
  className,
  seed,
}:ParticleRevealBackgroundProps){
  const rootRef=useRef<HTMLDivElement>(null);
  const canvasRef=useRef<HTMLCanvasElement>(null);
  const [stableSeed]=useState(()=>seed??Math.floor(Math.random()*0xffffffff));
  const reducedMotion=useMediaQuery('(prefers-reduced-motion: reduce)');
  const mobile=useMediaQuery('(max-width: 767px)');

  useEffect(()=>{
    const root=rootRef.current;
    const canvas=canvasRef.current;
    if(!root||!canvas) return;

    let engine:ReturnType<typeof createParticleRevealEngine>;
    try{
      engine=createParticleRevealEngine({
        canvas,
        imageUrls:PARTICLE_IMAGE_URLS,
        profile:mobile?PARTICLE_PROFILES.mobile:PARTICLE_PROFILES.desktop,
        seed:stableSeed,
      });
    }catch{
      return;
    }

    let resizeTimer:number|undefined;
    const resize=(width:number,height:number)=>{
      engine.resize(
        Math.max(1,width),
        Math.max(1,height),
        window.devicePixelRatio||1,
      );
    };
    resize(window.innerWidth,window.innerHeight);

    const resizeObserver=typeof ResizeObserver==='function'
      ?new ResizeObserver(entries=>{
        const entry=entries[0];
        if(!entry) return;
        if(resizeTimer!==undefined) window.clearTimeout(resizeTimer);
        resizeTimer=window.setTimeout(()=>{
          resizeTimer=undefined;
          const nextWidth=entry.contentRect.width||window.innerWidth;
          const nextHeight=entry.contentRect.height||window.innerHeight;
          resize(nextWidth,nextHeight);
        },200);
      })
      :undefined;
    resizeObserver?.observe(root);

    const syncPlayback=()=>{
      if(reducedMotion||document.visibilityState==='hidden') engine.pause();
      else engine.start();
    };
    document.addEventListener('visibilitychange',syncPlayback);
    syncPlayback();

    return ()=>{
      if(resizeTimer!==undefined) window.clearTimeout(resizeTimer);
      resizeObserver?.disconnect();
      document.removeEventListener('visibilitychange',syncPlayback);
      engine.destroy();
    };
  },[mobile,reducedMotion,stableSeed]);

  const classes=['particle-reveal-background',className].filter(Boolean).join(' ');
  return (
    <div
      aria-hidden="true"
      className={classes}
      data-testid="particle-reveal-background"
      ref={rootRef}
    >
      <canvas
        aria-hidden="true"
        className="particle-reveal-background__canvas"
        data-testid="particle-reveal-canvas"
        ref={canvasRef}
      />
      <div aria-hidden="true" className="particle-reveal-background__veil" />
    </div>
  );
}
