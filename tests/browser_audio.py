"""Real Web Audio integration. Add --loop for a full 58s playback cycle.
Run an HTTP server first. Physical iPhone/Safari is not simulated by Chromium.
"""
import os
import sys
from playwright.sync_api import sync_playwright
BASE=os.environ.get('GAME_TEST_URL','http://127.0.0.1:8000')
with sync_playwright() as p:
    browser=p.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH','/usr/bin/chromium'),headless=True,args=['--no-sandbox','--autoplay-policy=user-gesture-required'])
    page=browser.new_page(viewport={'width':1280,'height':900})
    errors=[]
    page.on('pageerror',lambda e:errors.append(str(e)))
    page.goto(BASE,wait_until='networkidle')
    assert page.evaluate('!PopEscape.audio.context')
    page.click('#start-button')
    page.wait_for_function('PopEscape.audio.context?.state==="running" && PopEscape.audio.sources.length===2')
    page.evaluate('''() => {
      const a=PopEscape.audio,g=PopEscape.game;
      g.obstacles=[];g.obstacleReadyAt=Infinity;g.nextQuestionDistance=Infinity;
      const analyser=a.context.createAnalyser(),silent=a.context.createGain();
      analyser.fftSize=2048;silent.gain.value=0;a.limiter.connect(analyser);analyser.connect(silent);silent.connect(a.context.destination);
      window.audioSample=()=>{const data=new Float32Array(analyser.fftSize);analyser.getFloatTimeDomainData(data);
        return {rms:Math.sqrt(data.reduce((sum,v)=>sum+v*v,0)/data.length),peak:Math.max(...data.map(Math.abs))};};
    }''')
    page.wait_for_timeout(250)
    assert page.evaluate('audioSample().rms')>.0001
    assert page.evaluate('PopEscape.audio.sources.every(s=>s.loop && Math.abs(s.loopEnd-58.181818)<.001)')
    page.keyboard.press('Escape')
    page.wait_for_timeout(100)
    frozen=page.evaluate('PopEscape.audio.context.currentTime')
    page.wait_for_timeout(150)
    assert page.evaluate('PopEscape.audio.context.state')=='suspended'
    assert page.evaluate('PopEscape.audio.context.currentTime')==frozen
    page.click('#resume-button')
    page.wait_for_function('PopEscape.audio.context.state==="running"')
    assert page.evaluate('PopEscape.audio.musicStarts')==1
    page.keyboard.press('ArrowUp')
    page.wait_for_function('PopEscape.audio.counts.jump===1')
    page.wait_for_function('PopEscape.game.player.grounded')
    page.keyboard.press('ArrowDown')
    page.wait_for_function('PopEscape.audio.counts.down===1')
    page.evaluate('PopEscape.game.beginQuestion()')
    page.wait_for_function('PopEscape.audio.counts.question===1')
    page.wait_for_timeout(70)
    assert page.evaluate('PopEscape.audio.bgm.gain.value')<.4
    page.evaluate('''() => {
      const g=PopEscape.game;
      g.player.lane=g.question.choices.findIndex((_,i)=>PopEscape.MathQuiz.isCorrect(g.question,i))+1;
      g.resolveQuestion();
    }''')
    page.wait_for_function('PopEscape.audio.counts.correct===1')
    page.wait_for_timeout(200)
    page.evaluate('PopEscape.game.player.invincible=0;PopEscape.game.miss("bat")')
    assert page.evaluate('PopEscape.audio.counts.miss')==1
    page.wait_for_timeout(220)
    page.evaluate('''() => {
      const g=PopEscape.game;g.player.invincible=0;g.beginQuestion();
      g.player.lane=g.question.choices.findIndex((_,i)=>!PopEscape.MathQuiz.isCorrect(g.question,i))+1;
      g.resolveQuestion();
    }''')
    assert page.evaluate('PopEscape.audio.counts.miss')==2
    page.wait_for_timeout(220)
    page.evaluate('''() => {
      const g=PopEscape.game;g.misses=2;g.questionCount=2;g.beginQuestion();
      if(!g.question.special)throw Error('expected recovery question');
      g.player.lane=g.question.choices.findIndex((_,i)=>PopEscape.MathQuiz.isCorrect(g.question,i))+1;g.resolveQuestion();
    }''')
    assert page.evaluate('PopEscape.audio.counts.recover')==1
    page.evaluate('''() => {
      const g=PopEscape.game;g.distance=899.99;g.syncLanes();g.nextQuestionDistance=Infinity;
      g.obstacleReadyAt=Infinity;g.obstacles=[];
    }''')
    page.wait_for_function('PopEscape.audio.counts.grow===1')
    page.wait_for_timeout(950)
    assert page.evaluate('PopEscape.audio.tensionGain.gain.value')>.99
    page.wait_for_timeout(100)
    assert page.evaluate('PopEscape.audio.counts.grow')==1
    # Mix stress: one damage per burst, bounded polyphony, finite unclipped output.
    page.evaluate('''() => {const a=PopEscape.audio;window.beforeMiss=a.counts.miss;
      for(let i=0;i<20;i++){a.play('miss');a.play('correct');a.play('recover');a.play('grow');}
    }''')
    assert page.evaluate('PopEscape.audio.counts.miss-beforeMiss')==1
    assert page.evaluate('PopEscape.audio.voices.size')<=32
    page.wait_for_timeout(70)
    sample=page.evaluate('audioSample()')
    assert 0<sample['rms'] and sample['peak']<1,sample
    # Hide suspends sound and input's existing blur handler pauses the game.
    page.evaluate('''() => {PopEscape.audio.setVisible(false);window.dispatchEvent(new Event('blur'));}''')
    page.wait_for_timeout(100)
    assert page.evaluate('PopEscape.game.mode==="paused" && PopEscape.audio.context.state==="suspended"')
    page.evaluate('PopEscape.audio.setVisible(true)')
    page.wait_for_timeout(50)
    assert page.evaluate('PopEscape.audio.context.state')=='suspended'
    page.click('#audio-settings-pause')
    page.locator('#audio-bgm-enabled').uncheck()
    page.locator('#audio-sfx-enabled').uncheck()
    page.locator('#audio-muted').check()
    page.locator('#audio-bgm-volume').evaluate("el=>{el.value='32';el.dispatchEvent(new Event('input',{bubbles:true}));}")
    page.locator('#audio-sfx-volume').evaluate("el=>{el.value='46';el.dispatchEvent(new Event('input',{bubbles:true}));}")
    page.click('#audio-settings-close')
    page.click('#resume-button')
    page.wait_for_timeout(120)
    assert page.evaluate('PopEscape.audio.master.gain.value')==0
    assert page.evaluate('audioSample().rms')<.00001
    page.reload(wait_until='networkidle')
    assert page.evaluate('PopEscape.audio.settings')=={'muted':True,'bgmEnabled':False,'sfxEnabled':False,'bgmVolume':.32,'sfxVolume':.46}
    page.click('#audio-settings-open')
    page.locator('#audio-muted').uncheck()
    page.locator('#audio-bgm-enabled').check()
    page.locator('#audio-sfx-enabled').check()
    page.click('#audio-settings-close')
    page.click('#start-button')
    page.wait_for_function('PopEscape.audio.sources.length===2')
    page.evaluate('''() => {const g=PopEscape.game;g.obstacles=[];g.obstacleReadyAt=Infinity;g.nextQuestionDistance=Infinity;}''')
    if '--loop' in sys.argv:
        wait=page.evaluate('Math.max(0,(PopEscape.CONFIG.audio.loopEnd+.3-(PopEscape.audio.context.currentTime-PopEscape.audio.musicStartedAt))*1000)')
        print('Checking one complete music loop in real time...',flush=True)
        page.wait_for_timeout(wait)
        assert page.evaluate('PopEscape.audio.musicStarts')==1
        assert page.evaluate('PopEscape.audio.sources.length')==2
        assert page.evaluate('PopEscape.audio.context.currentTime-PopEscape.audio.musicStartedAt')>58.18
        page.evaluate('''() => {const a=PopEscape.audio;const analyser=a.context.createAnalyser(),silent=a.context.createGain();
          analyser.fftSize=2048;silent.gain.value=0;a.limiter.connect(analyser);analyser.connect(silent);silent.connect(a.context.destination);
          window.loopRms=()=>{const data=new Float32Array(2048);analyser.getFloatTimeDomainData(data);return Math.sqrt(data.reduce((s,v)=>s+v*v,0)/data.length);};
        }''')
        page.wait_for_timeout(100)
        assert page.evaluate('loopRms()')>.0001
        print('PASS: complete 58.18s loop with audible output and without creating new sources',flush=True)
    page.evaluate('''() => {const g=PopEscape.game;g.misses=4;g.player.invincible=0;g.miss('spikes');}''')
    assert page.evaluate('PopEscape.audio.counts.over')==1
    page.wait_for_timeout(750)
    assert page.evaluate('PopEscape.audio.baseGain.gain.value')==0
    page.locator('#result-screen').wait_for(state='visible')
    assert not errors,errors
    print('PASS: gesture unlock, decoded loops, pause/resume phase, jump/down, question ducking, correct/recovery, shared damage, 900m growth, fade on capture, mix headroom, persisted settings',flush=True)
    mobile=browser.new_context(viewport={'width':844,'height':390},is_mobile=True,has_touch=True)
    mp=mobile.new_page();mp.goto(BASE,wait_until='networkidle');mp.locator('#start-button').tap()
    mp.wait_for_function('PopEscape.audio.context?.state==="running" && PopEscape.audio.sources.length===2')
    mp.locator('#pause-button').tap();mp.locator('#audio-settings-pause').tap()
    assert mp.locator('#audio-settings-close').is_visible()
    assert mp.evaluate('document.getElementById("audio-settings").getBoundingClientRect().height<=innerHeight')
    mp.screenshot(path='/tmp/audio-settings-mobile.png',full_page=True)
    mp.locator('#audio-settings-close').tap();mp.locator('#resume-button').tap()
    mp.wait_for_function('PopEscape.audio.context.state==="running"')
    print('PASS: mobile touch unlock and reachable landscape settings/resume',flush=True)
    broken=browser.new_context()
    broken.route('**/assets/audio/*.mp3',lambda route:route.fulfill(status=200,content_type='audio/mpeg',body='not an audio file'))
    bp=broken.new_page();broken_errors=[]
    bp.on('pageerror',lambda e:broken_errors.append(str(e)))
    bp.goto(BASE,wait_until='networkidle');bp.click('#start-button')
    bp.wait_for_function('PopEscape.audio.status.music==="unavailable"')
    bp.keyboard.press('ArrowUp')
    assert bp.evaluate('PopEscape.audio.counts.jump')==1
    assert bp.evaluate('PopEscape.game.mode')=='running'
    assert not broken_errors,broken_errors
    broken.close()
    print('PASS: invalid music still allows synthesized effects and gameplay',flush=True)
    unsupported=browser.new_page()
    unsupported.add_init_script('window.AudioContext=undefined;window.webkitAudioContext=undefined')
    unsupported.goto(BASE,wait_until='networkidle');unsupported.click('#start-button')
    assert unsupported.evaluate('PopEscape.game.mode')=='running'
    print('PASS: unavailable Web Audio does not block play',flush=True)
    browser.close()
