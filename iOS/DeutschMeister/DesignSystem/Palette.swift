import SwiftUI

extension Color {
    init(hex: UInt32) {
        self.init(.sRGB,
                  red: Double((hex >> 16) & 0xFF) / 255,
                  green: Double((hex >> 8) & 0xFF) / 255,
                  blue: Double(hex & 0xFF) / 255)
    }

    /// A colour that switches with light/dark appearance.
    init(light: Color, dark: Color) {
        self.init(uiColor: UIColor { $0.userInterfaceStyle == .dark ? UIColor(dark) : UIColor(light) })
    }
}

/// The app's colours, taken from the prototype's stylesheet, with dark-mode variants.
enum Palette {
    static let primary = Color(hex: 0x6D5CE8)
    static let primaryStrong = Color(light: Color(hex: 0x5645D1), dark: Color(hex: 0xB4A9FF))
    static let primarySoft = Color(light: Color(hex: 0xEFEAFF), dark: Color(hex: 0x6D5CE8).opacity(0.25))
    static let teal = Color(hex: 0x00B8A3)
    static let tealSoft = Color(light: Color(hex: 0xE2FBF7), dark: Color(hex: 0x00B8A3).opacity(0.18))
    static let tealText = Color(light: Color(hex: 0x0A7D6D), dark: Color(hex: 0x5EE6D3))
    static let orange = Color(hex: 0xFF9F1C)
    static let orangeSoft = Color(light: Color(hex: 0xFFF3E0), dark: Color(hex: 0xFF9F1C).opacity(0.20))
    static let orangeText = Color(light: Color(hex: 0xB96B00), dark: Color(hex: 0xFFC46B))
    static let green = Color(hex: 0x22C55E)
    static let greenSoft = Color(light: Color(hex: 0xE8FBEE), dark: Color(hex: 0x22C55E).opacity(0.20))
    static let greenText = Color(light: Color(hex: 0x17924A), dark: Color(hex: 0x6BE39A))
    static let red = Color(hex: 0xEF4444)
    static let redSoft = Color(light: Color(hex: 0xFDEAEA), dark: Color(hex: 0xEF4444).opacity(0.20))
    static let blue = Color(hex: 0x3B82F6)
    static let blueSoft = Color(light: Color(hex: 0xE8F1FF), dark: Color(hex: 0x3B82F6).opacity(0.20))
    static let pink = Color(hex: 0xEC4899)
    static let pinkSoft = Color(light: Color(hex: 0xFDE7F3), dark: Color(hex: 0xEC4899).opacity(0.20))

    static let surface = Color(light: .white, dark: Color(hex: 0x1C1C1E))
    static let surfaceAlt = Color(light: Color(hex: 0xF7F5FF), dark: Color(hex: 0x2C2C2E))
    static let border = Color(light: Color(hex: 0xE7E3F7), dark: Color(hex: 0x3A3A3C))
}

/// Per-theme accent colours (the prototype's `THEME_COLORS`).
struct ThemePalette {
    let main: Color
    let soft: Color
    let text: Color

    private init(_ main: UInt32, _ light: UInt32, _ dark: UInt32) {
        self.main = Color(hex: main)
        soft = Color(light: Color(hex: light), dark: Color(hex: main).opacity(0.30))
        text = Color(light: Color(hex: dark), dark: Color(hex: light))
    }

    private static let fallback = ThemePalette(0x6D5CE8, 0xEFEAFF, 0x5645D1)

    private static let table: [String: ThemePalette] = [
        "food": .init(0xFF9F1C, 0xFFF3E0, 0xB96B00), "home": .init(0x3B82F6, 0xE8F1FF, 0x1D4ED8),
        "daily_routine": .init(0x6D5CE8, 0xEFEAFF, 0x5645D1), "travel": .init(0x00B8A3, 0xE2FBF7, 0x0A7D6D),
        "people": .init(0xEC4899, 0xFDE7F3, 0xBE185D), "work": .init(0x334155, 0xE2E8F0, 0x1E293B),
        "emotions": .init(0xF5C518, 0xFFF9DB, 0x8A6D00), "nature": .init(0x22C55E, 0xE8FBEE, 0x17924A),
        "body_health": .init(0xEF4444, 0xFDEAEA, 0xB91C1C), "shopping": .init(0xEC4899, 0xFDE7F3, 0xBE185D),
        "communication": .init(0x3B82F6, 0xE8F1FF, 0x1D4ED8), "technology": .init(0x334155, 0xE2E8F0, 0x1E293B),
        "education": .init(0x6D5CE8, 0xEFEAFF, 0x5645D1), "time_numbers": .init(0x00B8A3, 0xE2FBF7, 0x0A7D6D),
        "grammar_glue": .init(0x94A3B8, 0xF1F5F9, 0x475569), "society": .init(0x0EA5E9, 0xE0F2FE, 0x075985),
        "abstract_ideas": .init(0x8B5CF6, 0xF3E8FF, 0x6D28D9), "argumentation": .init(0xF59E0B, 0xFEF3C7, 0x92400E),
    ]

    static func forTheme(_ id: String?) -> ThemePalette { id.flatMap { table[$0] } ?? fallback }
}

extension Gender {
    var tint: (fill: Color, text: Color) {
        switch self {
        case .der: (Palette.blueSoft, Palette.blue)
        case .die: (Palette.pinkSoft, Palette.pink)
        case .das: (Palette.greenSoft, Palette.greenText)
        }
    }
}
