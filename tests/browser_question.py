"""Arithmetic visuals: cream/purple panels, equal answers, same motion/rules, mobile."""
import os
from playwright.sync_api import sync_playwright
BASE=os.environ.get('GAME_TEST_URL','http://127.0.0.1:8000')
with sync_playwright() as p:
    browser=p.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH','/usr/bin/chromium'),headless=True,args=['--no-sandbox'])
    for mobile in [False,True]:
        context=browser.new_context(viewport={'width':844,'height':390} if mobile else {'width':1440,'height':1000},is_mobile=mobile,has_touch=mobile)
        page=context.new_page();errors=[]
        page.on('pageerror',lambda e:errors.append(str(e)))
        page.goto(BASE,wait_until='networkidle');page.click('#start-button')
        page.keyboard.press('Escape')
        for count in [2,3]:
            report=page.evaluate('''count=>{
              const P=PopEscape,g=P.game,r=P.renderer,C=P.CONFIG;
              g.distance=count===3?1500:0;g.player.topLane=count===3?0:1;g.question=null;
              g.beginQuestion();g.question.elapsed=g.question.duration*.4;
              const previous=r.ctx,canvas=document.createElement('canvas');canvas.width=C.width;canvas.height=C.height;
              r.ctx=canvas.getContext('2d');
              const fill=r.ctx.fillText,rounded=r.rounded,draws=[],frames=[];
              r.ctx.fillText=function(...args){draws.push({args,color:this.fillStyle,font:this.font});return fill.apply(this,args);};
              r.rounded=function(...args){frames.push(args);return rounded.apply(this,args);};
              const pictures=[];
              try {
                for(const special of [false,true])for(let lane=count===3?0:1;lane<=2;lane++) {
                  g.question.special=special;g.player.lane=lane;
                  const before=JSON.stringify(g);r.ctx.clearRect(0,0,C.width,C.height);r.tracks(g);
                  if(JSON.stringify(g)!==before)throw Error('visuals mutate rules');
                  pictures.push(canvas.toDataURL());
                }
                if(!pictures.every(image=>image===pictures[0]))throw Error('answer appearance leaks selection or special state');
                if(draws.some(d=>d.color!=='#182b50' || d.args[3]!==84))throw Error('answer text style');
                const cards=frames.filter(f=>f[5]==='#fff5d9');
                const expectedX=C.playerX+.6*900;
                if(cards.length!==pictures.length*count || cards.some(f=>Math.abs(f[0]+f[2]/2-expectedX)>1e-6 || f[6]!=='#6253a6'))throw Error('card style or position');
                for(let i=0;i<count;i++)if(cards[i][1]+44!==C.lanes[(count===3?0:1)+i]-36)throw Error('lane position');
                g.question.elapsed=g.question.duration*.5;frames.length=0;r.tracks(g);
                const moved=frames.find(f=>f[5]==='#fff5d9');
                if(Math.abs((moved[0]+moved[2]/2)-(C.playerX+.5*900))>1e-6)throw Error('scroll formula changed');
                return {cards:count,labelCount:draws.length};
              }finally{r.ctx=previous;r.rounded=rounded;}
            }''',count)
            page.add_style_tag(content='#pause-screen {display:none !important}')
            page.wait_for_timeout(100)
            banner=page.evaluate('''() => {const b=getComputedStyle(document.getElementById('question-banner'));const e=getComputedStyle(document.getElementById('equation'));
              return {background:b.backgroundColor,border:b.borderTopColor,color:e.color,radius:b.borderRadius};}''')
            assert banner['background']=='rgb(255, 245, 217)' and banner['border']=='rgb(98, 83, 166)',banner
            assert banner['color']=='rgb(24, 43, 80)',banner
            page.screenshot(path=f'/tmp/question-{count}-'+('mobile' if mobile else 'desktop')+'.png',full_page=True)
            page.evaluate("document.getElementById('question-banner').classList.add('special')")
            special=page.evaluate('''() => {const b=getComputedStyle(document.getElementById('question-banner'));const e=getComputedStyle(document.getElementById('equation'));
              return {background:b.backgroundColor,border:b.borderTopColor,color:e.color,radius:b.borderRadius};}''')
            assert special==banner,(special,banner)
            page.screenshot(path=f'/tmp/question-special-{count}-'+('mobile' if mobile else 'desktop')+'.png',full_page=True)
            assert page.locator('#equation').bounding_box()['width']<=page.locator('#question-banner').bounding_box()['width']
            page.evaluate("document.getElementById('question-banner').classList.remove('special')")
            print('PASS: equal cream/purple answers, unchanged motion/lanes/rules, same normal/special problem frame;',count,'choices;', 'mobile' if mobile else 'PC',flush=True)
        assert not errors,errors
        context.close()
    browser.close()
