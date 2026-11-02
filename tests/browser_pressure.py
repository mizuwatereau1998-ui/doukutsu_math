"""Live RAF/input smoke for the 3000m mode. Start the HTTP server first."""
import os
from playwright.sync_api import sync_playwright

with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH', '/usr/bin/chromium'), headless=True, args=['--no-sandbox'])
    page = browser.new_page(viewport={'width':1280,'height':900})
    errors=[]
    page.on('pageerror',lambda error:errors.append(str(error)))
    page.goto(os.environ.get('GAME_TEST_URL','http://127.0.0.1:8000'),wait_until='networkidle')
    page.evaluate("""async () => {
      let seed=81;
      PopEscape.game.rng=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/2**32);
      await PopEscape.startTest(3000);
      const g=PopEscape.game,C=PopEscape.CONFIG;
      const status=window.pressureTest={done:false,error:null,inputs:0,groups:0,replanMisses:0,lastInput:-Infinity};
      let cached=null;
      function key(direction) {
        document.body.dispatchEvent(new KeyboardEvent('keydown',{
          code:direction<0?'ArrowUp':'ArrowDown',bubbles:true}));
        status.inputs++;status.lastInput=g.elapsed;
      }
      function drive() {
        try {
          if(g.elapsed>=24 || g.mode==='over') {status.done=true;return;}
          if(g.question) {
            const target=g.question.choices.findIndex((_,i)=>PopEscape.MathQuiz.isCorrect(g.question,i));
            if(target!==g.player.lane && g.elapsed-status.lastInput>=0.2)key(target<g.player.lane?-1:1);
            cached=null;
          } else {
            const obstacles=g.obstacles.filter(o=>o.x+o.width>=C.playerX-C.playerRadius);
            if(!cached || cached.refresh || obstacles.some(o=>!cached.obstacles.includes(o))) {
              const route=PopEscape.Obstacles.findRoute(g.player,obstacles,g.distance,{
                firstInputAfter:Math.max(0,C.transitionInputSeconds-(g.elapsed-status.lastInput))});
              if(route){cached={obstacles,at:g.elapsed,actions:route.actions};status.groups++;}
              else if(cached){
                // A bounded search can miss a route from a new RAF phase. Keep the
                // remaining proven input sequence rather than declaring it impossible.
                status.replanMisses++;cached.refresh=false;
              }else throw new Error('No live route at '+g.distance);
            }
            const action=cached.actions[0];
            if(action && g.elapsed-cached.at+1e-8>=action.step*C.fixedStep && g.elapsed-status.lastInput>=C.transitionInputSeconds) {
              // RAF can execute several physics ticks between callbacks. Replan after an
              // actual input instead of assuming an old ideal schedule still matches.
              key(action.direction);cached.actions.shift();cached.refresh=true;
            }
          }
          requestAnimationFrame(drive);
        }catch(error){status.error=String(error);status.done=true;}
      }
      requestAnimationFrame(drive);
    }""")
    page.wait_for_function('pressureTest.done',timeout=60000)
    result=page.evaluate('({...pressureTest,misses:PopEscape.game.misses,questions:PopEscape.game.total,elapsed:PopEscape.game.elapsed})')
    assert not errors,errors
    assert result['error'] is None,result
    assert result['elapsed']>=24,result
    assert result['misses']==0,result
    assert result['inputs']>=20,result
    assert result['questions']>=2,result
    page.screenshot(path='/tmp/poppun-pressure.png',full_page=True)
    print('PASS: 3000m 実時間RAF＋上下キーイベントの連続走行',result,flush=True)
    browser.close()
