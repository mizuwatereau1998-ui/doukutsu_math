"""Stage-size growth, one-shot 900m presentation, visibility and unchanged gameplay."""
import os
from playwright.sync_api import sync_playwright
BASE=os.environ.get('GAME_TEST_URL','http://127.0.0.1:8000')
CROSS='''() => {const g=PopEscape.game;g.distance=899.9;g.obstacles=[];
  g.nextQuestionDistance=Infinity;g.obstacleReadyAt=Infinity;}'''
with sync_playwright() as p:
    browser=p.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH','/usr/bin/chromium'),headless=True,args=['--no-sandbox'])
    context=browser.new_context(viewport={'width':1280,'height':900})
    page=context.new_page();errors=[]
    page.on('pageerror',lambda e:errors.append(str(e)))
    page.goto(BASE,wait_until='networkidle');page.evaluate('PopEscape.renderer.assetsReady')
    page.click('#start-button')
    page.wait_for_function('PopEscape.renderer.lastMonsterFrame.levelStage === "twoLane"')
    initial=page.evaluate('PopEscape.renderer.lastMonsterFrame')
    assert initial['levelScale']==1.5 and initial['source']=='image',initial
    page.screenshot(path='/tmp/poppun-monster-two-lanes.png',full_page=True)
    page.evaluate(CROSS)
    page.wait_for_function('PopEscape.renderer.lastMonsterFrame.levelStage === "levelUp"')
    page.wait_for_function('PopEscape.renderer.lastMonsterFrame.levelProgress>=0.15')
    page.screenshot(path='/tmp/poppun-monster-level-up.png',full_page=True)
    page.keyboard.press('Escape')
    frozen=page.evaluate('({game:JSON.stringify(PopEscape.game),scale:PopEscape.renderer.lastMonsterFrame.levelScale})')
    page.wait_for_timeout(200)
    assert page.evaluate('JSON.stringify(PopEscape.game)')==frozen['game']
    assert page.evaluate('PopEscape.renderer.lastMonsterFrame.levelScale')==frozen['scale']
    page.keyboard.press('Escape')
    page.wait_for_function('PopEscape.renderer.lastMonsterFrame.levelStage === "threeLane"')
    grown=page.evaluate('PopEscape.renderer.lastMonsterFrame')
    assert grown['levelScale']==2.2,grown
    assert grown['renderScale']>initial['renderScale']*1.4
    assert page.evaluate('PopEscape.game.distance')>900
    assert page.evaluate('PopEscape.game.mode')=='running'
    page.screenshot(path='/tmp/poppun-monster-three-lanes.png',full_page=True)
    page.evaluate('PopEscape.game.beginQuestion()')
    page.locator('#question-banner').wait_for(state='visible')
    visible=page.evaluate('''() => {
      const r=PopEscape.renderer,C=PopEscape.CONFIG,canvas=r.canvas.getBoundingClientRect();
      const q=document.getElementById('question-banner').getBoundingClientRect();
      return {right:r.lastMonsterFrame.renderRight,limit:C.playerX-C.monsterAnimation.frontClearance,
        questionLeft:(q.left-canvas.left)/canvas.width*C.width,hero:r.lastCharacterFrame.source};
    }''')
    assert visible['right']<=visible['limit'] and visible['questionLeft']>visible['right'],visible
    assert visible['hero']=='image'
    page.evaluate('PopEscape.game.misses=3')
    page.wait_for_function('PopEscape.renderer.lastMonsterFrame.state === "threat"')
    assert page.evaluate('PopEscape.renderer.lastMonsterFrame.levelScale')==2.2
    page.screenshot(path='/tmp/poppun-monster-upgraded-threat.png',full_page=True)
    page.evaluate('''() => {const g=PopEscape.game;while(g.misses<5){g.player.invincible=0;g.miss('bat');}}''')
    page.wait_for_function('PopEscape.renderer.lastMonsterFrame.presentationState === "capture"')
    assert page.evaluate('PopEscape.renderer.lastMonsterFrame.levelScale')==2.2
    page.screenshot(path='/tmp/poppun-monster-upgraded-capture.png',full_page=True)
    page.locator('#result-screen').wait_for(state='visible')
    page.click('#retry-button')
    page.wait_for_function('PopEscape.renderer.lastMonsterFrame.levelStage === "twoLane"')
    assert page.evaluate('PopEscape.renderer.lastMonsterFrame.levelScale')==1.5
    page.evaluate('PopEscape.startTest(3000)')
    page.wait_for_function('PopEscape.renderer.lastMonsterFrame.levelStage === "threeLane"')
    assert page.evaluate('PopEscape.renderer.lastMonsterFrame.levelProgress')==1
    print('PASS: 2段1.5倍→900mで強化→3段2.2倍・一時停止・視認性・威嚇/捕獲優先・新規プレイ初期化',visible,flush=True)

    mobile=browser.new_context(viewport={'width':844,'height':390},is_mobile=True,has_touch=True,device_scale_factor=2)
    mp=mobile.new_page();mp.on('pageerror',lambda e:errors.append(str(e)))
    mp.goto(BASE,wait_until='networkidle');mp.locator('#start-button').tap()
    mp.wait_for_function('PopEscape.renderer.lastMonsterFrame.levelStage === "twoLane"')
    mp.screenshot(path='/tmp/poppun-monster-two-lanes-mobile.png',full_page=True)
    mp.evaluate(CROSS);mp.wait_for_function('PopEscape.renderer.lastMonsterFrame.levelStage === "threeLane"')
    assert mp.evaluate('PopEscape.renderer.lastMonsterFrame.renderRight<=PopEscape.CONFIG.playerX-PopEscape.CONFIG.monsterAnimation.frontClearance')
    assert mp.evaluate('PopEscape.renderer.lastCharacterFrame.source')=='image'
    mp.screenshot(path='/tmp/poppun-monster-three-lanes-mobile.png',full_page=True)
    mp.emulate_media(reduced_motion='reduce')
    mp.evaluate('PopEscape.endTest()');mp.locator('#start-button').tap();mp.evaluate(CROSS)
    mp.wait_for_function('PopEscape.renderer.lastMonsterFrame.levelStage === "levelUp"')
    reduced=mp.evaluate('PopEscape.renderer.monsterLevel(PopEscape.game)')
    assert [reduced['sx'],reduced['sy'],reduced['shakeX'],reduced['brightness']]==[1,1,0,1],reduced
    mp.wait_for_function('PopEscape.renderer.lastMonsterFrame.levelStage === "threeLane"')
    print('PASS: スマホ2段/3段表示・ポップンのPNG維持・動きを減らす設定',flush=True)

    fallback=browser.new_context(viewport={'width':1280,'height':900})
    fallback.route('**/assets/monsters/*.png',lambda route:route.abort())
    fp=fallback.new_page();fp.on('pageerror',lambda e:errors.append(str(e)))
    fp.goto(BASE,wait_until='networkidle');fp.click('#start-button')
    fp.wait_for_function('PopEscape.renderer.lastMonsterFrame.levelStage === "twoLane"')
    fp.evaluate(CROSS);fp.wait_for_function('PopEscape.renderer.lastMonsterFrame.levelStage === "threeLane"')
    assert fp.evaluate('PopEscape.renderer.lastMonsterFrame.source')=='canvas'
    assert fp.evaluate('PopEscape.renderer.lastCharacterFrame.source')=='image'
    assert not errors,errors
    print('PASS: 画像失敗時のCanvas追手も強化され、ゲームと主人公画像は正常',flush=True)
    browser.close()
