# Luminous Escape

Original music for ポップンの大脱走！. No third-party music or audio samples.

132 BPM, D minor, 4/4, 32 bars. The loop region is 0–58.1818181818 seconds.

- `cave-adventure.mp3`: bells, arpeggios, pads, bass and a light rhythm.
- `cave-tension.mp3`: synchronized additional bass and percussion, faded in at 900m.

Score and synthesis: `tools/cave-score.js`. Export: `python3 tools/render_music.py`.
The renderer wraps final reverberation/release into the loop opening before MP3 encoding.
The game uses decoded AudioBuffers and the explicit loop region, excluding MP3 container padding.
