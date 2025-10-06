use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Deserialize, Serialize, Debug, Clone)]
pub struct Product {
    pub id: String,
    pub object: String,
    pub active: bool,
    pub created: i64,
    pub default_price: Option<String>,
    pub description: Option<String>,
    pub images: Vec<String>,
    pub livemode: bool,
    pub metadata: Option<HashMap<String, String>>,
    pub name: String,
    pub package_dimensions: Option<ProductPackageDimensions>,
    pub shippable: Option<bool>,
    pub statement_descriptor: Option<String>,
    pub tax_code: Option<String>,
    #[serde(rename = "type")]
    pub type_: Option<String>,
    pub unit_label: Option<String>,
    pub updated: i64,
    pub url: Option<String>,
}

#[derive(Deserialize, Serialize, Debug, Clone)]
pub struct ProductPackageDimensions {
    pub height: f64,
    pub length: f64,
    pub weight: f64,
    pub width: f64,
}

// Helper struct for creating products
#[derive(Serialize, Deserialize, Debug)]
pub struct CreateProduct {
    pub name: String,
    #[serde(rename = "type")]
    pub type_: Option<String>,
    pub active: Option<bool>,
    pub description: Option<String>,
    pub metadata: Option<HashMap<String, String>>,
    pub images: Option<Vec<String>>,
    pub package_dimensions: Option<ProductPackageDimensions>,
    pub shippable: Option<bool>,
    pub statement_descriptor: Option<String>,
    pub tax_code: Option<String>,
    pub unit_label: Option<String>,
    pub url: Option<String>,
}
