//! `src/shared/lib/seeded-random.ts` and `shuffleArray` from `src/shared/lib/utils.ts`: xmur3 over
//! the seed's UTF-16 code units into a mulberry32 state.

use crate::jsmath::imul;

#[derive(Clone, Debug)]
pub struct Rng {
    state: u32,
}

impl Rng {
    pub fn from_seed(seed: &str) -> Rng {
        let units: Vec<u16> = seed.encode_utf16().collect();
        let mut h: u32 = 1779033703 ^ units.len() as u32;
        for &unit in &units {
            h = imul((h ^ unit as u32) as i32, 3432918353u32 as i32) as u32;
            h = h.rotate_left(13);
        }
        h = imul((h ^ (h >> 16)) as i32, 2246822507u32 as i32) as u32;
        h = imul((h ^ (h >> 13)) as i32, 3266489909u32 as i32) as u32;
        Rng {
            state: h ^ (h >> 16),
        }
    }

    pub fn from_state(state: u32) -> Rng {
        Rng { state }
    }

    pub fn state(&self) -> u32 {
        self.state
    }

    /// A uniform value in [0, 1).
    #[allow(clippy::should_implement_trait)]
    pub fn next(&mut self) -> f64 {
        self.state = self.state.wrapping_add(0x6d2b79f5);
        let mut t = self.state as i32;
        t = imul(t ^ ((t as u32) >> 15) as i32, t | 1);
        t ^= t.wrapping_add(imul(t ^ ((t as u32) >> 7) as i32, t | 61));
        ((t ^ ((t as u32) >> 14) as i32) as u32) as f64 / 4294967296.0
    }

    /// A uniform value in [low, high).
    pub fn uniform(&mut self, low: f64, high: f64) -> f64 {
        low + self.next() * (high - low)
    }

    /// One of `items`, each equally likely.
    pub fn pick<'a, T>(&mut self, items: &'a [T]) -> &'a T {
        &items[(self.next() * items.len() as f64).floor() as usize]
    }

    /// Fisher–Yates from the end, as `shuffleArray`.
    pub fn shuffle<T: Clone>(&mut self, items: &[T]) -> Vec<T> {
        let mut out = items.to_vec();
        for i in (1..out.len()).rev() {
            let j = (self.next() * (i + 1) as f64).floor() as usize;
            out.swap(i, j);
        }
        out
    }
}
