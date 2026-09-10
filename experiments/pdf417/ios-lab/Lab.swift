import UIKit
import AVFoundation
import ZXingCpp

@main
class AppDelegate: UIResponder, UIApplicationDelegate {
    var window: UIWindow?
    func application(_ application: UIApplication, didFinishLaunchingWithOptions options: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        window = UIWindow(frame: UIScreen.main.bounds)
        window?.rootViewController = LabController()
        window?.makeKeyAndVisible()
        return true
    }
}

final class LabController: UIViewController, AVCaptureVideoDataOutputSampleBufferDelegate {
    let session = AVCaptureSession()
    let queue = DispatchQueue(label: "pdf417.fixture.camera")
    let reader = ZXIBarcodeReader()
    let camera = UIView()
    let result = UITextView()
    lazy var preview = AVCaptureVideoPreviewLayer(session: session)
    var lastFrame: Double = 0
    var found = false
    // Only these exact synthetic payloads are accepted in this isolated experiment.
    let fixtures = [
        "DEMO|NUMERO=0000123456|FIN",
        "DEMO\nNUMERO=0000123456\nFIN",
        "DEMO\u{0000}NUMERO=0000123456\u{0000}FIN",
        "DEMO\u{001d}NUMERO=0000123456\u{001d}FIN"
    ].map { Data($0.utf8) }

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .systemBackground
        let title = UILabel()
        title.text = "Laboratorio PDF417 · Datos ficticios"
        title.font = .preferredFont(forTextStyle: .headline)
        title.numberOfLines = 0
        result.isEditable = false
        result.font = .monospacedSystemFont(ofSize: 15, weight: .regular)
        result.text = "Apunta a uno de los cuatro códigos DEMO del experimento."
        let button = UIButton(type: .system)
        button.setTitle("Volver a escanear", for: .normal)
        button.addTarget(self, action: #selector(reset), for: .touchUpInside)
        let stack = UIStackView(arrangedSubviews: [title, camera, result, button])
        stack.axis = .vertical
        stack.spacing = 16
        stack.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(stack)
        NSLayoutConstraint.activate([
            stack.leadingAnchor.constraint(equalTo: view.safeAreaLayoutGuide.leadingAnchor, constant: 20),
            stack.trailingAnchor.constraint(equalTo: view.safeAreaLayoutGuide.trailingAnchor, constant: -20),
            stack.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor, constant: 12),
            stack.bottomAnchor.constraint(equalTo: view.safeAreaLayoutGuide.bottomAnchor, constant: -12),
            camera.heightAnchor.constraint(equalTo: stack.heightAnchor, multiplier: 0.4),
            button.heightAnchor.constraint(equalToConstant: 48)
        ])
        preview.videoGravity = .resizeAspectFill
        camera.clipsToBounds = true
        camera.layer.addSublayer(preview)
        AVCaptureDevice.requestAccess(for: .video) { [weak self] granted in
            guard let self = self else { return }
            if granted { self.queue.async { self.configure() } }
            else { self.message("Permite la cámara en Ajustes para realizar la prueba.") }
        }
    }

    override func viewDidLayoutSubviews() {
        super.viewDidLayoutSubviews()
        preview.frame = camera.bounds
    }

    func message(_ text: String) {
        DispatchQueue.main.async { self.result.text = text }
    }

    func configure() {
        guard let device = AVCaptureDevice.default(.builtInWideAngleCamera, for: .video, position: .back),
              let input = try? AVCaptureDeviceInput(device: device) else {
            message("No se pudo abrir la cámara trasera."); return
        }
        session.beginConfiguration()
        session.sessionPreset = .high
        let output = AVCaptureVideoDataOutput()
        output.videoSettings = [kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_420YpCbCr8BiPlanarVideoRange]
        output.alwaysDiscardsLateVideoFrames = true
        output.setSampleBufferDelegate(self, queue: queue)
        guard session.canAddInput(input), session.canAddOutput(output) else {
            session.commitConfiguration(); message("No se pudo configurar el lector."); return
        }
        session.addInput(input)
        session.addOutput(output)
        session.commitConfiguration()
        session.startRunning()
    }

    @objc func reset() {
        result.text = "Buscando otro código DEMO…"
        queue.async { self.found = false }
    }

    func captureOutput(_ output: AVCaptureOutput, didOutput sampleBuffer: CMSampleBuffer, from connection: AVCaptureConnection) {
        guard !found else { return }
        let now = ProcessInfo.processInfo.systemUptime
        guard now - lastFrame > 0.3 else { return }
        lastFrame = now
        guard let buffer = CMSampleBufferGetImageBuffer(sampleBuffer),
              let decoded = try? reader.read(buffer).first else { return }
        let data = decoded.bytes
        guard let index = fixtures.firstIndex(of: data) else {
            found = true
            message("Este código no corresponde a las cuatro muestras ficticias. Pulsa Volver a escanear para probar un código DEMO.")
            return
        }
        found = true
        let text = String(decoding: data, as: UTF8.self)
        let escaped = (try? JSONSerialization.data(withJSONObject: [text])).flatMap { String(data: $0, encoding: .utf8) } ?? ""
        let hex = data.map { String(format: "%02x", $0) }.joined(separator: " ")
        message("PRUEBA \(index + 1): CORRECTA\n\nBytes: \(data.count)\n\nTexto escapado:\n\(escaped)\n\nHexadecimal:\n\(hex)\n\nBase64:\n\(data.base64EncodedString())")
    }
}
