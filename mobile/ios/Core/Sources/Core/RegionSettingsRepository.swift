import Foundation
import SQLite

/// Repository for managing region settings persistence using SQLite
public class RegionSettingsRepository {

    /// Shared instance for singleton access
    public static let shared = RegionSettingsRepository()

    // MARK: - Private Properties

    private var db: Connection?
    private let queue = DispatchQueue(label: "regionSettingsRepository", qos: .utility)

    // Table and column definitions
    private let regionSettingsTable = Table("region_settings")
    private let id = Expression<String>("id")
    private let region = Expression<String>("region")
    private let baseURL = Expression<String>("base_url")
    private let updatedAt = Expression<Int64>("updated_at")

    // MARK: - Initialization

    private init() {
        setupDatabase()
    }

    // MARK: - Public Methods

    /// Gets the active region settings
    /// - Returns: A tuple containing the region name and base URL
    public func getActive() -> (region: String, baseURL: String) {
        return queue.sync {
            do {
                guard let db = db else {
                    return getDefaultRegion()
                }

                // Try to get the active region
                if let row = try db.pluck(regionSettingsTable.filter(id == "active")) {
                    return (region: row[region], baseURL: row[baseURL])
                } else {
                    // No active region found, insert default and return it
                    let defaultRegion = getDefaultRegion()
                    try insertDefaultRegion(defaultRegion.region, defaultRegion.baseURL)
                    return defaultRegion
                }
            } catch {
                print("Error getting active region: \(error)")
                return getDefaultRegion()
            }
        }
    }

    /// Sets the active region
    /// - Parameters:
    ///   - region: The region name
    ///   - baseURL: The base URL for the region
    public func setActive(region: String, baseURL: String) {
        queue.async {
            do {
                guard let db = self.db else {
                    print("Database not initialized")
                    return
                }

                let currentTime = Int64(Date().timeIntervalSince1970)

                // Update or insert the active region
                let activeFilter = self.regionSettingsTable.filter(self.id == "active")
                if try db.pluck(activeFilter) != nil {
                    // Update existing record
                    try db.run(activeFilter.update(
                        self.region <- region,
                        self.baseURL <- baseURL,
                        self.updatedAt <- currentTime
                    ))
                } else {
                    // Insert new record
                    try db.run(self.regionSettingsTable.insert(
                        self.id <- "active",
                        self.region <- region,
                        self.baseURL <- baseURL,
                        self.updatedAt <- currentTime
                    ))
                }
            } catch {
                print("Error setting active region: \(error)")
            }
        }
    }

    /// Gets the active region name
    /// - Returns: The name of the active region
    public func getActiveRegion() -> String {
        return getActive().region
    }

    /// Sets the active region by region name
    /// - Parameter region: The region name to set as active
    public func setActiveRegion(region: String) {
        let baseURL = getBaseURLForRegion(region)
        setActive(region: region, baseURL: baseURL)
    }

    /// Gets all available regions
    /// - Returns: Array of tuples containing region names and their base URLs
    public func getAvailableRegions() -> [(region: String, baseURL: String)] {
        #if DEBUG
        return [
            ("Local Development", "http://192.168.0.38:8080"),
            ("United States", "https://api.us.vibemanager.app"),
            ("European Union", "https://api.eu.vibemanager.app")
        ]
        #else
        return [
            ("United States", "https://api.us.vibemanager.app"),
            ("European Union", "https://api.eu.vibemanager.app")
        ]
        #endif
    }

    /// Gets the base URL for a given region name
    /// - Parameter region: The region name
    /// - Returns: The base URL for the region
    private func getBaseURLForRegion(_ region: String) -> String {
        let availableRegions = getAvailableRegions()
        return availableRegions.first { $0.region == region }?.baseURL ?? getDefaultRegion().baseURL
    }

    // MARK: - Private Methods

    private func setupDatabase() {
        do {
            let documentsPath = NSSearchPathForDirectoriesInDomains(.libraryDirectory, .userDomainMask, true).first!
            let applicationSupportPath = documentsPath.appending("/Application Support")

            // Create Application Support directory if it doesn't exist
            let fileManager = FileManager.default
            if !fileManager.fileExists(atPath: applicationSupportPath) {
                try fileManager.createDirectory(atPath: applicationSupportPath, withIntermediateDirectories: true, attributes: nil)
            }

            let dbPath = applicationSupportPath.appending("/settings.db")
            db = try Connection(dbPath)

            createTableIfNeeded()
        } catch {
            print("Database setup error: \(error)")
        }
    }

    private func createTableIfNeeded() {
        do {
            guard let db = db else { return }

            try db.run(regionSettingsTable.create(ifNotExists: true) { t in
                t.column(id, primaryKey: true)
                t.column(region)
                t.column(baseURL)
                t.column(updatedAt)
            })
        } catch {
            print("Create table error: \(error)")
        }
    }

    private func getDefaultRegion() -> (region: String, baseURL: String) {
        #if DEBUG
        // Using Mac's actual IP for both simulator and physical device testing
        // Server runs on port 8080
        return ("Local Development", "http://192.168.0.38:8080")
        #else
        return ("United States", "https://api.us.vibemanager.app")
        #endif
    }

    private func insertDefaultRegion(_ regionName: String, _ url: String) throws {
        guard let db = db else { return }

        let currentTime = Int64(Date().timeIntervalSince1970)
        try db.run(regionSettingsTable.insert(
            id <- "active",
            region <- regionName,
            baseURL <- url,
            updatedAt <- currentTime
        ))
    }
}