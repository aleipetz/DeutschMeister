#!/usr/bin/env swift
// Renders the 1024x1024 app icon: purple gradient with the owl emoji.
// Usage (compile, don't interpret): swiftc -O Tools/make_icon.swift -o /tmp/make_icon && /tmp/make_icon
import AppKit
import ImageIO
import UniformTypeIdentifiers

let size = 1024
let outPath = CommandLine.arguments.dropFirst().first
    ?? "iOS/DeutschMeister/Resources/Assets.xcassets/AppIcon.appiconset/icon-1024.png"
let outURL = URL(fileURLWithPath: outPath)

let space = CGColorSpace(name: CGColorSpace.sRGB)!
guard let ctx = CGContext(
    data: nil, width: size, height: size, bitsPerComponent: 8, bytesPerRow: 0, space: space,
    bitmapInfo: CGImageAlphaInfo.noneSkipLast.rawValue)
else { fatalError("Couldn't create bitmap context") }

func color(_ r: CGFloat, _ g: CGFloat, _ b: CGFloat, _ a: CGFloat = 1) -> CGColor {
    CGColor(colorSpace: space, components: [r, g, b, a])!
}

// Full-bleed square: iOS applies the rounded-corner mask itself.
let background = CGGradient(
    colorsSpace: space,
    colors: [color(0.545, 0.478, 0.965), color(0.337, 0.271, 0.820)] as CFArray,  // #8B7AF6 -> #5645D1
    locations: [0, 1])!
ctx.drawLinearGradient(background, start: CGPoint(x: 0, y: CGFloat(size)), end: CGPoint(x: CGFloat(size), y: 0), options: [])

// Soft light behind the owl.
let glow = CGGradient(
    colorsSpace: space, colors: [color(1, 1, 1, 0.30), color(1, 1, 1, 0)] as CFArray, locations: [0, 1])!
ctx.drawRadialGradient(
    glow, startCenter: CGPoint(x: 512, y: 540), startRadius: 0,
    endCenter: CGPoint(x: 512, y: 540), endRadius: 470, options: [])

// The owl.
NSGraphicsContext.saveGraphicsState()
NSGraphicsContext.current = NSGraphicsContext(cgContext: ctx, flipped: false)
let owl = "🦉" as NSString
let font = NSFont(name: "AppleColorEmoji", size: 620) ?? NSFont.systemFont(ofSize: 620)
let shadow = NSShadow()
shadow.shadowColor = NSColor.black.withAlphaComponent(0.25)
shadow.shadowBlurRadius = 30
shadow.shadowOffset = NSSize(width: 0, height: -14)
let attributes: [NSAttributedString.Key: Any] = [.font: font, .shadow: shadow]
let textSize = owl.size(withAttributes: attributes)
owl.draw(
    at: NSPoint(x: (CGFloat(size) - textSize.width) / 2, y: (CGFloat(size) - textSize.height) / 2 + 10),
    withAttributes: attributes)
NSGraphicsContext.restoreGraphicsState()

try FileManager.default.createDirectory(at: outURL.deletingLastPathComponent(), withIntermediateDirectories: true)
guard let image = ctx.makeImage(),
      let destination = CGImageDestinationCreateWithURL(outURL as CFURL, UTType.png.identifier as CFString, 1, nil)
else { fatalError("Couldn't create PNG destination") }
CGImageDestinationAddImage(destination, image, nil)
guard CGImageDestinationFinalize(destination) else { fatalError("Couldn't write PNG") }
print("Wrote \(outURL.path)")
