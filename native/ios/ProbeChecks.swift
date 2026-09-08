import Foundation
import CoreLocation

enum ProbeChecks {
    static func run(completion: @escaping (String) -> Void) {
        var passed = 0
        var failures: [String] = []
        func check(_ condition: Bool, _ name: String) {
            if condition { passed += 1 } else { failures.append(name) }
        }
        let missing = PhotoMetadata(identifier: "synthetic", location: nil, captureDate: nil)
        check(missing.locationStatus == "missing" && missing.latitude == nil && missing.longitude == nil, "missing GPS")
        check(missing.capturedAtUTC == nil, "optional time")
        let invalid = PhotoMetadata(identifier: "synthetic", location: CLLocation(latitude: 91, longitude: 0), captureDate: nil)
        check(invalid.locationStatus == "invalid" && invalid.latitude == nil && invalid.longitude == nil, "invalid GPS")
        let zero = PhotoMetadata(identifier: "synthetic", location: CLLocation(latitude: 0, longitude: 0), captureDate: nil)
        check(zero.locationStatus == "available" && zero.latitude == 0 && zero.longitude == 0, "valid zero coordinate")
        let southern = PhotoMetadata(identifier: "synthetic", location: CLLocation(latitude: -33.8, longitude: -70.6), captureDate: Date(timeIntervalSince1970: 0))
        check(southern.latitude == -33.8 && southern.longitude == -70.6, "hemisphere signs")
        check(southern.capturedAtUTC == "1970-01-01T00:00:00Z", "UTC normalization")
        let library = PhotoLibrary()
        library.next(token: UUID(), limit: 0) { result in
            if case .failure(.invalidBatchSize) = result { check(true, "batch limit") }
            else { check(false, "batch limit") }
            library.begin { start in
                guard case .success(let scan) = start else {
                    completion("Contract checks: photo access required for cancellation test")
                    return
                }
                library.cancel()
                library.next(token: scan.token) { result in
                    if case .failure(.invalidated) = result { check(true, "cancelled token") }
                    else { check(false, "cancelled token") }
                    completion(failures.isEmpty ? "Contract checks: \(passed)/8 passed" : "Contract failures: \(failures.joined(separator: ", "))")
                }
            }
        }
    }
}
