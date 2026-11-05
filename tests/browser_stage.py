"""背景・地面・穴の実描画確認。HTTPサーバー起動後に実行。"""
import os
from playwright.sync_api import sync_playwright

BASE = os.environ.get('GAME_TEST_URL', 'http://127.0.0.1:8000')
with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH', '/usr/bin/chromium'), headless=True, args=['--no-sandbox'])
    for mobile in [False, True]:
        context = browser.new_context(viewport={'width':844,'height':390} if mobile else {'width':1440,'height':1000}, is_mobile=mobile, has_touch=mobile)
        page = context.new_page()
        errors=[]
        page.on('pageerror', lambda e: errors.append(str(e)))
        page.goto(BASE,wait_until='networkidle')
        page.click('#start-button')
        result=page.evaluate('''() => {
          const P=PopEscape,g=P.game,r=P.renderer,C=P.CONFIG;
          g.pause();g.distance=2500;g.syncLanes();
          g.obstacles=[{kind:'hole',lane:2,x:550,width:125},
            {kind:'hole',lane:2,x:850,width:90}];
          const before=JSON.stringify(g);
          const draws=[],segments=[],tiles=[];
          let polygons=0;
          const draw=r.ctx.drawImage, polygon=r.polygon, terrain=r.terrain, tile=r.groundTile;
          r.ctx.drawImage=function(image,...args){
            draws.push({key:Object.keys(r.caveImages).find(k=>r.caveImages[k]===image),args});
            return draw.call(this,image,...args);
          };
          r.polygon=function(...args){polygons++;return polygon.apply(this,args);};
          r.terrain=function(...args){segments.push(args);return terrain.apply(this,args);};
          r.groundTile=function(...args){tiles.push(args);return tile.apply(this,args);};
          try {
            r.background(g.distance,g.elapsed,false);
            if(!draws.some(d=>d.key==='background') || polygons)throw Error('placeholder background');
            r.tracks(g);
            if(polygons)throw Error('placeholder pit triangles');
            const pits=draws.filter(d=>d.key==='pit');
            if(pits.length!==2 || pits[0].args[4]!==550 || pits[0].args[6]!==125 ||
              pits.some(d=>d.args[5]!==560 || d.args[5]+d.args[7]!==720))throw Error('pit geometry');
            for(const s of segments.filter(s=>s[3]===2))
              for(const o of g.obstacles)
                if(s[0]<o.x+o.width && s[0]+s[2]>o.x)throw Error('ground spans pit');
            const caps=tiles.filter(t=>t[0]!==1);
            if(JSON.stringify(caps.map(t=>t[0]))!==JSON.stringify([0,2,0,2]))throw Error('pit cap order');
            // 各パネルの元画像上面を変換した先が物理の走行ラインになる。
            const A=C.caveVisuals.ground;
            for(const d of draws.filter(d=>['ground','groundLeft','groundRight'].includes(d.key))) {
              const a=d.args;
              const surface=a[5]+(A.surfaceY-a[1])*a[7]/a[3];
              if(!C.lanes.some(y=>Math.abs(surface-y)<1e-6))throw Error('surface drift');
            }
            if(JSON.stringify(g)!==before)throw Error('render mutates game');
            // 画面外・重複・短い足場でも処理が破綻しない。
            g.obstacles=[{kind:'hole',lane:2,x:-90,width:110},
              {kind:'hole',lane:2,x:100,width:100},{kind:'hole',lane:2,x:150,width:80},
              {kind:'hole',lane:2,x:250,width:100},{kind:'hole',lane:2,x:1290,width:100}];
            r.tracks(g);
            const additionalPits=draws.filter(d=>d.key==='pit').slice(2);
            if(additionalPits.length!==4 || additionalPits[1].args[6]!==130)throw Error('overlapping pits');
            g.obstacles=[{kind:'hole',lane:2,x:550,width:125},
              {kind:'hole',lane:2,x:850,width:90},
              {kind:'spikes',lane:0,x:520,width:100},
              {kind:'stalactite',lane:1,x:1090,width:55},
              {kind:'bat',lane:1,x:700,width:36,age:.1,seed:0},
              {kind:'spider',lane:2,x:1000,width:36,spiderStartX:1120,spiderRate:100}];
            return {status:r.caveAssetStatus,groundImages:draws.filter(d=>['ground','groundLeft','groundRight'].includes(d.key)).length};
          } finally {
            r.ctx.drawImage=draw;r.polygon=polygon;r.terrain=terrain;r.groundTile=tile;
          }
        }''')
        assert result['status']=={'loaded':9,'failed':[]},result
        page.add_style_tag(content='#pause-screen {display:none !important}')
        page.wait_for_timeout(100)
        page.screenshot(path='/tmp/stage-mobile.png' if mobile else '/tmp/stage-desktop.png',full_page=True)
        page.evaluate('''() => {
          const g=PopEscape.game;g.distance=0;g.player.topLane=1;
          g.obstacles=g.obstacles.filter(o=>o.lane!==0);
        }''')
        page.wait_for_timeout(100)
        page.screenshot(path='/tmp/stage-mobile-two-lanes.png' if mobile else '/tmp/stage-desktop-two-lanes.png',full_page=True)
        assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
        assert not errors,errors
        print('PASS: background image, repeat ground, cap order, exact surface line, open pits to screen bottom, overlap/offscreen pits, no placeholder triangles, no game mutation;', 'mobile' if mobile else 'PC',flush=True)
        context.close()
    browser.close()
