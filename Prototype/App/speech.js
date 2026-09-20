/*
 * Thin wrapper around the browser's Web Speech API (speechSynthesis) for
 * German text-to-speech. Browser-only (no Node export) — this file is only
 * ever loaded inside dist/german-vocab.html.
 */
(function (root) {
  "use strict";

  var supported = typeof window !== "undefined" && "speechSynthesis" in window;
  var germanVoice = null;
  var voicesReady = false;
  var onReadyCallbacks = [];

  function pickGermanVoice() {
    if (!supported) return null;
    var voices = window.speechSynthesis.getVoices();
    if (!voices || voices.length === 0) return null;
    var exact = voices.find(function (v) { return v.lang === "de-DE"; });
    var prefix = voices.find(function (v) { return v.lang && v.lang.toLowerCase().indexOf("de") === 0; });
    return exact || prefix || null;
  }

  function markReady() {
    germanVoice = pickGermanVoice();
    voicesReady = true;
    onReadyCallbacks.forEach(function (cb) { cb(germanVoice); });
    onReadyCallbacks = [];
  }

  if (supported) {
    var initial = pickGermanVoice();
    if (initial) {
      germanVoice = initial;
      voicesReady = true;
    } else {
      // Most browsers load the voice list asynchronously.
      window.speechSynthesis.addEventListener("voiceschanged", markReady, { once: true });
      // Fallback in case the event never fires (some older WebKit builds).
      setTimeout(function () {
        if (!voicesReady) markReady();
      }, 1000);
    }
  }

  /** True once we've checked for a German voice (may still be null if none found). */
  function isReady() {
    return voicesReady;
  }

  /** True if a German voice was actually found on this system/browser. */
  function hasGermanVoice() {
    return !!germanVoice;
  }

  /**
   * Speaks German text aloud. Cancels any in-flight utterance first so rapid
   * clicks don't overlap/garble audio.
   * @param {string} text
   * @param {{rate?: number, onEnd?: function, onError?: function}} [opts]
   */
  function speak(text, opts) {
    opts = opts || {};
    if (!supported) {
      if (opts.onError) opts.onError(new Error("speechSynthesis not supported in this browser"));
      return;
    }
    window.speechSynthesis.cancel();
    var utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "de-DE";
    utterance.rate = opts.rate || 0.95;
    if (germanVoice) utterance.voice = germanVoice;
    if (opts.onEnd) utterance.onend = opts.onEnd;
    if (opts.onError) utterance.onerror = opts.onError;
    window.speechSynthesis.speak(utterance);
  }

  function cancel() {
    if (supported) window.speechSynthesis.cancel();
  }

  root.Speech = {
    isSupported: function () { return supported; },
    isReady: isReady,
    hasGermanVoice: hasGermanVoice,
    speak: speak,
    cancel: cancel,
  };
})(typeof window !== "undefined" ? window : globalThis);
