import Foundation
import Security
import CommonCrypto

public class CertificatePinningManager {
    public static let shared = CertificatePinningManager()

    private var pinsByHost: [String: [String]] = [:]
    private var enforce: Bool = false

    private init() {}

    public struct PinConfiguration {
        let host: String
        let pins: [String]
        let enforceMode: Bool

        public init(host: String, pins: [String], enforceMode: Bool) {
            self.host = host
            self.pins = pins
            self.enforceMode = enforceMode
        }
    }

    public func setPinning(pinsByHost: [String: [String]], enforce: Bool) {
        self.pinsByHost = pinsByHost
        self.enforce = enforce
    }

    public func setPinning(for configuration: PinConfiguration) {
        guard !configuration.pins.isEmpty else {
            return
        }
        pinsByHost[configuration.host] = configuration.pins
        enforce = configuration.enforceMode
    }

    public func createURLSessionDelegate(endpointType: EndpointType) -> URLSessionDelegate {
        return CertificatePinningDelegate(pinningManager: self, endpointType: endpointType)
    }

    public static func validateCertificate(for host: String, certificate: Data) -> Bool {
        return shared.validateCertificateInternal(for: host, certificate: certificate)
    }

    private func validateCertificateInternal(for host: String, certificate: Data) -> Bool {
        guard enforce, let expectedPins = pinsByHost[host] else {
            return true // No pinning configured for this host
        }

        // Extract SPKI from certificate and compute SHA256
        guard let spkiHash = extractSPKISHA256(from: certificate) else {
            return false
        }

        return expectedPins.contains(spkiHash)
    }

    private func extractSPKISHA256(from certificateData: Data) -> String? {
        guard let certificate = SecCertificateCreateWithData(nil, certificateData as CFData) else {
            return nil
        }

        // Extract public key
        var trust: SecTrust?
        let policy = SecPolicyCreateBasicX509()
        let status = SecTrustCreateWithCertificates(certificate, policy, &trust)
        guard status == errSecSuccess, let trust = trust else {
            return nil
        }

        guard let publicKey = SecTrustCopyPublicKey(trust) else {
            return nil
        }

        // Extract SPKI data
        guard let spkiData = SecKeyCopyExternalRepresentation(publicKey, nil) else {
            return nil
        }

        // Compute SHA256 hash
        let spkiBytes = CFDataGetBytePtr(spkiData)!
        let spkiLength = CFDataGetLength(spkiData)
        var hash = [UInt8](repeating: 0, count: Int(CC_SHA256_DIGEST_LENGTH))

        CC_SHA256(spkiBytes, CC_LONG(spkiLength), &hash)

        // Convert to base64 string
        let hashData = Data(hash)
        return hashData.base64EncodedString()
    }

    public enum EndpointType {
        case direct
        case directLocal
        case relay
    }
}

// URLSessionDelegate implementation for certificate pinning
private class CertificatePinningDelegate: NSObject, URLSessionDelegate {
    private let pinningManager: CertificatePinningManager
    private let endpointType: CertificatePinningManager.EndpointType

    init(pinningManager: CertificatePinningManager, endpointType: CertificatePinningManager.EndpointType) {
        self.pinningManager = pinningManager
        self.endpointType = endpointType
    }

    func urlSession(_ session: URLSession, didReceive challenge: URLAuthenticationChallenge, completionHandler: @escaping (URLSession.AuthChallengeDisposition, URLCredential?) -> Void) {
        // Only handle server trust challenges
        guard challenge.protectionSpace.authenticationMethod == NSURLAuthenticationMethodServerTrust else {
            completionHandler(.performDefaultHandling, nil)
            return
        }

        guard let serverTrust = challenge.protectionSpace.serverTrust else {
            completionHandler(.cancelAuthenticationChallenge, nil)
            return
        }

        // Get the host
        let host = challenge.protectionSpace.host

        // Extract certificate chain
        let certificateCount = SecTrustGetCertificateCount(serverTrust)
        guard certificateCount > 0 else {
            completionHandler(.cancelAuthenticationChallenge, nil)
            return
        }

        // Check each certificate in the chain
        for i in 0..<certificateCount {
            guard let certificate = SecTrustGetCertificateAtIndex(serverTrust, i) else {
                continue
            }

            let certificateData = SecCertificateCopyData(certificate)
            let data = CFDataCreateCopy(nil, certificateData)!

            if CertificatePinningManager.validateCertificate(for: host, certificate: data as Data) {
                // Pin matched, allow connection
                let credential = URLCredential(trust: serverTrust)
                completionHandler(.useCredential, credential)
                return
            }
        }

        // No pins matched, reject connection
        completionHandler(.cancelAuthenticationChallenge, nil)
    }
}