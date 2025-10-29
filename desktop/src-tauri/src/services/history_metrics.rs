use std::collections::HashMap;
use std::sync::{Arc, Mutex};

#[derive(Default)]
pub struct HistoryMetrics {
    sync_durations: Arc<Mutex<Vec<u128>>>,
    merge_durations: Arc<Mutex<Vec<u128>>>,
    apply_counts: Arc<Mutex<HashMap<String, usize>>>,
}

impl HistoryMetrics {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn record_sync(&self, duration_ms: u128) {
        #[cfg(debug_assertions)]
        {
            let mut durations = self.sync_durations.lock().unwrap();
            durations.push(duration_ms);
            if durations.len() > 1000 {
                durations.drain(0..500);
            }
        }
        #[cfg(not(debug_assertions))]
        let _ = duration_ms; // Suppress unused variable warning in release
    }

    pub fn record_merge(&self, duration_ms: u128) {
        #[cfg(debug_assertions)]
        {
            let mut durations = self.merge_durations.lock().unwrap();
            durations.push(duration_ms);
            if durations.len() > 1000 {
                durations.drain(0..500);
            }
        }
        #[cfg(not(debug_assertions))]
        let _ = duration_ms; // Suppress unused variable warning in release
    }

    pub fn get_p95_sync(&self) -> Option<u128> {
        #[cfg(debug_assertions)]
        {
            let durations = self.sync_durations.lock().unwrap();
            if durations.is_empty() {
                return None;
            }
            let mut sorted = durations.clone();
            sorted.sort_unstable();
            let idx = (sorted.len() as f64 * 0.95) as usize;
            Some(sorted[idx])
        }
        #[cfg(not(debug_assertions))]
        None
    }

    pub fn print_stats(&self) {
        #[cfg(debug_assertions)]
        {
            if let Some(p95) = self.get_p95_sync() {
                println!("[METRICS] Sync p95: {}ms", p95);
            }
        }
    }
}
