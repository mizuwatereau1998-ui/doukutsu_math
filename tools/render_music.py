"""Original score export. Requires Python Playwright, Chromium and ffmpeg; no game dependencies.
Run from repository root: python3 tools/render_music.py
"""
import base64
import subprocess
import tempfile
from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
with sync_playwright() as p, tempfile.TemporaryDirectory() as tmp:
    browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
    page=browser.new_page()
    page.add_script_tag(path=str(ROOT/'tools/cave-score.js'))
    for name,tension in [('cave-adventure',False),('cave-tension',True)]:
        encoded=page.evaluate('''async tension => {
          const buffer=await CaveScore.stem(tension),bytes=CaveScore.wav(buffer);
          let binary='';for(let i=0;i<bytes.length;i+=32768)binary+=String.fromCharCode(...bytes.subarray(i,i+32768));
          return btoa(binary);
        }''',tension)
        wav=Path(tmp)/(name+'.wav');wav.write_bytes(base64.b64decode(encoded))
        subprocess.run(['ffmpeg','-hide_banner','-loglevel','error','-y','-i',str(wav),'-ar','44100','-codec:a','libmp3lame','-b:a','128k',str(ROOT/'assets/audio'/(name+'.mp3'))],check=True)
        print('Rendered',name,flush=True)
    browser.close()
