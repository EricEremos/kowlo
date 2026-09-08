import UIKit
import PhotosUI

// An isolated verification app, not the production KOWLO interface.
@main
final class ProbeApp: UIResponder, UIApplicationDelegate {
    var window: UIWindow?
    func application(_ application: UIApplication, didFinishLaunchingWithOptions options: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        window = UIWindow(frame: UIScreen.main.bounds)
        window?.rootViewController = ProbeController()
        window?.makeKeyAndVisible()
        return true
    }
}

final class ProbeController: UIViewController {
    private let library = PhotoLibrary()
    private let output = UILabel()
    private var run = UUID()
    private var located = 0
    private var missing = 0

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = UIColor(red: 0.965, green: 0.957, blue: 0.937, alpha: 1)
        let title = UILabel(); title.text = "KOWLO · Library probe"; title.font = .preferredFont(forTextStyle: .title1)
        let detail = UILabel(); detail.text = "Synthetic simulator verification. Saved locations only; no image downloads."; detail.numberOfLines = 0
        output.numberOfLines = 0; output.accessibilityIdentifier = "scan-result"
        let connect = button("Connect photo library", action: #selector(connectLibrary))
        let scan = button("Scan accessible photos", action: #selector(scanLibrary))
        let manage = button("Manage limited access", action: #selector(manageAccess))
        let cancel = button("Cancel scan", action: #selector(cancelScan))
        let checks = button("Check metadata contract", action: #selector(checkContract))
        let stack = UIStackView(arrangedSubviews: [title, detail, connect, scan, manage, cancel, checks, output])
        stack.axis = .vertical; stack.spacing = 20; stack.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(stack)
        NSLayoutConstraint.activate([
            stack.leadingAnchor.constraint(equalTo: view.safeAreaLayoutGuide.leadingAnchor, constant: 24),
            stack.trailingAnchor.constraint(equalTo: view.safeAreaLayoutGuide.trailingAnchor, constant: -24),
            stack.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor, constant: 24)
        ])
        library.onLibraryChange = { [weak self] in self?.scanLibrary() }
        NotificationCenter.default.addObserver(self, selector: #selector(cancelScan), name: UIApplication.didEnterBackgroundNotification, object: nil)
        NotificationCenter.default.addObserver(self, selector: #selector(scanLibrary), name: UIApplication.willEnterForegroundNotification, object: nil)
        show("Access: \(LibraryAccess.current.rawValue)")
    }

    private func button(_ title: String, action: Selector) -> UIButton {
        let button = UIButton(type: .system); button.setTitle(title, for: .normal)
        button.addTarget(self, action: action, for: .touchUpInside)
        button.heightAnchor.constraint(greaterThanOrEqualToConstant: 48).isActive = true
        return button
    }

    private func show(_ text: String) {
        output.text = text
        // Verification counts/status only. Never log asset IDs, coordinates or photo content.
        print("KOWLO_PROBE \(text.replacingOccurrences(of: "\n", with: " | "))")
    }

    @objc private func connectLibrary() {
        library.requestAccess { [weak self] _ in self?.scanLibrary() }
    }

    @objc private func scanLibrary() {
        run = UUID(); let current = run
        located = 0; missing = 0
        library.begin { [weak self] result in
            guard let self, self.run == current else { return }
            switch result {
            case .failure(let error): self.show("Access: \(LibraryAccess.current.rawValue)\nScan: \(error)")
            case .success(let start): self.pull(start.token, run: current)
            }
        }
    }

    private func pull(_ token: UUID, run current: UUID) {
        library.next(token: token, limit: 2) { [weak self] result in
            guard let self, self.run == current else { return }
            switch result {
            case .failure(let error): self.show("Scan: \(error)")
            case .success(let batch):
                self.located += batch.assets.filter { $0.locationStatus == "available" }.count
                self.missing += batch.assets.filter { $0.locationStatus != "available" }.count
                self.show("Access: \(LibraryAccess.current.rawValue)\nScanned: \(batch.scanned)/\(batch.total)\nLocations: \(self.located)\nWithout valid location: \(self.missing)\n\(batch.complete ? "Complete" : "Scanning")")
                if !batch.complete { self.pull(token, run: current) }
            }
        }
    }

    @objc private func manageAccess() {
        guard LibraryAccess.current == .limited else { show("Access: \(LibraryAccess.current.rawValue)"); return }
        PHPhotoLibrary.shared().presentLimitedLibraryPicker(from: self)
    }

    @objc private func cancelScan() {
        run = UUID(); library.cancel(); show("Scan cancelled")
    }

    @objc private func checkContract() {
        cancelScan()
        ProbeChecks.run { [weak self] result in self?.show(result) }
    }
}
