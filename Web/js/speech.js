// German text-to-speech on the Web Speech API. On iPhone this uses the same system voices
// AVSpeechSynthesizer did in the native app (Settings → Accessibility → Spoken Content → Voices).

const QUALITY_HINTS = [/premium/i, /enhanced/i, /erweitert/i, /neural/i, /natural/i];

function voiceScore(v) {
  let score = 0;
  QUALITY_HINTS.forEach((re, i) => { if (re.test(v.name)) score = Math.max(score, QUALITY_HINTS.length - i); });
  if (v.lang.replace('_', '-') === 'de-DE') score += 0.5;
  if (v.localService) score += 0.25;
  return score;
}

export class SpeechService {
  constructor(synth = globalThis.speechSynthesis, Utterance = globalThis.SpeechSynthesisUtterance) {
    this.synth = synth;
    this.Utterance = Utterance;
    this.voice = null;
    this.isSpeaking = false;
    this.listeners = new Set();
    if (!synth) return;
    this.pickVoice();
    synth.addEventListener?.('voiceschanged', () => this.pickVoice());
  }

  get isAvailable() { return Boolean(this.synth && this.Utterance); }
  get hasGermanVoice() { return Boolean(this.voice); }

  onChange(fn) { this.listeners.add(fn); }
  setSpeaking(value) {
    if (this.isSpeaking === value) return;
    this.isSpeaking = value;
    for (const fn of this.listeners) fn(value);
  }

  /// The highest-quality installed German voice.
  pickVoice() {
    const voices = (this.synth.getVoices?.() ?? []).filter((v) => /^de([-_]|$)/i.test(v.lang));
    voices.sort((a, b) => voiceScore(b) - voiceScore(a));
    this.voice = voices[0] ?? null;
  }

  /// Speaks German, cutting off anything already playing so rapid taps don't overlap.
  /// `rate` is the settings scale, where 1.0 is normal speed.
  speak(text, rate = 1) {
    if (!text || !this.isAvailable) return;
    if (!this.voice) this.pickVoice();
    // Cancelling an idle synthesizer right before speaking can swallow the utterance in Safari.
    if (this.synth.speaking || this.synth.pending) this.synth.cancel();
    const u = new this.Utterance(text);
    u.lang = this.voice?.lang ?? 'de-DE';
    if (this.voice) u.voice = this.voice;
    u.rate = Math.min(Math.max(rate, 0.1), 2);
    u.onstart = () => this.setSpeaking(true);
    u.onend = u.onerror = () => this.setSpeaking(false);
    this.synth.speak(u);
  }

  stop() {
    this.synth?.cancel();
    this.setSpeaking(false);
  }
}
