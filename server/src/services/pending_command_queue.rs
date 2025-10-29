use dashmap::DashMap;
use once_cell::sync::OnceCell;
use serde_json::Value;
use std::collections::VecDeque;

type Key = (String, String); // (user_id, target_device_id)

pub struct PendingCommandQueue {
    inner: DashMap<Key, VecDeque<Value>>,
}

impl PendingCommandQueue {
    pub fn new() -> Self {
        Self {
            inner: DashMap::new(),
        }
    }

    pub fn enqueue(&self, key: Key, msg: Value) {
        let mut entry = self.inner.entry(key).or_insert_with(VecDeque::new);
        entry.push_back(msg);
    }

    pub fn drain(&self, key: &Key) -> Vec<Value> {
        self.inner
            .remove(key)
            .map(|(_, mut q)| q.drain(..).collect())
            .unwrap_or_default()
    }

    pub fn pending_count(&self, key: &Key) -> usize {
        self.inner.get(key).map(|q| q.len()).unwrap_or(0)
    }
}

pub static QUEUE: OnceCell<PendingCommandQueue> = OnceCell::new();

pub fn queue() -> &'static PendingCommandQueue {
    QUEUE.get_or_init(|| PendingCommandQueue::new())
}
