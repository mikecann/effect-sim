// The app icon: a warm glowing bulb on a dark background, 1024 x 1024.
//   swift ios/scripts/make-icon.swift ios/Lights/Assets.xcassets/AppIcon.appiconset/AppIcon.png
import CoreGraphics
import Foundation
import ImageIO
import UniformTypeIdentifiers

let out = CommandLine.arguments.dropFirst().first ?? "AppIcon.png"
let size = 1024
let s = CGFloat(size)
let space = CGColorSpace(name: CGColorSpace.sRGB)!
let ctx = CGContext(
    data: nil, width: size, height: size, bitsPerComponent: 8, bytesPerRow: 0, space: space,
    bitmapInfo: CGImageAlphaInfo.noneSkipLast.rawValue)!

func color(_ r: CGFloat, _ g: CGFloat, _ b: CGFloat, _ a: CGFloat = 1) -> CGColor {
    CGColor(colorSpace: space, components: [r, g, b, a])!
}

// Flip so y goes down, like the design.
ctx.translateBy(x: 0, y: s)
ctx.scaleBy(x: 1, y: -1)

// Background: near-black, a touch lighter at the top.
let bg = CGGradient(colorsSpace: space, colors: [color(0.09, 0.07, 0.1), color(0.02, 0.02, 0.035)] as CFArray, locations: [0, 1])!
ctx.drawLinearGradient(bg, start: CGPoint(x: 0, y: 0), end: CGPoint(x: 0, y: s), options: [])

let bulbCenter = CGPoint(x: s / 2, y: s * 0.43)
let bulbRadius = s * 0.235

// The glow around the bulb.
let glow = CGGradient(
    colorsSpace: space,
    colors: [color(1, 0.62, 0.22, 0.75), color(1, 0.42, 0.12, 0.28), color(1, 0.35, 0.1, 0)] as CFArray,
    locations: [0, 0.45, 1])!
ctx.drawRadialGradient(glow, startCenter: bulbCenter, startRadius: 0, endCenter: bulbCenter, endRadius: s * 0.52, options: [])

// The glass: a circle that narrows into a neck.
let neckTop = bulbCenter.y + bulbRadius * 0.78
let neckWidth = bulbRadius * 0.92
let neckBottom = s * 0.735
let glass = CGMutablePath()
glass.addArc(center: bulbCenter, radius: bulbRadius, startAngle: .pi * 0.72, endAngle: .pi * 0.28, clockwise: false)
glass.addCurve(
    to: CGPoint(x: s / 2 + neckWidth / 2, y: neckBottom),
    control1: CGPoint(x: s / 2 + bulbRadius * 0.55, y: neckTop + bulbRadius * 0.12),
    control2: CGPoint(x: s / 2 + neckWidth / 2, y: neckBottom - bulbRadius * 0.3))
glass.addLine(to: CGPoint(x: s / 2 - neckWidth / 2, y: neckBottom))
glass.addCurve(
    to: CGPoint(x: bulbCenter.x + cos(.pi * 0.72) * bulbRadius, y: bulbCenter.y + sin(.pi * 0.72) * bulbRadius),
    control1: CGPoint(x: s / 2 - neckWidth / 2, y: neckBottom - bulbRadius * 0.3),
    control2: CGPoint(x: s / 2 - bulbRadius * 0.55, y: neckTop + bulbRadius * 0.12))
glass.closeSubpath()

ctx.saveGState()
ctx.addPath(glass)
ctx.clip()
let fill = CGGradient(
    colorsSpace: space,
    colors: [color(1, 0.97, 0.86), color(1, 0.8, 0.42), color(1, 0.52, 0.16)] as CFArray,
    locations: [0, 0.5, 1])!
let hot = CGPoint(x: bulbCenter.x - bulbRadius * 0.25, y: bulbCenter.y - bulbRadius * 0.3)
ctx.drawRadialGradient(fill, startCenter: hot, startRadius: 0, endCenter: bulbCenter, endRadius: bulbRadius * 1.6, options: [.drawsAfterEndLocation])
ctx.restoreGState()

// The screw base: three bands and a tip.
let baseWidth = neckWidth * 0.98
var y = neckBottom + s * 0.012
for i in 0..<3 {
    let band = CGRect(x: s / 2 - baseWidth / 2 + CGFloat(i) * 4, y: y, width: baseWidth - CGFloat(i) * 8, height: s * 0.038)
    ctx.addPath(CGPath(roundedRect: band, cornerWidth: s * 0.017, cornerHeight: s * 0.017, transform: nil))
    ctx.setFillColor(color(0.62 - CGFloat(i) * 0.05, 0.6 - CGFloat(i) * 0.05, 0.62 - CGFloat(i) * 0.05))
    ctx.fillPath()
    y += s * 0.047
}
let tip = CGRect(x: s / 2 - baseWidth * 0.22, y: y - s * 0.004, width: baseWidth * 0.44, height: s * 0.034)
ctx.addPath(CGPath(roundedRect: tip, cornerWidth: s * 0.015, cornerHeight: s * 0.015, transform: nil))
ctx.setFillColor(color(0.32, 0.3, 0.32))
ctx.fillPath()

let image = ctx.makeImage()!
let dest = CGImageDestinationCreateWithURL(URL(fileURLWithPath: out) as CFURL, UTType.png.identifier as CFString, 1, nil)!
CGImageDestinationAddImage(dest, image, nil)
CGImageDestinationFinalize(dest)
print(out)
