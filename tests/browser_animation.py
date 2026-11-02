"""11-frame animation, alignment, touch and asset-failure smoke. Run an HTTP server first."""
import base64
import io
import os
from PIL import Image, ImageDraw
from playwright.sync_api import sync_playwright

BASE=os.environ.get('GAME_TEST_URL','http://127.0.0.1:8000')
with sync_playwright() as p:
    browser=p.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH','/usr/bin/chromium'),headless=True,args=['--no-sandbox'])
    context=browser.new_context(viewport={'width':1280,'height':900})
    page=context.new_page();errors=[]
    page.on('pageerror',lambda error:errors.append(str(error)))
    page.goto(BASE,wait_until='networkidle')
    status=page.evaluate('PopEscape.renderer.ready')
    assert status=={'loaded':11,'failed':[]},status
    assert page.evaluate('Object.values(PopEscape.renderer.images).every(i=>i.naturalWidth===512 && i.naturalHeight===512)')
    page.click('#start-button')
    page.keyboard.press('ArrowUp')
    page.wait_for_function('PopEscape.renderer.lastCharacterFrame.state === "jump"')
    assert page.evaluate('PopEscape.renderer.lastCharacterFrame.source')=='image'
    page.wait_for_function('PopEscape.game.player.grounded')
    page.keyboard.press('ArrowDown')
    page.wait_for_function('PopEscape.renderer.lastCharacterFrame.key === "fall"')
    page.wait_for_function('PopEscape.game.player.grounded')
    target=page.evaluate("""() => {
      const g=PopEscape.game;g.obstacles=[];g.obstacleReadyAt=Infinity;g.nextQuestionDistance=Infinity;
      g.beginQuestion();return g.question.choices.findIndex((_,i)=>PopEscape.MathQuiz.isCorrect(g.question,i))+1;
    }""")
    while page.evaluate('PopEscape.game.player.lane')!=target:
        current=page.evaluate('PopEscape.game.player.lane')
        page.keyboard.press('ArrowUp' if target<current else 'ArrowDown')
    page.wait_for_function('PopEscape.game.player.grounded')
    page.evaluate('PopEscape.game.question.elapsed=PopEscape.game.question.duration-0.025')
    page.wait_for_function('PopEscape.renderer.lastCharacterFrame.key === "happy"')
    page.keyboard.press('ArrowUp')
    page.wait_for_function('PopEscape.renderer.lastCharacterFrame.state === "jump"')
    assert page.evaluate('PopEscape.game.player.smile > 0')
    page.wait_for_function('PopEscape.game.player.grounded')
    page.wait_for_function('PopEscape.renderer.lastCharacterFrame.state === "run"')
    page.evaluate("PopEscape.game.miss('spikes')")
    page.wait_for_function('PopEscape.renderer.lastCharacterFrame.key === "stumble01"')
    page.wait_for_function('PopEscape.renderer.lastCharacterFrame.key === "stumble02"')
    page.wait_for_function('PopEscape.renderer.lastCharacterFrame.state === "run"')
    page.evaluate('PopEscape.game.misses=3')
    page.wait_for_function('PopEscape.renderer.lastCharacterFrame.key === "panic"')
    page.keyboard.press('Escape')
    snapshot=page.evaluate('JSON.stringify(PopEscape.game)')
    page.wait_for_timeout(100)
    assert page.evaluate('JSON.stringify(PopEscape.game)')==snapshot

    # Draw the same physical feet in each pose. The gallery is a diagnostic only;
    # original game PNGs are never cropped, resized or overwritten on disk.
    cases=[('run01',0,{}),('run02',1,{}),('run03',2,{}),('run04',3,{}),
      ('jump01',0,{'grounded':False,'vy':-660}),('jump02',0,{'grounded':False,'vy':-100}),
      ('fall',0,{'grounded':False,'vy':300}),('stumble01',0,{'stumble':0.48}),
      ('stumble02',0,{'stumble':0.1}),('panic',1,{'misses':3}),('happy',1,{'smile':1.7})]
    sheet=Image.new('RGB',(880,810),'#18343e');draw=ImageDraw.Draw(sheet)
    for i,(key,clock,values) in enumerate(cases):
        result=page.evaluate('''({key,clock,values})=>{
          const P=PopEscape,g=P.game,r=P.renderer,C=P.CONFIG;
          Object.assign(g.player,{lane:2,topLane:0,y:C.lanes[2],grounded:true,vy:0,stumble:0,smile:0,invincible:0});
          g.misses=values.misses||0;g.question=null;
          Object.assign(g.player,Object.fromEntries(Object.entries(values).filter(([k])=>k!=='misses')));
          const frame=P.CharacterAnimation.frame(g,clock);
          const pose=P.Visual.pose(g);
          const before=JSON.stringify(g);
          r.ctx.setTransform(1,0,0,1,0,0);r.ctx.clearRect(0,0,r.canvas.width,r.canvas.height);
          r.ctx.fillStyle='#18343e';r.ctx.fillRect(0,0,r.canvas.width,r.canvas.height);
          r.ctx.setTransform(3,0,0,3,0,0);
          r.pop(36,75,C.playerRadius,0,g.player,0,pose,frame);
          return {frame:r.lastCharacterFrame,before,after:JSON.stringify(g),png:r.canvas.toDataURL()};
        }''',{'key':key,'clock':clock,'values':values})
        assert result['frame']['key']==key,result['frame']
        assert result['frame']['source']=='image',result['frame']
        assert result['before']==result['after']
        image=Image.open(io.BytesIO(base64.b64decode(result['png'].split(',')[1]))).convert('RGB').crop((0,0,220,245))
        x=(i%4)*220;y=(i//4)*270
        sheet.paste(image,(x,y));draw.text((x+8,y+250),key,fill='white')
    sheet.save('/tmp/poppun-animation-gallery.png')
    print('PASS: 11枚ロード・PC操作・全状態画像・優先順位・足元/倍率・一時停止',flush=True)

    mobile=browser.new_context(viewport={'width':844,'height':390},is_mobile=True,has_touch=True,device_scale_factor=2)
    mp=mobile.new_page();mp.on('pageerror',lambda error:errors.append(str(error)))
    mp.goto(BASE,wait_until='networkidle');assert mp.evaluate('PopEscape.renderer.ready')['loaded']==11
    mp.locator('#start-button').tap()
    session=mobile.new_cdp_session(mp)
    for kind,y in [('touchStart',250),('touchMove',215),('touchEnd',None)]:
        session.send('Input.dispatchTouchEvent',{'type':kind,'touchPoints':[] if y is None else [{'x':600,'y':y}]})
    session.detach()
    mp.wait_for_function('PopEscape.renderer.lastCharacterFrame.state === "jump"')
    assert mp.evaluate('PopEscape.renderer.lastCharacterFrame.source')=='image'
    mp.wait_for_function('PopEscape.game.player.grounded')
    mp.screenshot(path='/tmp/poppun-animation-mobile.png',full_page=True)
    print('PASS: スマホ横向きの画像描画・スワイプ上昇画像',flush=True)

    for pattern,expected in [('**/popn_run_02.png',1),('**/assets/characters/*.png',11)]:
        fallback=browser.new_context(viewport={'width':1280,'height':900})
        fallback.route(pattern,lambda route:route.abort())
        fp=fallback.new_page();fp.on('pageerror',lambda error:errors.append(str(error)))
        fp.goto(BASE,wait_until='networkidle');status=fp.evaluate('PopEscape.renderer.ready')
        assert len(status['failed'])==expected,status
        fp.click('#start-button');fp.wait_for_function('PopEscape.game.mode === "running"')
        assert fp.evaluate('PopEscape.renderer.lastCharacterFrame.source')=='canvas'
        fp.keyboard.press('ArrowUp');fp.wait_for_function('PopEscape.game.player.lane === 1')
        fp.wait_for_timeout(120)
        assert fp.evaluate('PopEscape.renderer.lastCharacterFrame.source')=='canvas'
        fallback.close()
    assert not errors,errors
    print('PASS: 一部/全画像の読み込み失敗でも安定したCanvas代替と操作継続',flush=True)
    browser.close()
