"""任意の追加確認。Python + Playwright + Chromium が必要。
先に python3 -m http.server 8000 を起動。画像は /tmp に保存。
"""
import os
from pathlib import Path
from playwright.sync_api import sync_playwright, Error

BASE = os.environ.get('GAME_TEST_URL', 'http://127.0.0.1:8000')
ROOT = Path(__file__).resolve().parents[1]


def choose_answer(page, correct=True):
    target = page.evaluate('''correct => {
      const g=PopEscape.game, q=g.question;
      return q.choices.findIndex((_,i)=>PopEscape.MathQuiz.isCorrect(q,i)===correct)
        +(q.choices.length===3?0:1);
    }''', correct)
    current = page.evaluate('PopEscape.game.player.lane')
    for _ in range(abs(target-current)):
        page.keyboard.press('ArrowUp' if target < current else 'ArrowDown')
    assert page.evaluate('PopEscape.game.player.lane') == target


def finish_question(page):
    page.evaluate('PopEscape.game.question.elapsed=PopEscape.game.question.duration-0.025')
    page.wait_for_function('PopEscape.game.question === null')


def swipe(page, x, y, dy):
    cdp = page.context.new_cdp_session(page)
    cdp.send('Input.dispatchTouchEvent', {'type': 'touchStart', 'touchPoints': [{'x': x, 'y': y}]})
    cdp.send('Input.dispatchTouchEvent', {'type': 'touchMove', 'touchPoints': [{'x': x, 'y': y+dy}]})
    cdp.send('Input.dispatchTouchEvent', {'type': 'touchEnd', 'touchPoints': []})
    cdp.detach()


with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH', '/usr/bin/chromium'), headless=True, args=['--no-sandbox'])
    context = browser.new_context(viewport={'width': 1440, 'height': 1080}, reduced_motion='reduce')
    page = context.new_page()
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.goto(BASE, wait_until='networkidle')
    assert page.locator('.grade-options button:disabled').count() == 4
    assert page.locator('[data-grade="3"]').get_attribute('aria-pressed') == 'true'
    page.screenshot(path='/tmp/poppun-title.png', full_page=True)
    page.click('[data-grade="4"]')
    page.click('#start-button')
    assert page.evaluate('PopEscape.game.grade') == 4
    page.keyboard.press('ArrowUp')
    page.wait_for_timeout(850)
    assert page.evaluate('PopEscape.game.player.grounded && PopEscape.game.player.lane===1')
    page.keyboard.press('ArrowDown')
    page.wait_for_timeout(550)
    assert page.evaluate('PopEscape.game.player.grounded && PopEscape.game.player.lane===2')
    page.keyboard.press('Escape')
    assert page.locator('#pause-screen').is_visible()
    distance = page.evaluate('PopEscape.game.distance')
    page.wait_for_timeout(100)
    assert page.evaluate('PopEscape.game.distance') == distance
    page.click('#resume-button')
    # 最初の問題の予定時刻を早め、通常の更新処理で開始。
    page.evaluate('PopEscape.game.nextQuestionDistance=0;PopEscape.game.questionReadyAt=0;PopEscape.game.obstacles=[]')
    page.wait_for_function('PopEscape.game.question !== null')
    assert page.evaluate('PopEscape.game.question.choices.length') == 2
    assert page.locator('#question-banner').is_visible()
    choose_answer(page)
    page.screenshot(path='/tmp/poppun-question.png', full_page=True)
    finish_question(page)
    assert page.evaluate('PopEscape.game.correct===1 && PopEscape.game.total===1 && PopEscape.game.misses===0')
    page.evaluate('PopEscape.game.distance=1500; PopEscape.game.beginQuestion()')
    assert page.evaluate('PopEscape.game.question.choices.length') == 3
    page.keyboard.press('ArrowUp'); page.keyboard.press('ArrowUp')
    assert page.evaluate('PopEscape.game.player.lane') == 0
    choose_answer(page, False)
    finish_question(page)
    assert page.evaluate('PopEscape.game.misses') == 1
    page.wait_for_timeout(1300)
    page.evaluate('PopEscape.game.beginQuestion()')
    assert page.locator('#question-banner').evaluate('element=>element.classList.contains("special")')
    choose_answer(page)
    page.wait_for_timeout(150)
    page.screenshot(path='/tmp/poppun-special.png', full_page=True)
    finish_question(page)
    assert page.evaluate('PopEscape.game.misses===0 && PopEscape.game.correct===2 && PopEscape.game.total===3')
    page.evaluate('''() => {
      const g=PopEscape.game;
      for(let i=0;i<5;i++){g.player.invincible=0;g.miss('hole');}
    }''')
    page.locator('#result-screen').wait_for(state='visible')
    assert page.locator('#result-total').inner_text() == '3'
    best = page.locator('#result-best').inner_text()
    page.screenshot(path='/tmp/poppun-result.png', full_page=True)
    page.click('#retry-button')
    assert page.evaluate('PopEscape.game.misses===0 && PopEscape.game.total===0 && PopEscape.game.grade===4')
    page.keyboard.press('Escape');page.click('#pause-home-button')
    assert page.locator('#title-best').inner_text() == best
    page.click('[data-grade="3"]')
    assert page.locator('#title-best').inner_text() == '0'
    page.reload(wait_until='networkidle')
    page.click('[data-grade="4"]')
    assert page.locator('#title-best').inner_text() == best
    page.click('#sound-button')
    assert page.locator('#sound-button').get_attribute('aria-pressed') == 'false'
    assert not errors, errors
    print('PASS: PC操作・2択/3択・正解/不正解・回復・一時停止・結果・学年別保存・再読み込み', flush=True)
    page.click('#start-button')
    page.wait_for_timeout(2400)
    assert page.evaluate('PopEscape.game.obstacles.some(o=>o.kind==="bat" && o.x<PopEscape.CONFIG.width)')
    assert page.evaluate('PopEscape.game.question===null && PopEscape.game.misses===0')
    page.screenshot(path='/tmp/poppun-early-bat.png',full_page=True)
    print('PASS: 自然なゲーム進行で開始2.4秒後にコウモリが画面内に登場',flush=True)


    # 3段専用配置を実際のGame生成とCanvas描画へ通す。
    page.evaluate("""() => {
      const g=PopEscape.game,C=PopEscape.CONFIG;
      g.start(4);g.distance=2500;g.syncLanes();
      g.speed=C.startSpeed+(C.maxSpeed-C.startSpeed)*(1-Math.exp(-g.distance/C.speedGrowthDistance));
      g.nextQuestionDistance=Infinity;g.obstacleTimer=0;
      g.update(C.fixedStep);g.pause();
    }""")
    assert page.evaluate('PopEscape.game.obstacles.length') >= 8
    assert page.evaluate('new Set(PopEscape.game.obstacles.map(o=>o.wave)).size') == 4
    assert page.evaluate('PopEscape.game.obstacles.every(o=>o.lane!==o.safeLane)')
    page.wait_for_timeout(100)
    assert not errors, errors
    page.screenshot(path='/tmp/poppun-three-lanes.png',full_page=True)
    print('PASS: 2500mの3段専用・2段同時封鎖×4波の生成とCanvas描画',flush=True)

    mobile = browser.new_context(viewport={'width': 844, 'height': 390}, device_scale_factor=2, is_mobile=True, has_touch=True)
    mp = mobile.new_page()
    mp.on('pageerror', lambda error: errors.append(str(error)))
    mp.goto(BASE, wait_until='networkidle')
    mp.screenshot(path='/tmp/poppun-mobile-title.png', full_page=True)
    mp.click('#start-button')
    swipe(mp, 600, 250, -32)
    assert mp.evaluate('PopEscape.game.player.lane') == 1
    mp.wait_for_timeout(850)
    swipe(mp, 600, 200, 28)
    assert mp.evaluate('PopEscape.game.player.lane') == 2
    mp.wait_for_timeout(500)
    mp.evaluate("""() => {
      const g=PopEscape.game;g.nextQuestionDistance=99999;g.obstacleTimer=Infinity;
      g.obstacles=[{kind:'bat',lane:2,x:800,width:36,age:0,seed:0}];
    }""")
    mp.wait_for_timeout(100)
    mp.screenshot(path='/tmp/poppun-bat.png', full_page=True)
    mp.evaluate('PopEscape.game.obstacles[0].x=PopEscape.CONFIG.playerX')
    mp.wait_for_function('PopEscape.game.misses===1')
    mp.evaluate("PopEscape.game.obstacles=[{kind:'bat',lane:2,x:310,width:36,age:0,seed:0}]")
    mp.wait_for_timeout(100)
    assert mp.evaluate('PopEscape.game.misses') == 1
    mp.evaluate('PopEscape.game.obstacles=[]')
    mp.wait_for_timeout(1300)
    # 急降下型・群れ型も実際のCanvas描画に通す。
    before_y=mp.evaluate("""() => {
      const g=PopEscape.game, C=PopEscape.CONFIG;
      g.distance=2500;
      g.speed=C.startSpeed+(C.maxSpeed-C.startSpeed)*(1-Math.exp(-g.distance/C.speedGrowthDistance));
      const rate=g.speed*C.batSpeedFactor;
      g.obstacles=[{kind:'bat',batType:'dive',lane:2,width:36,seed:0,age:0,
        x:800,diveRate:rate,diveStartX:805},
        {kind:'bat',batType:'flock',lane:1,width:36,seed:0.3,age:0,x:1080},
        {kind:'bat',batType:'flock',lane:2,width:36,seed:0.5,age:0,x:1390}];
      // 撮影中もゲームは進む。衝突後に配列から除かれても同じ個体を検証する。
      window.smokeDive=g.obstacles[0];
      return PopEscape.Obstacles.batY(window.smokeDive);
    }""")
    mp.wait_for_timeout(100)
    mp.screenshot(path='/tmp/poppun-dive-warning.png', full_page=True)
    mp.wait_for_timeout(600)
    after_y=mp.evaluate('PopEscape.Obstacles.batY(window.smokeDive)')
    assert after_y>before_y+15
    mp.screenshot(path='/tmp/poppun-flock-dive.png', full_page=True)
    mp.evaluate('PopEscape.game.obstacles=[]')
    mp.wait_for_function('PopEscape.game.player.stumble===0')
    mp.evaluate('PopEscape.game.distance=1200;PopEscape.game.beginQuestion()')
    swipe(mp, 600, 250, -20)
    assert mp.evaluate('PopEscape.game.player.lane') == 1
    swipe(mp, 600, 250, -20)
    assert mp.evaluate('PopEscape.game.player.lane') == 0
    mp.wait_for_timeout(200)
    mp.screenshot(path='/tmp/poppun-mobile-question.png', full_page=True)
    assert mp.evaluate('window.scrollY===0 && document.documentElement.scrollWidth<=innerWidth')
    mp.set_viewport_size({'width': 390, 'height': 844})
    mp.locator('#rotate-notice').wait_for(state='visible')
    mp.wait_for_function('PopEscape.game.mode === "paused"')
    assert not errors, errors
    print('PASS: スマホ横向き・短い上下スワイプ・3段移動・スクロール抑制・縦向き自動停止', flush=True)

    dev = context.new_page()
    dev.on('pageerror', lambda error: errors.append(str(error)))
    dev.goto(BASE + '/?devStart=3000',wait_until='networkidle')
    stored = dev.evaluate('localStorage.getItem(PopEscape.CONFIG.storageKey)')
    dev.click('#start-button')
    assert dev.evaluate('PopEscape.game.testMode && PopEscape.game.distance>=3000')
    dev.evaluate("""() => {
      const g=PopEscape.game;
      for(let i=0;i<5;i++){g.player.invincible=0;g.miss('spikes');}
    }""")
    dev.locator('#result-screen').wait_for(state='visible')
    assert '保存されません' in dev.locator('#result-message').inner_text()
    assert dev.evaluate('localStorage.getItem(PopEscape.CONFIG.storageKey)') == stored
    dev.click('#retry-button')
    assert dev.evaluate('PopEscape.game.testMode && PopEscape.game.distance>=3000')
    for distance in [900,1500,2000,3000]:
        # 開始直後の状態を同じ評価内で取得し、RAFによる距離の進行と競合させない。
        initial = dev.evaluate('''async d => {
          await PopEscape.startTest(d);
          const g=PopEscape.game;
          return {distance:g.distance,testMode:g.testMode,topLane:g.player.topLane};
        }''', distance)
        assert initial == {'distance':distance,'testMode':True,'topLane':0}, initial
    dev.evaluate('PopEscape.endTest()')
    dev.click('#start-button')
    assert dev.evaluate('!PopEscape.game.testMode && PopEscape.game.distance<20')
    dev.evaluate("""() => {
      const g=PopEscape.game;
      g.distance=3000;g.syncLanes();g.nextQuestionDistance=Infinity;g.obstacleReadyAt=Infinity;
      g.obstacles=[{kind:'spikes',lane:0,x:700,width:100,age:0},
        {kind:'spikes',lane:1,x:900,width:100,age:0},
        {kind:'hole',lane:2,x:1050,width:100,age:0}];
    }""")
    dev.wait_for_timeout(100)
    dev.screenshot(path='/tmp/poppun-spikes.png',full_page=True)
    assert not errors, errors
    print('PASS: 開発用4距離・再挑戦・通常モード復帰・最高記録非保存・トゲCanvas描画',flush=True)
    dev.close()

    direct = context.new_page()
    direct.on('pageerror', lambda error: errors.append(str(error)))
    try:
        direct.goto((ROOT / 'index.html').as_uri())
    except Error as error:
        if 'ERR_BLOCKED_BY_ADMINISTRATOR' not in str(error):
            raise
        print('SKIP: この環境のブラウザ管理ポリシーでfile://が禁止されています。HTTP経由は確認済み。', flush=True)
    else:
        direct.click('#start-button')
        assert direct.evaluate('PopEscape.game.mode') == 'running'
        assert not errors, errors
        print('PASS: index.htmlを直接開いて起動・JavaScript実行エラーなし', flush=True)
    browser.close()
