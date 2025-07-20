use serde::{Deserialize, Serialize};

/// Expandable field in Stripe API objects
/// Can be either an ID string or the full expanded object
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(untagged)]
pub enum Expandable<T> {
    Id(String),
    Object(Box<T>),
}