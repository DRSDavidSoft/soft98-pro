const Soft98DownloadAudio = (() => {
  "use strict";

  const CHANNEL = "soft98:play-download-sound";
  const DEFAULT_VOLUME = 40;
  const priorities = Object.freeze({ queued: 1, started: 2, paused: 3, resumed: 3, canceled: 3, complete: 4, attention: 5 });
  const cues = Object.freeze(Object.keys(priorities));
  const valid = (cue, volume) => cues.includes(cue) && Number.isInteger(volume) && volume > 0 && volume <= 100;

  function createPlayer(getURL) {
    let audio;
    let pending;
    let timer;
    let automatic = false;
    let sequence = 0;
    let last;

    function schedule() {
      if (!pending || timer || (audio && !audio.paused && !audio.ended)) return;
      timer = setTimeout(() => {
        timer = null;
        const next = pending;
        pending = null;
        if (next) void play(next.cue, next.volume, false);
      }, 140);
    }

    async function play(cue, volume, preview) {
      const id = ++sequence;
      try {
        if (!audio) {
          audio = new Audio();
          audio.addEventListener("ended", schedule);
          audio.addEventListener("error", schedule);
        }
        audio.pause();
        automatic = !preview;
        audio.src = getURL(`assets/download-sounds/${cue}.wav`);
        audio.volume = volume / 100;
        if (automatic) last = { cue, at: Date.now() };
        await audio.play();
        return true;
      } catch {
        return false;
      } finally {
        if (id === sequence) schedule();
      }
    }

    function dispatch({ cue, volume, preview, mute }) {
      if (mute === true) {
        pending = null;
        clearTimeout(timer);
        timer = null;
        if (automatic) audio?.pause();
        last = null;
        return true;
      }
      if (!valid(cue, volume)) return false;
      if (preview === true) {
        clearTimeout(timer);
        timer = null;
        return play(cue, volume, true);
      }
      if (last?.cue === cue && Date.now() - last.at < 600) return true;
      if (!pending || priorities[cue] >= priorities[pending.cue]) pending = { cue, volume };
      schedule();
      return true;
    }

    return dispatch;
  }

  return { CHANNEL, DEFAULT_VOLUME, cues, valid, createPlayer };
})();

if (typeof module !== "undefined" && module.exports) module.exports = Soft98DownloadAudio;
