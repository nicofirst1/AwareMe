import Vision
import AppKit

let path = CommandLine.arguments[1]
let W = CommandLine.arguments.count > 2 ? Double(CommandLine.arguments[2])! : 402.0
let H = CommandLine.arguments.count > 3 ? Double(CommandLine.arguments[3])! : 874.0
guard let image = NSImage(contentsOfFile: path),
      let cg = image.cgImage(forProposedRect: nil, context: nil, hints: nil) else {
  print("cannot load image"); exit(1)
}
let request = VNRecognizeTextRequest()
request.recognitionLevel = .accurate
request.usesLanguageCorrection = false
let handler = VNImageRequestHandler(cgImage: cg, options: [:])
try? handler.perform([request])
let results = (request.results ?? []) as [VNRecognizedTextObservation]
for obs in results {
  let box = obs.boundingBox // normalized, origin bottom-left
  let text = obs.topCandidates(1).first?.string ?? "?"
  let x = box.minX * W, y = (1 - box.maxY) * H
  let w = box.width * W, h = box.height * H
  print(String(format: "[%6.1f,%6.1f %5.1fx%5.1f] %@", x, y, w, h, text))
}
