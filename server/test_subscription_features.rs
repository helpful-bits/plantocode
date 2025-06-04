// Test script to verify subscription plan features work correctly
use serde_json::json;
use vibe_manager_server::db::repositories::subscription_plan_repository::{
    PlanFeatures, SpendingDetails, SupportLevel, OveragePolicy
};

fn main() {
    println!("Testing subscription plan features...");

    // Test Pro Plan features
    let pro_plan_json = json!({
        "coreFeatures": ["All AI models", "Priority support", "Advanced analytics", "API access"],
        "allowedModels": ["all"],
        "supportLevel": "Priority",
        "apiAccess": true,
        "analyticsLevel": "Advanced",
        "spendingDetails": {
            "overagePolicy": "standard_rate",
            "hardCutoff": true
        }
    });

    let pro_features: PlanFeatures = serde_json::from_value(pro_plan_json).unwrap();
    println!("✅ Pro plan features parsed successfully");
    
    assert!(pro_features.allows_all_models());
    assert!(pro_features.has_api_access());
    assert_eq!(pro_features.get_support_level(), SupportLevel::Priority);
    assert_eq!(pro_features.get_overage_policy(), OveragePolicy::StandardRate);
    assert!(pro_features.allows_overage());
    println!("✅ Pro plan feature checks pass");

    // Test Free Plan features
    let free_plan_json = json!({
        "coreFeatures": ["Basic AI models", "Community support", "Usage analytics"],
        "allowedModels": ["anthropic/claude-sonnet-4", "openai/gpt-4.1-mini"],
        "supportLevel": "Community",
        "apiAccess": false,
        "analyticsLevel": "Basic",
        "spendingDetails": {
            "overagePolicy": "none",
            "hardCutoff": true
        }
    });

    let free_features: PlanFeatures = serde_json::from_value(free_plan_json).unwrap();
    println!("✅ Free plan features parsed successfully");
    
    assert!(!free_features.allows_all_models());
    assert!(free_features.allows_model("anthropic/claude-sonnet-4"));
    assert!(!free_features.allows_model("anthropic/claude-opus-4"));
    assert!(!free_features.has_api_access());
    assert_eq!(free_features.get_support_level(), SupportLevel::Community);
    assert_eq!(free_features.get_overage_policy(), OveragePolicy::None);
    assert!(!free_features.allows_overage());
    println!("✅ Free plan feature checks pass");

    println!("🎉 All subscription plan feature tests passed!");
}