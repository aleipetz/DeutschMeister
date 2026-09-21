import AVFoundation

/// German text-to-speech on `AVSpeechSynthesizer`. Replaces the prototype's Web Speech API wrapper.
@MainActor @Observable
final class SpeechService: NSObject, AVSpeechSynthesizerDelegate {
    private let synthesizer = AVSpeechSynthesizer()
    private(set) var isSpeaking = false
    private(set) var germanVoice: AVSpeechSynthesisVoice?
    /// When true, `speak` does nothing. Used by tests so they never touch audio hardware.
    private let isMuted: Bool

    var hasGermanVoice: Bool { germanVoice != nil }

    init(muted: Bool = false) {
        isMuted = muted
        super.init()
        guard !muted else { return }
        synthesizer.delegate = self
        germanVoice = Self.bestGermanVoice()
        configureAudioSession()
    }

    /// The highest-quality installed `de-DE` voice (premium > enhanced > default).
    static func bestGermanVoice() -> AVSpeechSynthesisVoice? {
        AVSpeechSynthesisVoice.speechVoices()
            .filter { $0.language == "de-DE" }
            .max { $0.quality.rawValue < $1.quality.rawValue }
            ?? AVSpeechSynthesisVoice(language: "de-DE")
    }

    /// `rate` uses the prototype's scale (1.0 = normal, saved in settings). Maps it onto
    /// AVSpeechUtterance's 0...1 scale, where the default is 0.5.
    static func utteranceRate(forSetting rate: Double) -> Float {
        let mapped = AVSpeechUtteranceDefaultSpeechRate * Float(rate)
        return min(max(mapped, AVSpeechUtteranceMinimumSpeechRate), AVSpeechUtteranceMaximumSpeechRate)
    }

    /// Speaks German text, cutting off anything already playing so rapid taps don't overlap.
    func speak(_ text: String, rate: Double) {
        guard !text.isEmpty, !isMuted else { return }
        if synthesizer.isSpeaking { synthesizer.stopSpeaking(at: .immediate) }
        let utterance = AVSpeechUtterance(string: text)
        utterance.voice = germanVoice ?? AVSpeechSynthesisVoice(language: "de-DE")
        utterance.rate = Self.utteranceRate(forSetting: rate)
        isSpeaking = true
        synthesizer.speak(utterance)
    }

    func stop() {
        guard !isMuted else { return }
        synthesizer.stopSpeaking(at: .immediate)
        isSpeaking = false
    }

    // Plays even with the silent switch on, and briefly lowers other audio (music, podcasts).
    // The synthesizer activates the session itself when it starts speaking.
    private func configureAudioSession() {
        try? AVAudioSession.sharedInstance().setCategory(.playback, mode: .spokenAudio, options: [.duckOthers])
    }

    private func finished() {
        isSpeaking = false
        // Hand audio back to other apps. Off the main thread: deactivating can block.
        DispatchQueue.global(qos: .utility).async {
            try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
        }
    }

    nonisolated func speechSynthesizer(_ synthesizer: AVSpeechSynthesizer, didFinish utterance: AVSpeechUtterance) {
        Task { @MainActor [weak self] in self?.finished() }
    }

    nonisolated func speechSynthesizer(_ synthesizer: AVSpeechSynthesizer, didCancel utterance: AVSpeechUtterance) {
        Task { @MainActor [weak self] in self?.finished() }
    }
}
