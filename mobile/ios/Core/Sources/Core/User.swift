import Foundation

public struct User: Codable {
  public var name: String?
  public var email: String?
  public var id: String?
  public var role: String?
  public var picture: String?

  private enum CodingKeys: String, CodingKey {
    case name
    case email
    case id
    case role
    case picture
  }

  public init(name: String? = nil, email: String? = nil, id: String? = nil, role: String? = nil, picture: String? = nil) {
    self.name = name
    self.email = email
    self.id = id
    self.role = role
    self.picture = picture
  }

  public init(from decoder: Decoder) throws {
    let container = try decoder.container(keyedBy: CodingKeys.self)
    self.name = try container.decodeIfPresent(String.self, forKey: .name)
    self.email = try container.decodeIfPresent(String.self, forKey: .email)
    self.id = try container.decodeIfPresent(String.self, forKey: .id)
    self.role = try container.decodeIfPresent(String.self, forKey: .role)
    self.picture = try container.decodeIfPresent(String.self, forKey: .picture)
  }

  public func encode(to encoder: Encoder) throws {
    var container = encoder.container(keyedBy: CodingKeys.self)
    try container.encodeIfPresent(name, forKey: .name)
    try container.encodeIfPresent(email, forKey: .email)
    try container.encodeIfPresent(id, forKey: .id)
    try container.encodeIfPresent(role, forKey: .role)
    try container.encodeIfPresent(picture, forKey: .picture)
  }
}

// MARK: - FrontendUser Conversion
extension User {
  public init(from frontendUser: FrontendUser) {
    self.name = frontendUser.name
    self.email = frontendUser.email
    self.id = frontendUser.id
    self.role = frontendUser.role
    self.picture = nil // FrontendUser doesn't have picture field
  }

  public func toFrontendUser() -> FrontendUser? {
    guard let id = self.id, let role = self.role, let email = self.email else {
      return nil
    }
    return FrontendUser(
      id: id,
      email: email,
      name: (self.name?.isEmpty ?? true) ? nil : self.name,
      role: role
    )
  }
}
