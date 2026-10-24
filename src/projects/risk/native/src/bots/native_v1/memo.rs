//! Memos keyed by a content hash: a remembered answer is the one a fresh computation gives, since
//! its key covers everything the computation reads. Each is a direct-mapped table per thread (a
//! key's low bits pick its slot, a newer answer replaces an older one), so what is remembered
//! changes only the time a decision takes.

use std::cell::RefCell;
use std::thread::LocalKey;

pub struct Table<V> {
    slots: Vec<Option<(u128, V)>>,
}

pub type Memo<V> = RefCell<Table<V>>;

/// A table of 2^`bits` slots.
pub fn new_memo<V>(bits: u32) -> Memo<V> {
    RefCell::new(Table {
        slots: std::iter::repeat_with(|| None).take(1 << bits).collect(),
    })
}

/// The answer remembered under `key`, or `compute`'s, remembered.
pub fn remembered<V: Clone + 'static>(
    memo: &'static LocalKey<Memo<V>>,
    key: u128,
    compute: impl FnOnce() -> V,
) -> V {
    let known = memo.with(|m| {
        let m = m.borrow();
        match &m.slots[key as usize & (m.slots.len() - 1)] {
            Some((k, v)) if *k == key => Some(v.clone()),
            _ => None,
        }
    });
    if let Some(v) = known {
        return v;
    }
    let v = compute();
    memo.with(|m| {
        let mut m = m.borrow_mut();
        let slot = key as usize & (m.slots.len() - 1);
        m.slots[slot] = Some((key, v.clone()));
    });
    v
}
