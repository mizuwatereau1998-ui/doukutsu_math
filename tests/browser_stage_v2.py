"""V2の無加工背景、継ぎ目、高速スクロール、個別画像失敗の確認。"""
import os
from playwright.sync_api import sync_playwright

BASE=os.environ.get('GAME_TEST_URL','http://127.0.0.1:8000')
with sync_playwright() as p:
    browser=p.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH','/usr/bin/chromium'),headless=True,args=['--no-sandbox'])
    page=browser.new_page(viewport={'width':1280,'height':900})
    page.goto(BASE,wait_until='networkidle')
    page.evaluate('PopEscape.renderer.assetsReady')
    result=page.evaluate('''() => {
      const P=PopEscape,C=P.CONFIG,r=P.renderer;
      const image=r.caveImages.background;
      const make=()=>{const canvas=document.createElement('canvas');canvas.width=C.width;canvas.height=C.height;return canvas;};
      const actual=make(),reference=make();
      const previous=r.ctx;
      try {
        r.ctx=actual.getContext('2d');
        r.background(0,0,false);
        const scale=Math.max(C.width/image.naturalWidth,C.height/image.naturalHeight);
        reference.getContext('2d').drawImage(image,0,(C.height-image.naturalHeight*scale)/2,image.naturalWidth*scale,image.naturalHeight*scale);
        const expected=reference.getContext('2d').getImageData(0,0,C.width,C.height).data;
        const rendered=r.ctx.getImageData(0,0,C.width,C.height).data;
        if(!rendered.every((v,i)=>v===expected[i]))throw Error('background recolored or overlaid');
        const seamScores=[];
        // タイル境界の直前・直後、500px/秒相当の連続描画で色差を調べる。
        const A=C.caveVisuals.ground;
        for(const scroll of [0,191.9,192.1,...Array.from({length:60},(_,i)=>500*i/60)]) {
          r.ctx.clearRect(0,0,C.width,C.height);
          r.terrain(0,C.lanes[1],C.width,1,scroll);
          for(let n=Math.floor(scroll/A.tileWidth)+1;n*A.tileWidth-scroll<C.width-2;n++) {
            const x=Math.round(n*A.tileWidth-scroll);
            if(x<2)continue;
            const pixels=r.ctx.getImageData(x-1,C.lanes[1]+4,2,30).data;
            let delta=0;
            for(let y=0;y<30;y++)for(let c=0;c<3;c++)delta+=Math.abs(pixels[y*8+c]-pixels[y*8+4+c]);
            seamScores.push(delta/90);
          }
        }
        const worst=Math.max(...seamScores);
        if(worst>15)throw Error('ground seam color jump '+worst);
        // 背景のループ境界も反転した同じ端どうしがつながる。
        const w=image.naturalWidth*scale;
        const distance=(w-C.width/2)/(C.pixelsPerMeter*C.caveVisuals.background.parallax);
        r.ctx.clearRect(0,0,C.width,C.height);r.background(distance,0,false);
        const data=r.ctx.getImageData(C.width/2-1,0,2,C.height).data;
        let backgroundSeam=0;
        for(let y=0;y<C.height;y++)for(let c=0;c<3;c++)backgroundSeam+=Math.abs(data[y*8+c]-data[y*8+4+c]);
        backgroundSeam/=C.height*3;
        if(backgroundSeam>5)throw Error('background seam '+backgroundSeam);
        const g=new P.Game();g.start(4,3000);g.distance=10000;
        g.nextQuestionDistance=Infinity;g.obstacleReadyAt=Infinity;
        g.obstacles=[{kind:'hole',lane:2,x:1000,width:125}];
        const before=g.distance*C.pixelsPerMeter, holeBefore=g.obstacles[0].x;
        g.update(C.fixedStep);
        const after=g.distance*C.pixelsPerMeter,delta=after-before;
        if(Math.abs(holeBefore-g.obstacles[0].x-delta)>1e-7)throw Error('world and hole scroll differ');
        const positions=[],tile=r.groundTile;
        r.groundTile=function(...args){positions.push(args);return tile.apply(this,args);};
        try {
          r.terrain(0,C.lanes[1],C.width,1,before);
          const old=positions.splice(0);
          r.terrain(0,C.lanes[1],C.width,1,after);
          for(const a of old) {
            const matching=positions.find(b=>Math.abs((a[1]+before)-(b[1]+after))<1e-6);
            if(matching && Math.abs((a[1]-matching[1])-delta)>1e-6)throw Error('moving walkway');
          }
        }finally{r.groundTile=tile;}
        return {backgroundUnchanged:true,groundSeamMax:worst,backgroundSeam,worldPixelsPerTick:delta};
      }finally{r.ctx=previous;}
    }''')
    print('PASS: unchanged reference background, seamless mirrored loops, 60 high-speed frames, physics/world scroll agreement',result,flush=True)
    for image in ['cave_background_reference.png','ground_repeat.png','ground_gap_left_edge.png','ground_gap_right_edge.png','pit_depth.png']:
        context=browser.new_context()
        context.route('**/'+image,lambda route:route.abort())
        fallback=context.new_page()
        errors=[]
        fallback.on('pageerror',lambda e:errors.append(str(e)))
        fallback.goto(BASE,wait_until='networkidle')
        fallback.click('#start-button')
        fallback.evaluate('''() => {
          const g=PopEscape.game;g.pause();
          g.obstacles=[{kind:'hole',lane:2,x:550,width:125}];
          PopEscape.renderer.tracks(g);
        }''')
        assert fallback.evaluate('PopEscape.renderer.caveAssetStatus.failed.length')==1
        assert not errors,errors
        context.close()
    print('PASS: individual background, ground, left/right cap and pit failures use safe Canvas fallbacks',flush=True)
    browser.close()
