"""洞窟画像の実描画・コマ位置・停止・フォールバック。HTTPサーバーが必要。"""
import os
from playwright.sync_api import sync_playwright

BASE = os.environ.get('GAME_TEST_URL', 'http://127.0.0.1:8000')
with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH', '/usr/bin/chromium'), headless=True, args=['--no-sandbox'])
    for mobile in [False, True]:
        context = browser.new_context(viewport={'width':844,'height':390} if mobile else {'width':1440,'height':1000}, is_mobile=mobile, has_touch=mobile)
        page = context.new_page()
        errors = []
        page.on('pageerror', lambda e: errors.append(str(e)))
        page.goto(BASE, wait_until='networkidle')
        page.click('#start-button')
        result = page.evaluate('''() => {
          const P=PopEscape,g=P.game,r=P.renderer,C=P.CONFIG;
          g.distance=2500;g.syncLanes();g.pause();
          const seen=[], original=r.ctx.drawImage;
          r.ctx.drawImage=function(image,...args){
            seen.push({key:Object.keys(r.caveImages).find(k=>r.caveImages[k]===image),args});
            return original.call(this,image,...args);
          };
          try {
            const bat={kind:'bat',lane:2,x:500,width:36,age:0,seed:0};
            const snapshot=JSON.stringify(bat);
            for(const age of [0,.1,.2,.3])r.bat({...bat,age});
            const bats=seen.splice(0);
            if(JSON.stringify(bat)!==snapshot)throw Error('bat state mutated');
            const spiders=[];
            for(const lane of [1,2]) {
              for(const progress of [0,.5,1]) {
                const elapsed=C.spiderWarningSeconds+C.spiderDropSeconds*progress;
                const o={kind:'spider',lane,x:700,width:36,spiderRate:100,spiderStartX:700+elapsed*100};
                const before=JSON.stringify(o),pose=P.Obstacles.spiderPose(o);
                r.spider(o,elapsed);
                if(JSON.stringify(o)!==before)throw Error('spider state mutated');
                const draw=seen.splice(0).find(d=>d.key==='spider');
                const index=progress===0?0:progress===.5?1:2;
                const frame=C.caveVisuals.spider.frames[index];
                const a=draw.args;
                const centerX=a[4]+(frame.anchor[0]-a[0])*a[6]/a[2];
                const centerY=a[5]+(frame.anchor[1]-a[1])*a[7]/a[3];
                if(Math.abs(centerX-718)>1e-6 || Math.abs(centerY-pose.y)>1e-6)
                  throw Error('spider anchor drift');
                spiders.push({lane,progress,y:pose.y});
              }
            }
            g.obstacles=[{kind:'spikes',lane:0,x:520,width:100},
              {kind:'stalactite',lane:1,x:1050,width:60},
              ...[0,.1,.2].map((age,i)=>({...bat,x:480+i*210,age})),
              ...[1,2].map((lane,i)=>({kind:'spider',lane,x:650+i*220,width:36,spiderStartX:770+i*220,spiderRate:100}))];
            const before=JSON.stringify(g.obstacles);
            r.tracks(g);
            if(JSON.stringify(g.obstacles)!==before)throw Error('obstacles mutated');
            if(!seen.some(d=>d.key==='spikes') || !seen.some(d=>d.key==='stalactite'))
              throw Error('stage images not drawn');
            window.caveFrozen=JSON.stringify(g.obstacles);
            return {status:r.caveAssetStatus,pop:r.assetStatus,monster:r.monsterAssetStatus,
              batFrames:bats.map(d=>d.args[0]),spiders};
          } finally {r.ctx.drawImage=original;}
        }''')
        assert result['status'] == {'loaded':4,'failed':[]}, result
        assert result['pop']['loaded'] == 11 and result['monster']['loaded'] == 8, result
        assert result['batFrames'][0] != result['batFrames'][1] != result['batFrames'][2], result
        assert result['batFrames'][1] == result['batFrames'][3], result
        page.wait_for_timeout(250)
        assert page.evaluate('JSON.stringify(PopEscape.game.obstacles)===caveFrozen')
        page.add_style_tag(content='#pause-screen {display:none !important}')
        assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
        page.screenshot(path='/tmp/cave-mobile.png' if mobile else '/tmp/cave-desktop.png', full_page=True)
        assert not errors, errors
        print('PASS: cave images, 1-2-3-2 bat frames, spider body anchors in both lanes, pause, existing sprites;', 'mobile' if mobile else 'PC', flush=True)
        context.close()
    page=browser.new_page()
    page.route('**/assets/stage/**',lambda route:route.abort())
    page.route('**/assets/enemies/**',lambda route:route.abort())
    page.goto(BASE,wait_until='networkidle')
    page.click('#start-button')
    assert page.evaluate('PopEscape.renderer.caveAssetStatus.failed.length===4 && PopEscape.game.mode==="running"')
    page.evaluate('''() => {
      const g=PopEscape.game,r=PopEscape.renderer;
      g.pause();g.obstacles=[{kind:'spikes',lane:1,x:600,width:80},
        {kind:'stalactite',lane:1,x:900,width:50},{kind:'bat',lane:2,x:500,width:36,age:1,seed:0},
        {kind:'spider',lane:2,x:700,width:36,spiderStartX:820,spiderRate:100}];
      r.tracks(g);
    }''')
    print('PASS: all four missing images fall back to Canvas without blocking play',flush=True)
    browser.close()
