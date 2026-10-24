//! A list of at most `N` items held inline, so hands, the deck, dice and options are `Copy` and
//! never touch the heap. Going past `N` is a broken invariant, so it panics.

use std::fmt;
use std::ops::Deref;

#[derive(Clone, Copy)]
pub struct List<T: Copy, const N: usize> {
    items: [T; N],
    len: u16,
}

impl<T: Copy + Default, const N: usize> Default for List<T, N> {
    fn default() -> Self {
        List {
            items: [T::default(); N],
            len: 0,
        }
    }
}

impl<T: Copy + Default, const N: usize> List<T, N> {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn from_slice(items: &[T]) -> Self {
        let mut list = Self::new();
        for &item in items {
            list.push(item);
        }
        list
    }
}

impl<T: Copy, const N: usize> List<T, N> {
    pub fn push(&mut self, item: T) {
        assert!(
            (self.len as usize) < N,
            "a list of at most {N} items is full"
        );
        self.items[self.len as usize] = item;
        self.len += 1;
    }

    /// Inserts at `at`, shifting the rest down.
    pub fn insert(&mut self, at: usize, item: T) {
        let len = self.len as usize;
        assert!(len < N, "a list of at most {N} items is full");
        assert!(at <= len, "insert at {at} past the end ({len})");
        self.items.copy_within(at..len, at + 1);
        self.items[at] = item;
        self.len += 1;
    }

    /// Removes the item at `at`, keeping the order of the rest.
    pub fn remove(&mut self, at: usize) -> T {
        let len = self.len as usize;
        assert!(at < len, "remove at {at} past the end ({len})");
        let item = self.items[at];
        self.items.copy_within(at + 1..len, at);
        self.len -= 1;
        item
    }

    pub fn clear(&mut self) {
        self.len = 0;
    }

    pub fn as_slice(&self) -> &[T] {
        &self.items[..self.len as usize]
    }

    pub fn as_mut_slice(&mut self) -> &mut [T] {
        &mut self.items[..self.len as usize]
    }
}

impl<T: Copy, const N: usize> Deref for List<T, N> {
    type Target = [T];
    fn deref(&self) -> &[T] {
        self.as_slice()
    }
}

impl<T: Copy + PartialEq, const N: usize> PartialEq for List<T, N> {
    fn eq(&self, other: &Self) -> bool {
        self.as_slice() == other.as_slice()
    }
}

impl<T: Copy + Eq, const N: usize> Eq for List<T, N> {}

impl<T: Copy + fmt::Debug, const N: usize> fmt::Debug for List<T, N> {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.debug_list().entries(self.as_slice()).finish()
    }
}

impl<T: Copy, const N: usize> IntoIterator for List<T, N> {
    type Item = T;
    type IntoIter = std::iter::Take<std::array::IntoIter<T, N>>;
    fn into_iter(self) -> Self::IntoIter {
        self.items.into_iter().take(self.len as usize)
    }
}

impl<'a, T: Copy, const N: usize> IntoIterator for &'a List<T, N> {
    type Item = &'a T;
    type IntoIter = std::slice::Iter<'a, T>;
    fn into_iter(self) -> Self::IntoIter {
        self.as_slice().iter()
    }
}

#[cfg(test)]
mod tests {
    use super::List;

    #[test]
    fn keeps_order_through_inserts_and_removes() {
        let mut list: List<u8, 5> = List::from_slice(&[1, 2, 3]);
        list.insert(0, 9);
        list.insert(4, 8);
        assert_eq!(list.as_slice(), &[9, 1, 2, 3, 8]);
        assert_eq!(list.remove(2), 2);
        assert_eq!(list.as_slice(), &[9, 1, 3, 8]);
    }

    #[test]
    #[should_panic(expected = "full")]
    fn refuses_to_overflow() {
        let mut list: List<u8, 2> = List::from_slice(&[1, 2]);
        list.push(3);
    }
}
