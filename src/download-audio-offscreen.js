"use strict";

const playDownloadSound = Soft98DownloadAudio.createPlayer((path) => chrome.runtime.getURL(path));
chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (message?.type !== Soft98DownloadAudio.CHANNEL || sender.id !== chrome.runtime.id ||
      sender.tab || (sender.url && sender.url !== chrome.runtime.getURL("assets/background.js"))) return false;
  Promise.resolve(playDownloadSound(message)).then((ok) => respond({ ok }), () => respond({ ok: false }));
  return true;
});
