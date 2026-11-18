// A small camera helper for tools/mapping (macOS webcams and an iPhone as a
// Continuity Camera). It keeps the camera open for the whole capture, so the
// exposure doesn't start from scratch for every photo, and can lock exposure,
// focus and white balance once they've settled on the lit house.
//
// Build: tools/mapping/setup.sh (swiftc -O -o .bin/snap camera/snap.swift)
//
//   snap --list                        cameras, one JSON object per line
//   snap --device <index|name|id>      open one, then read commands on stdin:
//     lock            lock exposure, focus and white balance where supported
//     auto            back to continuous auto exposure, focus and white balance
//     snap <path> <settleMs>
//                     wait settleMs, then save the next frame as a JPEG
//     quit
//   Every command answers with one JSON line on stdout.

import AVFoundation
import CoreImage
import Foundation
import ImageIO
import UniformTypeIdentifiers

func emit(_ obj: [String: Any]) {
  let data = try! JSONSerialization.data(withJSONObject: obj, options: [.sortedKeys])
  FileHandle.standardOutput.write(data)
  FileHandle.standardOutput.write("\n".data(using: .utf8)!)
}

func fail(_ message: String) -> Never {
  emit(["ok": false, "error": message])
  exit(1)
}

func cameras() -> [AVCaptureDevice] {
  var types: [AVCaptureDevice.DeviceType] = [.builtInWideAngleCamera, .external]
  if #available(macOS 14.0, *) { types.append(.continuityCamera) }
  return AVCaptureDevice.DiscoverySession(
    deviceTypes: types, mediaType: .video, position: .unspecified
  ).devices
}

final class Grabber: NSObject, AVCaptureVideoDataOutputSampleBufferDelegate {
  private let lock = NSLock()
  private var latest: (CVPixelBuffer, Double)?
  private(set) var frames = 0

  func captureOutput(
    _ output: AVCaptureOutput, didOutput sampleBuffer: CMSampleBuffer,
    from connection: AVCaptureConnection
  ) {
    guard let buffer = CMSampleBufferGetImageBuffer(sampleBuffer) else { return }
    lock.lock()
    latest = (buffer, Date().timeIntervalSince1970)
    frames += 1
    lock.unlock()
  }

  /** The first frame that arrives after `after` (seconds since 1970). */
  func frame(after: Double, timeout: Double = 5) -> CVPixelBuffer? {
    let deadline = Date().addingTimeInterval(timeout)
    while Date() < deadline {
      lock.lock()
      let current = latest
      lock.unlock()
      if let (buffer, at) = current, at > after { return buffer }
      Thread.sleep(forTimeInterval: 0.005)
    }
    return nil
  }
}

func save(_ buffer: CVPixelBuffer, to path: String) -> (Int, Int)? {
  let image = CIImage(cvPixelBuffer: buffer)
  let context = CIContext()
  guard let cg = context.createCGImage(image, from: image.extent) else { return nil }
  let url = URL(fileURLWithPath: path)
  guard
    let dest = CGImageDestinationCreateWithURL(
      url as CFURL, UTType.jpeg.identifier as CFString, 1, nil)
  else { return nil }
  CGImageDestinationAddImage(
    dest, cg, [kCGImageDestinationLossyCompressionQuality: 0.95] as CFDictionary)
  guard CGImageDestinationFinalize(dest) else { return nil }
  return (cg.width, cg.height)
}

func setModes(_ device: AVCaptureDevice, locked: Bool) -> [String: Any] {
  var result: [String: Any] = [:]
  do {
    try device.lockForConfiguration()
  } catch {
    return ["error": "Can't configure the camera: \(error.localizedDescription)"]
  }
  defer { device.unlockForConfiguration() }
  let exposure: AVCaptureDevice.ExposureMode = locked ? .locked : .continuousAutoExposure
  if device.isExposureModeSupported(exposure) {
    device.exposureMode = exposure
    result["exposure"] = locked ? "locked" : "auto"
  } else {
    result["exposure"] = "unsupported"
  }
  let focus: AVCaptureDevice.FocusMode = locked ? .locked : .continuousAutoFocus
  if device.isFocusModeSupported(focus) {
    device.focusMode = focus
    result["focus"] = locked ? "locked" : "auto"
  } else {
    result["focus"] = "unsupported"
  }
  let wb: AVCaptureDevice.WhiteBalanceMode = locked ? .locked : .continuousAutoWhiteBalance
  if device.isWhiteBalanceModeSupported(wb) {
    device.whiteBalanceMode = wb
    result["whiteBalance"] = locked ? "locked" : "auto"
  } else {
    result["whiteBalance"] = "unsupported"
  }
  return result
}

let args = CommandLine.arguments
if args.contains("--list") {
  for (i, d) in cameras().enumerated() {
    emit(["index": i, "name": d.localizedName, "id": d.uniqueID, "type": d.deviceType.rawValue])
  }
  exit(0)
}

// macOS asks the "responsible" app for camera permission: the terminal, or
// whatever app runs the agent, which may have no camera usage description and
// then gets killed by TCC. So the helper runs itself again, disclaimed, as its
// own responsible process: macOS asks once for "effect-sim mapping camera"
// (camera/Info.plist, linked into the binary) and remembers the answer.
func runDisclaimed() {
  typealias Disclaim = @convention(c) (UnsafeMutablePointer<posix_spawnattr_t?>, Int32) -> Int32
  guard getenv("MAPPING_SNAP_DISCLAIMED") == nil,
    let sym = dlsym(UnsafeMutableRawPointer(bitPattern: -2), "responsibility_spawnattrs_setdisclaim")
  else { return }
  var attr: posix_spawnattr_t?
  posix_spawnattr_init(&attr)
  _ = unsafeBitCast(sym, to: Disclaim.self)(&attr, 1)
  setenv("MAPPING_SNAP_DISCLAIMED", "1", 1)
  var size: UInt32 = 4096
  var path = [CChar](repeating: 0, count: Int(size))
  _NSGetExecutablePath(&path, &size)
  var pid: pid_t = 0
  guard posix_spawn(&pid, path, nil, &attr, CommandLine.unsafeArgv, environ) == 0 else { return }
  var status: Int32 = 0
  waitpid(pid, &status, 0)
  exit((status & 0x7f) == 0 ? (status >> 8) & 0xff : 128 + (status & 0x7f))
}
runDisclaimed()

guard let deviceArg = args.firstIndex(of: "--device").map({ args[$0 + 1] }) else {
  fail("usage: snap --list | snap --device <index|name|id>")
}
let all = cameras()
let device: AVCaptureDevice? =
  Int(deviceArg).flatMap { $0 < all.count ? all[$0] : nil }
  ?? all.first { $0.uniqueID == deviceArg }
  ?? all.first { $0.localizedName.localizedCaseInsensitiveContains(deviceArg) }
guard let device else {
  fail("No camera matches \(deviceArg). Cameras: \(all.map(\.localizedName).joined(separator: ", "))")
}

switch AVCaptureDevice.authorizationStatus(for: .video) {
case .authorized: break
case .notDetermined:
  let sem = DispatchSemaphore(value: 0)
  AVCaptureDevice.requestAccess(for: .video) { _ in sem.signal() }
  if sem.wait(timeout: .now() + 120) == .timedOut {
    fail("Nobody answered macOS's camera permission prompt for \"effect-sim mapping camera\" within 2 minutes.")
  }
  if AVCaptureDevice.authorizationStatus(for: .video) != .authorized {
    fail("Camera access was refused. Allow it for this terminal in System Settings > Privacy & Security > Camera.")
  }
default:
  fail("Camera access is off for this terminal: System Settings > Privacy & Security > Camera.")
}

let session = AVCaptureSession()
session.beginConfiguration()
guard let input = try? AVCaptureDeviceInput(device: device), session.canAddInput(input) else {
  fail("Can't open \(device.localizedName).")
}
session.addInput(input)
// The biggest format up to 4K: more pixels per LED.
let best = device.formats
  .filter {
    let d = CMVideoFormatDescriptionGetDimensions($0.formatDescription)
    return Int(d.width) * Int(d.height) <= 3840 * 2160
  }
  .max {
    let a = CMVideoFormatDescriptionGetDimensions($0.formatDescription)
    let b = CMVideoFormatDescriptionGetDimensions($1.formatDescription)
    return Int(a.width) * Int(a.height) < Int(b.width) * Int(b.height)
  }
if let best, (try? device.lockForConfiguration()) != nil {
  device.activeFormat = best
  device.unlockForConfiguration()
}
let output = AVCaptureVideoDataOutput()
output.videoSettings = [kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA]
output.alwaysDiscardsLateVideoFrames = true
let grabber = Grabber()
output.setSampleBufferDelegate(grabber, queue: DispatchQueue(label: "frames"))
guard session.canAddOutput(output) else { fail("Can't read frames from \(device.localizedName).") }
session.addOutput(output)
session.commitConfiguration()
session.startRunning()

guard grabber.frame(after: 0, timeout: 10) != nil else {
  fail("\(device.localizedName) sent no frames in 10 s.")
}
let dims = CMVideoFormatDescriptionGetDimensions(device.activeFormat.formatDescription)
emit([
  "ok": true, "ready": true, "name": device.localizedName, "id": device.uniqueID,
  "width": Int(dims.width), "height": Int(dims.height),
])

while let line = readLine() {
  let parts = line.split(separator: " ", maxSplits: 2).map(String.init)
  guard let cmd = parts.first else { continue }
  switch cmd {
  case "lock":
    emit(["ok": true] .merging(setModes(device, locked: true)) { a, _ in a })
  case "auto":
    emit(["ok": true] .merging(setModes(device, locked: false)) { a, _ in a })
  case "snap":
    guard parts.count >= 2 else {
      emit(["ok": false, "error": "snap <path> <settleMs>"])
      continue
    }
    let settle = parts.count >= 3 ? (Double(parts[2]) ?? 0) / 1000 : 0
    let after = Date().timeIntervalSince1970 + settle
    guard let buffer = grabber.frame(after: after) else {
      emit(["ok": false, "error": "No new frame from the camera."])
      continue
    }
    guard let (w, h) = save(buffer, to: parts[1]) else {
      emit(["ok": false, "error": "Couldn't write \(parts[1])."])
      continue
    }
    emit(["ok": true, "file": parts[1], "width": w, "height": h])
  case "quit":
    session.stopRunning()
    emit(["ok": true])
    exit(0)
  default:
    emit(["ok": false, "error": "Unknown command \(cmd)."])
  }
}
session.stopRunning()
