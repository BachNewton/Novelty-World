"""The reference engine's random stream (`rng.py`) in native 32-bit arithmetic.

mulberry32 is 32-bit integer arithmetic throughout: JavaScript's `Math.imul` is a 32-bit
multiplication's wraparound, which `uint32` multiplication is, and `>>>` is a logical shift, which
`>>` on `uint32` is. Its draw is r = t / 2^32 for the 32-bit t it returns, so the engine keeps t and
never forms r: `Math.floor(r * n)` is ⌊t·n / 2^32⌋, computed exactly in 32 bits by halves (`below`).
"""

import jax.numpy as jnp

GOLDEN = 0x6D2B79F5


def next_bits(state: jnp.ndarray) -> tuple[jnp.ndarray, jnp.ndarray]:
    """One `next()` per lane: (t uint32, the draw being t / 2^32; the state after, uint32)."""
    state = state + jnp.uint32(GOLDEN)
    t = state
    t = (t ^ (t >> 15)) * (t | 1)
    t = t ^ (t + (t ^ (t >> 7)) * (t | 61))
    return t ^ (t >> 14), state


def below(t: jnp.ndarray, n) -> jnp.ndarray:
    """`Math.floor((t / 2^32) * n)` as int32, for 0 ≤ n < 2^16. With t = h·2^16 + l,
    ⌊t·n / 2^32⌋ = ⌊(h·n + ⌊l·n / 2^16⌋) / 2^16⌋, and every product stays below 2^32."""
    n = jnp.asarray(n).astype(jnp.uint32)
    hi, lo = t >> 16, t & 0xFFFF
    return ((hi * n + ((lo * n) >> 16)) >> 16).astype(jnp.int32)
