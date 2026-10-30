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
    page.evaluate('PopEscape.game.nextQuestionAt=0')
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
    assert page.locator('#result-screen').is_visible()
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
