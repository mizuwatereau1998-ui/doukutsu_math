"""Monster sprites, capture UI ordering, score stability and independent fallback."""
import os
from playwright.sync_api import sync_playwright

BASE=os.environ.get('GAME_TEST_URL','http://127.0.0.1:8000')
with sync_playwright() as p:
    browser=p.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH','/usr/bin/chromium'),headless=True,args=['--no-sandbox'])
    context=browser.new_context(viewport={'width':1280,'height':900})
    page=context.new_page();errors=[]
    page.on('pageerror',lambda error:errors.append(str(error)))
    page.goto(BASE,wait_until='networkidle')
    status=page.evaluate('PopEscape.renderer.assetsReady')
    assert status==[{'loaded':11,'failed':[]},{'loaded':8,'failed':[]}],status
    assert page.evaluate('Object.values(PopEscape.renderer.monsterImages).every(i=>i.naturalWidth===512&&i.naturalHeight===512)')
    page.click('#start-button')
    page.evaluate('PopEscape.game.obstacles=[];PopEscape.game.obstacleReadyAt=Infinity;PopEscape.game.nextQuestionDistance=Infinity')
    def sequence(state,count):
        return page.evaluate('''({state,count})=>new Promise((resolve,reject)=>{
          const keys=[],started=performance.now();
          function sample(){
            const g=PopEscape.game,r=PopEscape.renderer,f=r.lastMonsterFrame;
            if(r.monsterPlayback?.player===g.player && f?.state===state && keys.at(-1)!==f.key)keys.push(f.key);
            if(keys.length>=count)return resolve(keys);
            if(performance.now()-started>3000)return reject(new Error('sequence '+keys));
            requestAnimationFrame(sample);
          }sample();
        })''',{'state':state,'count':count})
    keys=sequence('chase',5)
    assert keys==['run01','run02','run03','run04','run01'],keys
    page.keyboard.press('Escape')
    frozen=page.evaluate('({game:JSON.stringify(PopEscape.game),key:PopEscape.renderer.lastMonsterFrame.key})')
    page.wait_for_timeout(120)
    assert page.evaluate('JSON.stringify(PopEscape.game)')==frozen['game']
    assert page.evaluate('PopEscape.renderer.lastMonsterFrame.key')==frozen['key']
    page.evaluate('PopEscape.game.misses=3;PopEscape.game.resume()')
    assert sequence('threat',3)==['threat01','threat02','threat01']
    page.screenshot(path='/tmp/poppun-monster-threat.png',full_page=True)
    page.evaluate('PopEscape.game.misses=2')
    page.wait_for_function('PopEscape.renderer.lastMonsterFrame.state === "chase"')
    page.evaluate('''() => {
      const panel=document.getElementById('result-screen');
      new MutationObserver(()=>{if(!panel.hidden)window.capturePanelShownAt=performance.now();})
        .observe(panel,{attributes:true,attributeFilter:['hidden']});
      const original=Storage.prototype.setItem;
      window.monsterStorageWrites=0;
      Storage.prototype.setItem=function(k,v){if(k===PopEscape.CONFIG.storageKey)window.monsterStorageWrites++;return original.call(this,k,v);};
      const g=PopEscape.game;g.distance=456.75;g.misses=0;
      window.captureEventAt=performance.now();
      for(let i=0;i<5;i++){g.player.invincible=0;g.miss('spikes');}
      window.capturedGame=JSON.stringify(g);
      window.capturedStorage=localStorage.getItem(PopEscape.CONFIG.storageKey);
    }''')
    assert page.evaluate('PopEscape.game.mode')=='over'
    assert not page.locator('#result-screen').is_visible()
    page.wait_for_function('PopEscape.renderer.lastMonsterFrame.key === "capture01"')
    assert page.evaluate('PopEscape.renderer.lastMonsterFrame.source')=='image'
    page.screenshot(path='/tmp/poppun-monster-capture01.png',full_page=True)
    page.wait_for_function('PopEscape.renderer.lastMonsterFrame.key === "capture02"')
    assert not page.locator('#result-screen').is_visible()
    page.locator('#result-screen').wait_for(state='visible')
    result=page.evaluate('''() => ({
      seconds:(capturePanelShownAt-captureEventAt)/1000,
      stableGame:capturedGame===JSON.stringify(PopEscape.game),
      stableStorage:capturedStorage===localStorage.getItem(PopEscape.CONFIG.storageKey),
      writes:monsterStorageWrites,best:JSON.parse(capturedStorage).bests[3]
    })''')
    assert 0.6<=result['seconds']<=1.0,result
    assert result['stableGame'] and result['stableStorage'],result
    assert result['writes']==1 and result['best']==456,result
    assert page.locator('#result-distance').inner_text()=='456'
    page.click('#retry-button')
    page.wait_for_function('PopEscape.game.mode === "running" && PopEscape.renderer.lastMonsterFrame.state === "chase"')
    page.evaluate('PopEscape.game.misses=4;PopEscape.game.player.invincible=0;PopEscape.game.miss("bat")')
    page.evaluate('PopEscape.startTest(900)')
    page.evaluate('PopEscape.game.obstacleReadyAt=Infinity;PopEscape.game.nextQuestionDistance=Infinity')
    page.wait_for_timeout(1000)
    assert not page.locator('#result-screen').is_visible()
    assert page.evaluate('PopEscape.game.mode')=='running'
    print('PASS: 通常4枚・威嚇2枚・回復・一時停止・捕獲01→02→結果・記録1回保存・演出の持ち越しなし',result,flush=True)

    mobile=browser.new_context(viewport={'width':844,'height':390},is_mobile=True,has_touch=True,device_scale_factor=2)
    mp=mobile.new_page();mp.on('pageerror',lambda error:errors.append(str(error)))
    mp.goto(BASE,wait_until='networkidle');mp.evaluate('PopEscape.renderer.assetsReady')
    mp.locator('#start-button').tap()
    mp.evaluate('PopEscape.game.misses=3')
    mp.wait_for_function('PopEscape.renderer.lastMonsterFrame.state === "threat"')
    assert mp.evaluate('PopEscape.renderer.lastMonsterFrame.source')=='image'
    assert mp.evaluate('PopEscape.renderer.lastCharacterFrame.source')=='image'
    mp.screenshot(path='/tmp/poppun-monster-mobile.png',full_page=True)
    print('PASS: スマホで追手とポップンの画像を同時表示',flush=True)

    for pattern,count in [('**/chase_run_02.png',1),('**/assets/monsters/*.png',8)]:
        fallback=browser.new_context(viewport={'width':1280,'height':900})
        fallback.route(pattern,lambda route:route.abort())
        fp=fallback.new_page();fp.on('pageerror',lambda error:errors.append(str(error)))
        fp.goto(BASE,wait_until='networkidle');status=fp.evaluate('PopEscape.renderer.assetsReady')
        assert status[0]=={'loaded':11,'failed':[]},status
        assert len(status[1]['failed'])==count,status
        fp.click('#start-button')
        fp.wait_for_function('PopEscape.game.mode === "running" && PopEscape.renderer.lastMonsterFrame.source === "canvas"')
        assert fp.evaluate('PopEscape.renderer.lastCharacterFrame.source')=='image'
        fp.keyboard.press('ArrowUp');fp.wait_for_function('PopEscape.game.player.lane === 1')
        fp.evaluate('''() => {const g=PopEscape.game;for(let i=0;i<5;i++){g.player.invincible=0;g.miss('bat');}}''')
        fp.wait_for_function('PopEscape.renderer.lastMonsterFrame.state === "capture"')
        assert fp.evaluate('PopEscape.renderer.lastMonsterFrame.source')=='canvas'
        fp.locator('#result-screen').wait_for(state='visible')
        fallback.close()
    assert not errors,errors
    print('PASS: 追手の一部/全画像の失敗時にもCanvas捕獲→結果へ進み、ポップン画像は維持',flush=True)
    browser.close()
