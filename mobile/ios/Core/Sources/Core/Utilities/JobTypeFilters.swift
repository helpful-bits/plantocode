import Foundation

public let planTaskTypeKeywords: Set<String> = [
    "implementation_plan", "plan_merge", "plans",
    "create_implementation_plan", "merge_plans", "implementationPlan"
]

public func isPlanTaskType(_ t: String) -> Bool {
    let lower = t.lowercased()
    if lower.contains("plan") { return true }
    if planTaskTypeKeywords.contains(t) { return true }
    return false
}
