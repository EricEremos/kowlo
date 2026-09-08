import Foundation
import Photos
import CoreLocation

enum LibraryAccess: String, Codable {
    case notDetermined, restricted, denied, full, limited

    static var current: LibraryAccess {
        switch PHPhotoLibrary.authorizationStatus(for: .readWrite) {
        case .notDetermined: return .notDetermined
        case .restricted: return .restricted
        case .denied: return .denied
        case .authorized: return .full
        case .limited: return .limited
        @unknown default: return .restricted
        }
    }

    var canRead: Bool { self == .full || self == .limited }
}

struct PhotoMetadata: Codable {
    // Device-local identity only. Never include this value in journal export or sync.
    let assetIdentifier: String
    let locationStatus: String
    let latitude: Double?
    let longitude: Double?
    let horizontalAccuracy: Double?
    let capturedAtUTC: String?

    init(identifier: String, location: CLLocation?, captureDate: Date?) {
        assetIdentifier = identifier
        if let location {
            let coordinate = location.coordinate
            let valid = coordinate.latitude.isFinite && coordinate.longitude.isFinite && CLLocationCoordinate2DIsValid(coordinate)
            locationStatus = valid ? "available" : "invalid"
            latitude = valid ? coordinate.latitude : nil
            longitude = valid ? coordinate.longitude : nil
            horizontalAccuracy = valid && location.horizontalAccuracy.isFinite && location.horizontalAccuracy >= 0 ? location.horizontalAccuracy : nil
        } else {
            locationStatus = "missing"
            latitude = nil
            longitude = nil
            horizontalAccuracy = nil
        }
        capturedAtUTC = captureDate.map { ISO8601DateFormatter().string(from: $0) }
    }
}

struct PhotoScanStart {
    let token: UUID
    let total: Int
    let access: LibraryAccess
}

struct PhotoScanBatch {
    let token: UUID
    let scanned: Int
    let total: Int
    let complete: Bool
    let assets: [PhotoMetadata]
}

enum PhotoScanError: Error {
    case accessUnavailable, invalidated, invalidBatchSize
}

/// Pull-based metadata batches. Queue owns the fetch/cursor; lock invalidates in-flight work immediately.
final class PhotoLibrary: NSObject, PHPhotoLibraryChangeObserver {
    private let queue = DispatchQueue(label: "kowlo.photo-metadata", qos: .userInitiated)
    private let lock = NSLock()
    private var generation = UUID()
    private var fetch: PHFetchResult<PHAsset>?
    private var scanToken: UUID?
    private var scanAccess: LibraryAccess?
    private var cursor = 0
    private var includeCaptureTime = false
    private var observing = false
    var onLibraryChange: (() -> Void)?

    private func isCurrent(_ token: UUID) -> Bool {
        lock.lock(); defer { lock.unlock() }
        return generation == token
    }

    func cancel() {
        lock.lock(); generation = UUID(); lock.unlock()
        queue.async { self.fetch = nil; self.scanToken = nil }
    }

    func requestAccess(completion: @escaping (LibraryAccess) -> Void) {
        if LibraryAccess.current != .notDetermined {
            DispatchQueue.main.async { completion(LibraryAccess.current) }
            return
        }
        PHPhotoLibrary.requestAuthorization(for: .readWrite) { _ in
            DispatchQueue.main.async { completion(LibraryAccess.current) }
        }
    }

    func begin(includeCaptureTime: Bool = false, completion: @escaping (Result<PhotoScanStart, PhotoScanError>) -> Void) {
        cancel()
        lock.lock(); let token = generation; lock.unlock()
        queue.async {
            let access = LibraryAccess.current
            guard access.canRead else {
                DispatchQueue.main.async { completion(.failure(.accessUnavailable)) }
                return
            }
            guard self.isCurrent(token) else {
                DispatchQueue.main.async { completion(.failure(.invalidated)) }
                return
            }
            if !self.observing {
                PHPhotoLibrary.shared().register(self)
                self.observing = true
            }
            let options = PHFetchOptions()
            options.includeHiddenAssets = false
            options.includeAllBurstAssets = true
            let result = PHAsset.fetchAssets(with: .image, options: options)
            self.fetch = result
            self.scanToken = token
            self.scanAccess = access
            self.cursor = 0
            self.includeCaptureTime = includeCaptureTime
            DispatchQueue.main.async {
                guard self.isCurrent(token), LibraryAccess.current == access else {
                    completion(.failure(.invalidated)); return
                }
                completion(.success(PhotoScanStart(token: token, total: result.count, access: access)))
            }
        }
    }

    func next(token: UUID, limit: Int = 128, completion: @escaping (Result<PhotoScanBatch, PhotoScanError>) -> Void) {
        guard (1...256).contains(limit) else {
            DispatchQueue.main.async { completion(.failure(.invalidBatchSize)) }
            return
        }
        queue.async {
            guard self.isCurrent(token), self.scanToken == token,
                  let result = self.fetch, let access = self.scanAccess,
                  access.canRead, LibraryAccess.current == access else {
                DispatchQueue.main.async { completion(.failure(.invalidated)) }
                return
            }
            let end = min(self.cursor + limit, result.count)
            var assets: [PhotoMetadata] = []
            for index in self.cursor..<end {
                guard self.isCurrent(token), LibraryAccess.current == access else {
                    DispatchQueue.main.async { completion(.failure(.invalidated)) }
                    return
                }
                autoreleasepool {
                    let asset = result.object(at: index)
                    assets.append(PhotoMetadata(identifier: asset.localIdentifier, location: asset.location,
                                                captureDate: self.includeCaptureTime ? asset.creationDate : nil))
                }
            }
            self.cursor = end
            let batch = PhotoScanBatch(token: token, scanned: end, total: result.count, complete: end == result.count, assets: assets)
            DispatchQueue.main.async {
                guard self.isCurrent(token), LibraryAccess.current == access else {
                    completion(.failure(.invalidated)); return
                }
                completion(.success(batch))
            }
        }
    }

    func photoLibraryDidChange(_ changeInstance: PHChange) {
        cancel()
        DispatchQueue.main.async { self.onLibraryChange?() }
    }

    deinit {
        if observing { PHPhotoLibrary.shared().unregisterChangeObserver(self) }
    }
}
