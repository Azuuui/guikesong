import {
  PARTICLE_COLORS,
  type ParticleProfile,
} from './particleRevealAssets';

export type AnimationScheduler={
  request:(callback:FrameRequestCallback)=>number;
  cancel:(handle:number)=>void;
  now:()=>number;
};

export type ImageLoader=(url:string)=>Promise<HTMLImageElement>;

export type RevealTiming={
  flow:number;
  revealIn:number;
  hold:number;
  revealOut:number;
  phaseOffset:number;
};

export type ParticleRevealEngineOptions={
  canvas:HTMLCanvasElement;
  imageUrls:readonly string[];
  profile:ParticleProfile;
  seed:number;
  context?:CanvasRenderingContext2D;
  scheduler?:AnimationScheduler;
  imageLoader?:ImageLoader;
};

export type ParticleRevealEngine={
  ready:Promise<void>;
  start:()=>void;
  pause:()=>void;
  resize:(width:number,height:number,dpr:number)=>void;
  destroy:()=>void;
};

type Particle={
  row:number;
  x:number;
  speed:number;
  colorIndex:number;
};

type ImageRegion=RevealTiming&{
  gridX:number;
  gridY:number;
  gridWidth:number;
  gridHeight:number;
  colorGrid:Int8Array;
};

const BACKGROUND_COLOR='#fafafa';
const REVEAL_FADE_REDUCTION=0.96;
const TWO_PI=Math.PI*2;
const PARTICLE_SEED_SALT=0x7f4a7c15;
const IMAGE_SEED_SALT=0x51ed270b;

const browserScheduler:AnimationScheduler={
  request:callback=>window.requestAnimationFrame(callback),
  cancel:handle=>window.cancelAnimationFrame(handle),
  now:()=>performance.now(),
};

function browserImageLoader(url:string):Promise<HTMLImageElement>{
  return new Promise((resolve,reject)=>{
    const image=new Image();
    image.onload=()=>resolve(image);
    image.onerror=()=>reject(new Error('粒子显影图片加载失败'));
    image.src=url;
  });
}

/** Mulberry32：同一挂载周期用同一 seed 重建，保持顺序和相对布局稳定。 */
export function createSeededRandom(seed:number):()=>number{
  let state=seed>>>0;
  return ()=>{
    state=(state+0x6d2b79f5)>>>0;
    let value=state;
    value=Math.imul(value^(value>>>15),value|1);
    value^=value+Math.imul(value^(value>>>7),value|61);
    return ((value^(value>>>14))>>>0)/4294967296;
  };
}

function easeInOut(progress:number):number{
  const bounded=Math.min(1,Math.max(0,progress));
  return bounded<0.5
    ?2*bounded*bounded
    :1-Math.pow(-2*bounded+2,2)/2;
}

export function getRevealStrength(timing:RevealTiming,time:number):number{
  const cycle=timing.flow+timing.revealIn+timing.hold+timing.revealOut;
  if(cycle<=0) return 0;
  const localTime=((time+timing.phaseOffset)%cycle+cycle)%cycle;
  if(localTime<timing.flow) return 0;
  if(localTime<timing.flow+timing.revealIn){
    return easeInOut((localTime-timing.flow)/timing.revealIn);
  }
  if(localTime<timing.flow+timing.revealIn+timing.hold) return 1;
  const revealOutProgress=(localTime-timing.flow-timing.revealIn-timing.hold)/timing.revealOut;
  return easeInOut(1-revealOutProgress);
}

function classifyPixel(red:number,green:number,blue:number):number{
  const brightness=(red+green+blue)/3;
  const maxChannel=Math.max(red,green,blue);
  const minChannel=Math.min(red,green,blue);
  const saturation=maxChannel>0?(maxChannel-minChannel)/maxChannel:0;
  if(brightness>225&&saturation<0.1) return -1;

  let nearestIndex=0;
  let nearestDistance=Number.POSITIVE_INFINITY;
  PARTICLE_COLORS.forEach((color,index)=>{
    const redDistance=red-color[0];
    const greenDistance=green-color[1];
    const blueDistance=blue-color[2];
    const distance=redDistance*redDistance+greenDistance*greenDistance+blueDistance*blueDistance;
    if(distance<nearestDistance){
      nearestDistance=distance;
      nearestIndex=index;
    }
  });
  return nearestIndex;
}

export function createParticleRevealEngine({
  canvas,
  imageUrls,
  profile,
  seed,
  context,
  scheduler=browserScheduler,
  imageLoader=browserImageLoader,
}:ParticleRevealEngineOptions):ParticleRevealEngine{
  const resolvedContext=context??canvas.getContext('2d',{alpha:false});
  if(!resolvedContext) throw new Error('当前浏览器不支持 Canvas 2D');
  const drawingContext:CanvasRenderingContext2D=resolvedContext;

  let width=0;
  let height=0;
  let columns=0;
  let rows=0;
  let gridRed=new Uint8Array(0);
  let gridGreen=new Uint8Array(0);
  let gridBlue=new Uint8Array(0);
  let gridAlpha=new Float32Array(0);
  let particles:Particle[]=[];
  let imageRegions:ImageRegion[]=[];
  let cellRegionMap=new Int32Array(0);
  let loadedImages:HTMLImageElement[]=[];
  let imagesReady=false;
  let running=false;
  let destroyed=false;
  let frameHandle:number|undefined;
  let lastRenderedAt=0;
  let globalTime=0;

  function buildImageRegion(
    image:HTMLImageElement,
    regionWidth:number,
    regionHeight:number,
    x:number,
    y:number,
    timing:RevealTiming,
  ):ImageRegion|undefined{
    const offscreen=document.createElement('canvas');
    offscreen.width=regionWidth;
    offscreen.height=regionHeight;
    const offscreenContext=offscreen.getContext('2d',{willReadFrequently:true});
    if(!offscreenContext) return undefined;

    offscreenContext.fillStyle='#ffffff';
    offscreenContext.fillRect(0,0,regionWidth,regionHeight);
    const scale=Math.min(regionWidth/image.width,regionHeight/image.height);
    const drawnWidth=image.width*scale;
    const drawnHeight=image.height*scale;
    offscreenContext.drawImage(
      image,
      (regionWidth-drawnWidth)/2,
      (regionHeight-drawnHeight)/2,
      drawnWidth,
      drawnHeight,
    );
    const pixels=offscreenContext.getImageData(0,0,regionWidth,regionHeight).data;
    const gridX=Math.floor(x/profile.cell);
    const gridY=Math.floor(y/profile.cell);
    const gridWidth=Math.ceil(regionWidth/profile.cell);
    const gridHeight=Math.ceil(regionHeight/profile.cell);
    const colorGrid=new Int8Array(gridWidth*gridHeight);

    for(let localY=0;localY<gridHeight;localY+=1){
      for(let localX=0;localX<gridWidth;localX+=1){
        const pixelX=Math.min(localX*profile.cell+(profile.cell>>1),regionWidth-1);
        const pixelY=Math.min(localY*profile.cell+(profile.cell>>1),regionHeight-1);
        const pixelIndex=(pixelY*regionWidth+pixelX)*4;
        colorGrid[localY*gridWidth+localX]=classifyPixel(
          pixels[pixelIndex]??255,
          pixels[pixelIndex+1]??255,
          pixels[pixelIndex+2]??255,
        );
      }
    }

    return {gridX,gridY,gridWidth,gridHeight,colorGrid,...timing};
  }

  function rebuildCellRegionMap(){
    cellRegionMap=new Int32Array(columns*rows).fill(-1);
    imageRegions.forEach((region,regionIndex)=>{
      const yEnd=Math.min(rows,region.gridY+region.gridHeight);
      const xEnd=Math.min(columns,region.gridX+region.gridWidth);
      for(let gridY=Math.max(0,region.gridY);gridY<yEnd;gridY+=1){
        for(let gridX=Math.max(0,region.gridX);gridX<xEnd;gridX+=1){
          cellRegionMap[gridY*columns+gridX]=regionIndex;
        }
      }
    });
  }

  function placeImages(random:()=>number){
    imageRegions=[];
    if(width<24||height<24||loadedImages.length===0){
      rebuildCellRegionMap();
      return;
    }

    const screenArea=width*height;
    const placedRects:Array<{x:number;y:number;width:number;height:number}>=[];
    const indices=loadedImages.map((_,index)=>index);
    for(let index=indices.length-1;index>0;index-=1){
      const swapIndex=Math.floor(random()*(index+1));
      [indices[index],indices[swapIndex]]=[indices[swapIndex]!,indices[index]!];
    }

    indices.forEach((imageIndex,index)=>{
      const image=loadedImages[imageIndex]!;
      const aspect=Math.max(0.1,image.width/Math.max(1,image.height));
      const targetArea=screenArea*(0.1+random()*0.3);
      let regionHeight=Math.sqrt(targetArea/aspect);
      let regionWidth=regionHeight*aspect;
      const maximumWidth=Math.max(8,width-20);
      const maximumHeight=Math.max(8,height-20);
      const scaleDown=Math.min(1,maximumWidth/regionWidth,maximumHeight/regionHeight);
      regionWidth=Math.max(8,regionWidth*scaleDown);
      regionHeight=Math.max(8,regionHeight*scaleDown);

      const timing:RevealTiming={
        flow:4+random()*2,
        revealIn:1.2,
        hold:1.5+random()*0.5,
        revealOut:1.2,
        phaseOffset:Math.floor(index/3)*9+(index%3)*3,
      };

      let placed=false;
      for(let attempt=0;attempt<50&&!placed;attempt+=1){
        const availableX=Math.max(0,width-regionWidth-20);
        const availableY=Math.max(0,height-regionHeight-20);
        const x=10+random()*availableX;
        const y=10+random()*availableY;
        const overlaps=placedRects.some(rect=>
          x<rect.x+rect.width+30&&
          x+regionWidth+30>rect.x&&
          y<rect.y+rect.height+30&&
          y+regionHeight+30>rect.y,
        );
        if(overlaps) continue;

        const built=buildImageRegion(
          image,
          Math.max(1,Math.ceil(regionWidth)),
          Math.max(1,Math.ceil(regionHeight)),
          x,
          y,
          timing,
        );
        if(built){
          imageRegions.push(built);
          placedRects.push({x,y,width:regionWidth,height:regionHeight});
        }
        placed=true;
      }

      if(placed) return;
      const fallbackWidth=Math.max(8,regionWidth*0.6);
      const fallbackHeight=Math.max(8,regionHeight*0.6);
      const x=10+random()*Math.max(0,width-fallbackWidth-20);
      const y=10+random()*Math.max(0,height-fallbackHeight-20);
      const built=buildImageRegion(
        image,
        Math.max(1,Math.ceil(fallbackWidth)),
        Math.max(1,Math.ceil(fallbackHeight)),
        x,
        y,
        timing,
      );
      if(built) imageRegions.push(built);
    });
    rebuildCellRegionMap();
  }

  function rebuildScene(){
    columns=Math.max(1,Math.ceil(width/profile.cell));
    rows=Math.max(1,Math.ceil(height/profile.cell));
    const cellCount=columns*rows;
    gridRed=new Uint8Array(cellCount);
    gridGreen=new Uint8Array(cellCount);
    gridBlue=new Uint8Array(cellCount);
    gridAlpha=new Float32Array(cellCount);
    particles=[];
    const random=createSeededRandom(seed^PARTICLE_SEED_SALT);
    for(let row=0;row<rows;row+=1){
      const count=2+(random()<0.5?1:0);
      for(let index=0;index<count;index+=1){
        particles.push({
          row,
          x:random()*columns,
          speed:0.1+random()*0.35,
          colorIndex:Math.floor(random()*PARTICLE_COLORS.length),
        });
      }
    }
    if(imagesReady) placeImages(createSeededRandom(seed^IMAGE_SEED_SALT));
    else rebuildCellRegionMap();
  }

  function updateAndDraw(deltaSeconds:number){
    drawingContext.fillStyle=BACKGROUND_COLOR;
    drawingContext.fillRect(0,0,width,height);
    if(width===0||height===0) return;

    const frameScale=Math.max(0.1,Math.min(deltaSeconds,0.05)*60);
    const reveals=imageRegions.map(region=>getRevealStrength(region,globalTime));
    for(let gridY=0;gridY<rows;gridY+=1){
      const rowStart=gridY*columns;
      for(let gridX=0;gridX<columns;gridX+=1){
        const index=rowStart+gridX;
        if((gridAlpha[index]??0)<=0) continue;
        let fade=profile.baseFade*frameScale;
        const regionIndex=cellRegionMap[index]??-1;
        if(regionIndex>=0){
          const region=imageRegions[regionIndex];
          const reveal=reveals[regionIndex]??0;
          if(region&&reveal>0){
            const localX=gridX-region.gridX;
            const localY=gridY-region.gridY;
            const colorIndex=region.colorGrid[localY*region.gridWidth+localX]??-1;
            if(colorIndex>=0) fade*=1-reveal*REVEAL_FADE_REDUCTION;
          }
        }
        gridAlpha[index]=Math.max(0,(gridAlpha[index]??0)-fade);
      }
    }

    particles.forEach(particle=>{
      particle.x+=particle.speed*frameScale;
      while(particle.x>=columns) particle.x-=columns;
      const column=Math.floor(particle.x);
      const index=particle.row*columns+column;
      const color=PARTICLE_COLORS[particle.colorIndex]!;
      gridRed[index]=color[0];
      gridGreen[index]=color[1];
      gridBlue[index]=color[2];
      gridAlpha[index]=1;
    });

    for(let gridY=0;gridY<rows;gridY+=1){
      const rowStart=gridY*columns;
      const centerY=gridY*profile.cell+(profile.cell>>1);
      for(let gridX=0;gridX<columns;gridX+=1){
        const index=rowStart+gridX;
        const alpha=gridAlpha[index]??0;
        if(alpha<=0.02) continue;
        const red=Math.floor(255+((gridRed[index]??255)-255)*alpha);
        const green=Math.floor(255+((gridGreen[index]??255)-255)*alpha);
        const blue=Math.floor(255+((gridBlue[index]??255)-255)*alpha);
        const centerX=gridX*profile.cell+(profile.cell>>1);
        const radius=profile.dotRadius*(0.5+alpha*0.7);
        drawingContext.fillStyle=`rgb(${red},${green},${blue})`;
        drawingContext.beginPath();
        drawingContext.arc(centerX,centerY,radius,0,TWO_PI);
        drawingContext.fill();
      }
    }
  }

  function requestNextFrame(){
    if(!running||destroyed) return;
    frameHandle=scheduler.request(renderFrame);
  }

  function renderFrame(timestamp:number){
    frameHandle=undefined;
    if(!running||destroyed) return;
    const minimumFrameDuration=1000/profile.maxFps;
    if(timestamp-lastRenderedAt>=minimumFrameDuration){
      const deltaSeconds=Math.min((timestamp-lastRenderedAt)/1000,0.05);
      lastRenderedAt=timestamp;
      globalTime+=deltaSeconds;
      updateAndDraw(deltaSeconds);
    }
    requestNextFrame();
  }

  const ready=Promise.allSettled(
    imageUrls.map(url=>Promise.resolve().then(()=>imageLoader(url))),
  ).then(results=>{
    if(destroyed) return;
    loadedImages=results.flatMap(result=>result.status==='fulfilled'?[result.value]:[]);
    imagesReady=true;
    if(width>0&&height>0) placeImages(createSeededRandom(seed^IMAGE_SEED_SALT));
  });

  return {
    ready,
    start(){
      if(destroyed||running) return;
      running=true;
      lastRenderedAt=scheduler.now()-1000/profile.maxFps;
      requestNextFrame();
    },
    pause(){
      if(!running&&frameHandle===undefined) return;
      running=false;
      if(frameHandle!==undefined){
        scheduler.cancel(frameHandle);
        frameHandle=undefined;
      }
    },
    resize(nextWidth,nextHeight,nextDpr){
      if(destroyed) return;
      width=Math.max(1,Math.floor(nextWidth));
      height=Math.max(1,Math.floor(nextHeight));
      const boundedDpr=Math.max(1,Math.min(nextDpr||1,profile.maxDpr));
      canvas.width=Math.max(1,Math.floor(width*boundedDpr));
      canvas.height=Math.max(1,Math.floor(height*boundedDpr));
      canvas.style.width=`${width}px`;
      canvas.style.height=`${height}px`;
      drawingContext.setTransform(boundedDpr,0,0,boundedDpr,0,0);
      rebuildScene();
    },
    destroy(){
      if(destroyed) return;
      if(running||frameHandle!==undefined){
        running=false;
        if(frameHandle!==undefined){
          scheduler.cancel(frameHandle);
          frameHandle=undefined;
        }
      }
      destroyed=true;
      particles=[];
      imageRegions=[];
      loadedImages=[];
      gridRed=new Uint8Array(0);
      gridGreen=new Uint8Array(0);
      gridBlue=new Uint8Array(0);
      gridAlpha=new Float32Array(0);
      cellRegionMap=new Int32Array(0);
      drawingContext.clearRect(0,0,width,height);
    },
  };
}
