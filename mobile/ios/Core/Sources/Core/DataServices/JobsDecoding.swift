import Foundation

public struct JobsDecoding {

    public enum DecodingError: Error, LocalizedError {
        case missingJobsArray
        case missingJobKey
        case invalidJobData
        case decodingFailed(underlying: Error)

        public var errorDescription: String? {
            switch self {
            case .missingJobsArray:
                return "Response missing 'jobs' array"
            case .missingJobKey:
                return "Response missing 'job' key"
            case .invalidJobData:
                return "Invalid job data format"
            case .decodingFailed(let underlying):
                return "Job decoding failed: \(underlying.localizedDescription)"
            }
        }
    }

    public static func decodeJob(dict: [String: Any]) throws -> BackgroundJob {
        let jsonData = try JSONSerialization.data(withJSONObject: dict)
        let decoder = JSONDecoder()
        do {
            return try decoder.decode(BackgroundJob.self, from: jsonData)
        } catch {
            throw DecodingError.decodingFailed(underlying: error)
        }
    }

    public static func decodeJobList(dict: [String: Any]) throws -> JobListResponse {
        guard let jobsArray = dict["jobs"] as? [[String: Any]] else {
            throw DecodingError.missingJobsArray
        }

        let jsonData = try JSONSerialization.data(withJSONObject: jobsArray)
        let decoder = JSONDecoder()
        let jobs: [BackgroundJob]
        do {
            jobs = try decoder.decode([BackgroundJob].self, from: jsonData)
        } catch {
            throw DecodingError.decodingFailed(underlying: error)
        }

        let totalCount = dict["totalCount"] as? Int ?? jobs.count
        let page = dict["page"] as? Int ?? 0
        let pageSize = dict["pageSize"] as? Int ?? jobs.count
        let hasMore = dict["hasMore"] as? Bool ?? false

        return JobListResponse(
            jobs: jobs,
            totalCount: UInt32(totalCount),
            page: UInt32(page),
            pageSize: UInt32(pageSize),
            hasMore: hasMore
        )
    }

    public static func decodeJobEnvelope(dict: [String: Any]) throws -> BackgroundJob {
        guard let jobData = dict["job"] as? [String: Any] else {
            throw DecodingError.missingJobKey
        }
        return try decodeJob(dict: jobData)
    }
}
