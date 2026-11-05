/* Web Audio mixer. Music is pre-rendered; effects are original, short synthesizer voices. */
(() => {
  'use strict';
  const P=globalThis.PopEscape,C=P.CONFIG.audio;
  const clamp=v=>Math.max(0,Math.min(1,Number(v)));
  class AudioManager {
    constructor({muted=false,onStorageError=()=>{}}={}) {
      this.onStorageError=onStorageError;
      this.settings={muted,bgmEnabled:true,sfxEnabled:true,bgmVolume:C.bgmVolume,sfxVolume:C.sfxVolume};
      try {
        const saved=JSON.parse(localStorage.getItem(C.storageKey)||'{}');
        for(const k of ['muted','bgmEnabled','sfxEnabled'])if(typeof saved[k]==='boolean')this.settings[k]=saved[k];
        for(const k of ['bgmVolume','sfxVolume'])if(typeof saved[k]==='number'&&Number.isFinite(saved[k]))this.settings[k]=clamp(saved[k]);
      }catch{onStorageError();}
      this.mode='title';this.visible=!document.hidden;this.sources=[];this.voices=new Set();
      this.cooldowns=new Map();this.effects={};this.counts={};this.musicStarts=0;
      this.buffers={};this.status={music:'loading',failed:[]};this.generation=0;
      this.pending={};
      // Fetch early, but create/resume the audio context only in a player gesture.
      for(const [key,url] of [['base',C.musicUrl],['tension',C.tensionUrl],...Object.entries(C.effectUrls)]) {
        if(url)this.pending[key]=fetch(url).then(r=>{if(!r.ok)throw Error('audio HTTP '+r.status);return r.arrayBuffer();}).catch(()=>{this.status.failed.push(key);return null;});
      }
      document.addEventListener('visibilitychange',()=>this.setVisible(!document.hidden));
      window.addEventListener('pagehide',()=>this.setVisible(false));
      window.addEventListener('pageshow',()=>this.setVisible(!document.hidden));
    }
    unlock() {
      try {
        const Context=window.AudioContext||window.webkitAudioContext;
        if(!Context)return Promise.resolve(false);
        if(!this.context) {
          const ctx=this.context=new Context();
          this.master=ctx.createGain();this.bgm=ctx.createGain();this.fx=ctx.createGain();
          this.baseGain=ctx.createGain();this.tensionGain=ctx.createGain();
          this.baseGain.connect(this.bgm);this.tensionGain.connect(this.bgm);
          this.bgm.connect(this.master);this.fx.connect(this.master);
          const limiter=this.limiter=ctx.createDynamicsCompressor();
          limiter.threshold.value=-10;limiter.knee.value=12;limiter.ratio.value=12;
          limiter.attack.value=.003;limiter.release.value=.18;
          this.master.connect(limiter);limiter.connect(ctx.destination);
          this.tensionGain.gain.value=0;
          const noise=this.noise=ctx.createBuffer(1,ctx.sampleRate,ctx.sampleRate),data=noise.getChannelData(0);
          let seed=60217;for(let i=0;i<data.length;i++)data[i]=((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296)*2-1;
          this.applySettings(true);
          this.ready=Promise.all(Object.entries(this.pending).map(async([key,request])=>{
            try {
              const bytes=await request;if(!bytes)return;
              const buffer=await new Promise((resolve,reject)=>{
                const decoding=ctx.decodeAudioData(bytes.slice(0),resolve,reject);
                if(decoding?.catch)decoding.catch(reject);
              });
              if(key==='base'||key==='tension')this.buffers[key]=buffer;else this.effects[key]=buffer;
            }catch{this.status.failed.push(key);}
          })).then(()=>{this.status.music=this.buffers.base?'ready':'unavailable';this.ensureMusic();});
        }
        clearTimeout(this.suspendTimer);
        // Both calls occur synchronously in the gesture, including on iOS Safari.
        const resumed=this.context.resume();
        const silent=this.context.createBufferSource();
        silent.buffer=this.context.createBuffer(1,1,this.context.sampleRate);
        silent.connect(this.context.destination);silent.start();
        this.ensureMusic();
        return Promise.resolve(resumed).then(()=>true).catch(()=>false);
      }catch{return Promise.resolve(false);}
    }
    ramp(parameter,value,seconds=.04) {
      const t=this.context.currentTime;
      if(parameter.cancelAndHoldAtTime)parameter.cancelAndHoldAtTime(t);
      else {const current=parameter.value;parameter.cancelScheduledValues(t);parameter.setValueAtTime(current,t);}
      parameter.linearRampToValueAtTime(value,t+seconds);
    }
    applySettings(immediate=false) {
      if(!this.context)return;
      const s=this.settings,t=this.context.currentTime;
      const values=[[this.master.gain,s.muted?0:C.masterVolume],
        [this.bgm.gain,s.bgmEnabled?s.bgmVolume*(this.question?C.questionVolume:1):0],
        [this.fx.gain,s.sfxEnabled?s.sfxVolume:0]];
      for(const [p,v] of values)if(immediate){p.cancelScheduledValues(t);p.setValueAtTime(v,t);}else this.ramp(p,v);
      if(s.muted||!s.sfxEnabled)this.stopEffects();
    }
    setSettings(patch) {
      for(const k of ['muted','bgmEnabled','sfxEnabled'])if(typeof patch[k]==='boolean')this.settings[k]=patch[k];
      for(const k of ['bgmVolume','sfxVolume'])if(Number.isFinite(patch[k]))this.settings[k]=clamp(patch[k]);
      this.applySettings();
      try{localStorage.setItem(C.storageKey,JSON.stringify(this.settings));}catch{this.onStorageError();}
    }
    ensureMusic() {
      if(!this.context||!this.buffers.base||this.sources.length||this.mode!=='running'||!this.visible)return;
      const at=this.context.currentTime+.025;
      this.ramp(this.baseGain.gain,1,.1);
      this.tensionGain.gain.setValueAtTime(this.upgraded?1:0,this.context.currentTime);
      for(const key of ['base','tension']) {
        const buffer=this.buffers[key];if(!buffer)continue;
        const source=this.context.createBufferSource();source.buffer=buffer;source.loop=true;
        source.loopStart=C.loopStart;source.loopEnd=Math.min(C.loopEnd,buffer.duration);
        source.connect(key==='base'?this.baseGain:this.tensionGain);
        source.start(at,C.loopStart);this.sources.push(source);
      }
      this.musicStarts++;
      this.musicStartedAt=at;
    }
    stopMusic(fade=.08) {
      if(!this.context)return;
      if(this.context.state!=='running')fade=0;
      const ending=this.sources.splice(0),at=this.context.currentTime+fade;
      this.ramp(this.baseGain.gain,0,fade);this.ramp(this.tensionGain.gain,0,fade);
      for(const source of ending){try{source.stop(at);}catch{}source.onended=()=>source.disconnect();}
    }
    stopEffects() {
      if(!this.context)return;
      for(const voice of this.voices){try{
        if(voice.effectGain)this.ramp(voice.effectGain.gain,0,.012);
        voice.stop(this.context.currentTime+.015);
      }catch{}}
      this.voices.clear();
    }
    pause() {
      if(!this.context)return;
      this.stopEffects();clearTimeout(this.suspendTimer);
      this.ramp(this.master.gain,0,.025);
      this.suspendTimer=setTimeout(()=>{
        if(this.mode!=='running'||!this.visible)this.context.suspend().catch(()=>{});
      },35);
    }
    setVisible(visible) {
      this.visible=visible;
      if(!visible)this.pause();
      // Returning to the page never resumes a paused run without player input.
    }
    handleEvent(event,game) {
      if(event.type==='start') {
        this.stopMusic(0);this.stopEffects();this.cooldowns.clear();
        this.player=game.player;this.upgraded=game.player.topLane===0;this.question=false;
        this.mode='running';this.generation++;this.applySettings();this.ensureMusic();this.play('start');
      } else if(event.type==='pause'||event.type==='home') {
        this.mode=event.type==='home'?'title':'paused';
        if(event.type==='home')this.stopMusic(.025);
        this.pause();
      } else if(event.type==='resume') {
        this.mode='running';this.unlock();this.applySettings();this.ensureMusic();
      } else if(event.type==='move')this.play(event.direction<0?'jump':'down');
      else if(event.type==='question')this.play('question');
      else if(event.type==='correct')this.play(event.special?'recover':'correct');
      else if(event.type==='miss')this.play('miss');
      else if(event.type==='over') {
        this.mode='over';this.stopMusic(.65);this.stopEffects();this.play('over');
      }
    }
    update(game) {
      if(this.mode!=='running')return;
      if(!this.upgraded && game.player.topLane===0) {
        this.upgraded=true;
        if(this.context)this.ramp(this.tensionGain.gain,1,C.tensionFadeSeconds);
        this.play('grow');
      }
      if(this.question!==!!game.question){this.question=!!game.question;this.applySettings();}
    }
    voice(source,gain,when,duration) {
      if(this.voices.size>=32)return;
      source.effectGain=gain;
      source.connect(gain);gain.connect(this.fx);this.voices.add(source);
      source.onended=()=>{this.voices.delete(source);source.disconnect();gain.disconnect();};
      source.start(when);source.stop(when+duration+.025);
    }
    note(frequency,at,duration,volume,type='sine',end=frequency) {
      const ctx=this.context,o=ctx.createOscillator(),g=ctx.createGain();
      o.type=type;o.frequency.setValueAtTime(frequency,at);
      o.frequency.exponentialRampToValueAtTime(end,at+duration);
      g.gain.setValueAtTime(0,at);g.gain.linearRampToValueAtTime(volume,at+.008);
      g.gain.exponentialRampToValueAtTime(.0001,at+duration);
      this.voice(o,g,at,duration);
    }
    noiseHit(at,duration,volume,cutoff,type='lowpass') {
      const ctx=this.context,source=ctx.createBufferSource(),filter=ctx.createBiquadFilter(),gain=ctx.createGain();
      source.buffer=this.noise;filter.type=type;filter.frequency.setValueAtTime(cutoff,at);
      filter.frequency.exponentialRampToValueAtTime(Math.max(120,cutoff*.25),at+duration);
      gain.gain.setValueAtTime(volume,at);gain.gain.exponentialRampToValueAtTime(.0001,at+duration);
      source.connect(filter);filter.connect(gain);
      if(this.voices.size>=32){source.disconnect();filter.disconnect();return;}
      gain.connect(this.fx);this.voices.add(source);
      source.effectGain=gain;
      source.onended=()=>{this.voices.delete(source);source.disconnect();filter.disconnect();gain.disconnect();};
      source.start(at);source.stop(at+duration+.02);
    }
    play(kind) {
      if(!this.context||!this.visible||this.settings.muted||!this.settings.sfxEnabled||this.settings.sfxVolume===0)return;
      const t=this.context.currentTime,key=['jump','down'].includes(kind)?'movement':kind;
      const cooldown=key==='movement'?.09:kind==='miss'?.18:.06;
      if(t-(this.cooldowns.get(key)??-Infinity)<cooldown)return;
      this.cooldowns.set(key,t);this.counts[kind]=(this.counts[kind]||0)+1;
      if(this.effects[kind]) {
        const source=this.context.createBufferSource(),gain=this.context.createGain();
        source.buffer=this.effects[kind];gain.gain.value=.7;this.voice(source,gain,t,source.buffer.duration);return;
      }
      const bell=(f,at,vol=.105,duration=.42)=>{
        this.note(f,at,duration,vol);this.note(f*2,at,duration*.6,vol*.18);
      };
      if(kind==='jump')this.note(230,t,.14,.055,'triangle',520);
      if(kind==='down')this.noiseHit(t,.13,.07,3300,'highpass');
      if(kind==='question'){bell(587.33,t,.07,.22);bell(880,t+.09,.07,.24);}
      if(kind==='start'){bell(587.33,t,.045,.22);bell(880,t+.09,.04,.24);}
      if(kind==='correct'||kind==='recover') {
        const notes=kind==='recover'?[1174.66,1479.98,1760,2349.32]:[1174.66,1479.98,1760];
        notes.forEach((f,i)=>bell(f,t+i*.09,.10,kind==='recover'?.5:.4));
      }
      if(kind==='miss') {
        this.note(185,t,.32,.18,'sine',68);this.note(310,t,.16,.055,'triangle',125);
        this.noiseHit(t,.08,.07,650);
      }
      if(kind==='grow') {
        this.note(75,t,1,.14,'sine',36);this.note(44,t,.9,.1,'triangle',61);
        this.noiseHit(t,.9,.17,420);
      }
      if(kind==='over')[440,349.23,293.66,220].forEach((f,i)=>this.note(f,t+.04+i*.28,.5,.13,'triangle'));
    }
  }
  P.AudioManager=AudioManager;
})();
