/* Original score: "Luminous Escape" — 132 BPM, D minor, 32 bars (58.1818 s).
 * No samples or third-party melodies. Rendered offline; never runs during play. */
(() => {
  'use strict';
  const BPM=132, beat=60/BPM, bars=32, duration=bars*4*beat, sampleRate=24000;
  const hz=n=>440*2**((n-69)/12);
  const chords=[[50,57,62,65],[46,53,58,62],[53,60,65,69],[48,55,60,64],
    [43,50,58,62],[50,57,62,65],[46,53,58,62],[45,52,61,64]];
  const melodies=[
    [[0,74,1],[1.5,77,.5],[2,81,1],[3.5,77,.5]],
    [[.5,76,.5],[1,74,1],[3,69,.75]],
    [[0,70,1],[1.5,74,.5],[2.5,77,1]],
    [[0,74,.75],[1,72,.75],[2.5,70,1]],
    [[0,77,1],[1.5,81,.5],[2,84,1],[3.5,81,.5]],
    [[.5,79,.5],[1,77,1],[3,72,.75]],
    [[0,76,1],[1.5,79,.5],[2.5,76,1]],
    [[0,74,.75],[1.5,72,.75],[3,69,.75]],
    [[0,79,.75],[1,77,.5],[2,74,1]],
    [[.5,70,.75],[2,74,1],[3.5,77,.5]],
    [[0,81,1],[1.5,77,.5],[2.5,74,1]],
    [[0,76,.75],[1,77,.75],[3,74,.75]],
    [[.5,77,.75],[2,74,.75],[3,70,.75]],
    [[0,74,1],[2,77,.75],[3.5,76,.5]],
    [[0,73,1],[1.5,76,.5],[2.5,81,.75]],
    [[0,79,.75],[1,76,.5],[2,73,.75],[3.25,69,.5]],
  ];
  async function stem(tension=false) {
    const tail=2, frames=Math.round(duration*sampleRate);
    const ctx=new OfflineAudioContext(2,frames+tail*sampleRate,sampleRate);
    const master=ctx.createGain();master.gain.value=.8;master.connect(ctx.destination);
    const room=ctx.createConvolver(), wet=ctx.createGain();wet.gain.value=.17;
    const impulse=ctx.createBuffer(2,sampleRate*1.6,sampleRate);
    let seed=71993;
    const random=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296)*2-1;
    for(let c=0;c<2;c++){
      const a=impulse.getChannelData(c);
      for(let i=0;i<a.length;i++)a[i]=random()*(1-i/a.length)**3*.28;
    }
    room.buffer=impulse;room.connect(wet);wet.connect(master);
    const noise=ctx.createBuffer(1,sampleRate,sampleRate);
    const nd=noise.getChannelData(0);for(let i=0;i<nd.length;i++)nd[i]=random();
    function note(n,t,len,volume,type='sine',pan=0,send=.15,bend=null) {
      const o=ctx.createOscillator(),g=ctx.createGain(),p=ctx.createStereoPanner();
      o.type=type;o.frequency.setValueAtTime(hz(n),t);
      if(bend!==null)o.frequency.exponentialRampToValueAtTime(hz(bend),t+len);
      g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(volume,t+.012);
      g.gain.exponentialRampToValueAtTime(.0001,t+len);
      p.pan.value=pan;o.connect(g);g.connect(p);p.connect(master);
      if(send){const s=ctx.createGain();s.gain.value=send;p.connect(s);s.connect(room);}
      o.start(t);o.stop(t+len+.01);
    }
    function bell(n,t,vol=.065,len=.9,pan=0) {
      note(n,t,len,vol,'sine',pan,.5);
      note(n+12,t,len*.55,vol*.2,'sine',-pan,.3);
    }
    function percussion(t,vol,len,cutoff=6000) {
      const s=ctx.createBufferSource(),f=ctx.createBiquadFilter(),g=ctx.createGain();
      s.buffer=noise;f.type='highpass';f.frequency.value=cutoff;
      g.gain.setValueAtTime(vol,t);g.gain.exponentialRampToValueAtTime(.0001,t+len);
      s.connect(f);f.connect(g);g.connect(master);s.start(t);s.stop(t+len);
    }
    for(let bar=0;bar<bars;bar++) {
      const at=bar*4*beat,ch=chords[Math.floor(bar/2)%8];
      if(!tension) {
        // Two-bar harmonic breath; gentle pads keep arithmetic passages uncluttered.
        if(bar%2===0)ch.slice(1).forEach((n,i)=>{
          const o=ctx.createOscillator(),g=ctx.createGain(),p=ctx.createStereoPanner();
          o.type='sine';o.frequency.value=hz(n+12);p.pan.value=(i-1)*.35;
          g.gain.setValueAtTime(0,at);g.gain.linearRampToValueAtTime(.022,at+.4);
          g.gain.setValueAtTime(.022,at+7*beat);g.gain.linearRampToValueAtTime(0,at+8*beat+.15);
          o.connect(g);g.connect(p);p.connect(master);o.start(at);o.stop(at+8*beat+.16);
        });
        const motif=melodies[bar%16];
        for(const [position,n,length] of motif) {
          // A' opens the register; B' answers in a softer lower voice.
          const shift=bar>=16 && bar<24 ? 12 : 0;
          bell(n+shift,at+position*beat,.061*(bar>=24?.9:1),Math.min(1.1,length*beat+.45),-.14);
        }
        for(let step=0;step<8;step++) {
          const n=ch[1+[0,1,2,1,0,2,1,2][step]%3]+12;
          bell(n,at+step*.5*beat,.018*(step%2?.7:1),.38,.28);
        }
        for(const b of [0,2]) {
          note(ch[0]-12,at+b*beat,beat*1.6,.075,'triangle',0,0);
          note(42,at+b*beat,.15,.105,'sine',0,0,24);
        }
        for(const b of [1,3])percussion(at+b*beat,.035,.10,1800);
        for(let step=0;step<8;step++)percussion(at+step*.5*beat,.012*(step%2?.7:1),.045);
      } else {
        for(let step=0;step<8;step++) {
          note(ch[0]-12+(step%4===3?12:0),at+step*.5*beat,.18,.048,'triangle',0,0);
          percussion(at+(step*.5+.25)*beat,.012,.035,4300);
        }
        for(const b of [0,1.5,2,3.5])note(40,at+b*beat,.17,.075,'sine',0,0,23);
        for(const b of [1,3])percussion(at+b*beat,.043,.13,1200);
        if(bar%4===3)for(const b of [3,3.5,3.75])percussion(at+b*beat,.024,.07,2000);
      }
    }
    const rendered=await ctx.startRendering();
    // Wrap the final reverb/release into the first two seconds for a seamless cycle.
    const output=new AudioBuffer({numberOfChannels:2,length:frames,sampleRate});
    let peak=0;
    for(let c=0;c<2;c++) {
      const data=output.getChannelData(c),source=rendered.getChannelData(c);
      data.set(source.subarray(0,frames));
      for(let i=frames;i<source.length;i++)data[i-frames]+=source[i];
      for(const v of data)peak=Math.max(peak,Math.abs(v));
    }
    const target=tension?.32:.62;
    for(let c=0;c<2;c++){
      const data=output.getChannelData(c);for(let i=0;i<data.length;i++)data[i]*=target/Math.max(peak,.001);
    }
    return output;
  }
  function wav(buffer) {
    const bytes=new ArrayBuffer(44+buffer.length*4),v=new DataView(bytes);
    const word=(at,s)=>{for(let i=0;i<s.length;i++)v.setUint8(at+i,s.charCodeAt(i));};
    word(0,'RIFF');v.setUint32(4,bytes.byteLength-8,true);word(8,'WAVE');word(12,'fmt ');
    v.setUint32(16,16,true);v.setUint16(20,1,true);v.setUint16(22,2,true);
    v.setUint32(24,buffer.sampleRate,true);v.setUint32(28,buffer.sampleRate*4,true);
    v.setUint16(32,4,true);v.setUint16(34,16,true);word(36,'data');v.setUint32(40,buffer.length*4,true);
    const channels=[buffer.getChannelData(0),buffer.getChannelData(1)];
    for(let i=0;i<buffer.length;i++)for(let c=0;c<2;c++)v.setInt16(44+(i*2+c)*2,Math.round(Math.max(-1,Math.min(1,channels[c][i]))*32767),true);
    return new Uint8Array(bytes);
  }
  globalThis.CaveScore={BPM,bars,duration,stem,wav};
})();
