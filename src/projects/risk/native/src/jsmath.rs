//! JavaScript's numeric semantics, as V8 computes them.
//!
//! `exp` and `log` are V8's own (`src/base/ieee754.cc`), ports of fdlibm (FreeBSD msun's `e_exp.c`
//! and `e_log.c`), ported here rather than taken from the platform's libm, whose last bit may
//! differ; every operation keeps fdlibm's order. `pow` is the exception: see its own note.

/// `Number.MIN_VALUE`, the smallest positive subnormal.
pub const MIN_VALUE: f64 = f64::from_bits(1);

fn high(x: f64) -> i32 {
    (x.to_bits() >> 32) as u32 as i32
}

fn low(x: f64) -> u32 {
    x.to_bits() as u32
}

fn from_words(hi: i32, lo: u32) -> f64 {
    f64::from_bits(((hi as u32 as u64) << 32) | lo as u64)
}

fn with_high(x: f64, hi: i32) -> f64 {
    from_words(hi, low(x))
}

/// `Math.round`: halves toward +∞, `-0.5` to `-0`, and 0.49999999999999994 to 0 (a naive
/// `floor(x + 0.5)` rounds that one up).
pub fn js_round(x: f64) -> f64 {
    let up = x.ceil();
    if up - 0.5 > x {
        up - 1.0
    } else {
        up
    }
}

/// `Math.max` of two: NaN if either is, and +0 above −0.
pub fn js_max(a: f64, b: f64) -> f64 {
    if a.is_nan() || b.is_nan() {
        return f64::NAN;
    }
    if a == b {
        return if a.is_sign_negative() { b } else { a };
    }
    if a > b {
        a
    } else {
        b
    }
}

/// `Math.min` of two: NaN if either is, and −0 below +0.
pub fn js_min(a: f64, b: f64) -> f64 {
    if a.is_nan() || b.is_nan() {
        return f64::NAN;
    }
    if a == b {
        return if a.is_sign_negative() { a } else { b };
    }
    if a < b {
        a
    } else {
        b
    }
}

/// `Math.imul`.
pub fn imul(a: i32, b: i32) -> i32 {
    a.wrapping_mul(b)
}

/// `x >>> 0`: ToUint32, the integer part modulo 2³².
pub fn to_u32(x: f64) -> u32 {
    if !x.is_finite() {
        return 0;
    }
    x.trunc().rem_euclid(4294967296.0) as u32
}

/// `Math.fround`.
pub fn fround(x: f64) -> f64 {
    x as f32 as f64
}

/// `n.toString(36)` for a non-negative integer.
pub fn to_base36(mut n: u32) -> String {
    const DIGITS: &[u8; 36] = b"0123456789abcdefghijklmnopqrstuvwxyz";
    let mut out = Vec::new();
    loop {
        out.push(DIGITS[(n % 36) as usize]);
        n /= 36;
        if n == 0 {
            break;
        }
    }
    out.reverse();
    String::from_utf8(out).expect("base-36 digits are ASCII")
}

// fdlibm's constants by their bits, the values its comments name as the intended ones.
const TWO54: f64 = f64::from_bits(0x4350000000000000);
const HUGE: f64 = 1.0e300;

/// `Math.exp`.
pub fn exp(x: f64) -> f64 {
    const O_THRESHOLD: f64 = f64::from_bits(0x40862E42FEFA39EF);
    const U_THRESHOLD: f64 = f64::from_bits(0xC0874910D52D3051);
    const HALF: [f64; 2] = [0.5, -0.5];
    const LN2_HI: [f64; 2] = [
        f64::from_bits(0x3FE62E42FEE00000),
        f64::from_bits(0xBFE62E42FEE00000),
    ];
    const LN2_LO: [f64; 2] = [
        f64::from_bits(0x3DEA39EF35793C76),
        f64::from_bits(0xBDEA39EF35793C76),
    ];
    const INVLN2: f64 = f64::from_bits(0x3FF71547652B82FE);
    const P1: f64 = f64::from_bits(0x3FC555555555553E);
    const P2: f64 = f64::from_bits(0xBF66C16C16BEBD93);
    const P3: f64 = f64::from_bits(0x3F11566AAF25DE2C);
    const P4: f64 = f64::from_bits(0xBEBBBD41C5D26BF1);
    const P5: f64 = f64::from_bits(0x3E66376972BEA4D0);
    const TWOM1000: f64 = f64::from_bits(0x0170000000000000);

    let mut x = x;
    let mut hi = 0.0;
    let mut lo = 0.0;
    let mut k: i32 = 0;
    let mut hx = high(x) as u32;
    let xsb = ((hx >> 31) & 1) as usize;
    hx &= 0x7fffffff;

    if hx >= 0x40862E42 {
        if hx >= 0x7ff00000 {
            if ((hx & 0xfffff) | low(x)) != 0 {
                return x + x;
            }
            return if xsb == 0 { x } else { 0.0 };
        }
        if x > O_THRESHOLD {
            return HUGE * HUGE;
        }
        if x < U_THRESHOLD {
            return TWOM1000 * TWOM1000;
        }
    }

    if hx > 0x3fd62e42 {
        if hx < 0x3FF0A2B2 {
            // V8 answers exp(1) with E, which the reduction below misses by a bit.
            if x == 1.0 {
                return std::f64::consts::E;
            }
            hi = x - LN2_HI[xsb];
            lo = LN2_LO[xsb];
            k = 1 - xsb as i32 - xsb as i32;
        } else {
            k = (INVLN2 * x + HALF[xsb]) as i32;
            let t = k as f64;
            hi = x - t * LN2_HI[0];
            lo = t * LN2_LO[0];
        }
        x = hi - lo;
    } else if hx < 0x3e300000 {
        if HUGE + x > 1.0 {
            return 1.0 + x;
        }
    } else {
        k = 0;
    }

    let t = x * x;
    let twopk = if k >= -1021 {
        from_words(0x3ff00000 + (k << 20), 0)
    } else {
        from_words(0x3ff00000 + ((k + 1000) << 20), 0)
    };
    let c = x - t * (P1 + t * (P2 + t * (P3 + t * (P4 + t * P5))));
    if k == 0 {
        return 1.0 - ((x * c) / (c - 2.0) - x);
    }
    let y = 1.0 - ((lo - (x * c) / (2.0 - c)) - hi);
    if k >= -1021 {
        if k == 1024 {
            return y * 2.0 * f64::from_bits(0x7fe0000000000000);
        }
        return y * twopk;
    }
    y * twopk * TWOM1000
}

/// `Math.log`.
pub fn log(x: f64) -> f64 {
    const LN2_HI: f64 = f64::from_bits(0x3FE62E42FEE00000);
    const LN2_LO: f64 = f64::from_bits(0x3DEA39EF35793C76);
    const LG1: f64 = f64::from_bits(0x3FE5555555555593);
    const LG2: f64 = f64::from_bits(0x3FD999999997FA04);
    const LG3: f64 = f64::from_bits(0x3FD2492494229359);
    const LG4: f64 = f64::from_bits(0x3FCC71C51D8E78AF);
    const LG5: f64 = f64::from_bits(0x3FC7466496CB03DE);
    const LG6: f64 = f64::from_bits(0x3FC39A09D078C69F);
    const LG7: f64 = f64::from_bits(0x3FC2F112DF3E5244);

    let mut x = x;
    let mut hx = high(x);
    let lx = low(x);
    let mut k: i32 = 0;
    if hx < 0x00100000 {
        if ((hx & 0x7fffffff) as u32 | lx) == 0 {
            return f64::NEG_INFINITY;
        }
        if hx < 0 {
            return f64::NAN;
        }
        k -= 54;
        x *= TWO54;
        hx = high(x);
    }
    if hx >= 0x7ff00000 {
        return x + x;
    }
    if hx == 0x3ff00000 && lx == 0 {
        return 0.0;
    }
    k += (hx >> 20) - 1023;
    hx &= 0x000fffff;
    let i = (hx + 0x95f64) & 0x100000;
    x = with_high(x, hx | (i ^ 0x3ff00000));
    k += i >> 20;
    let f = x - 1.0;
    if (0x000fffff & (2 + hx)) < 3 {
        if f == 0.0 {
            if k == 0 {
                return 0.0;
            }
            let dk = k as f64;
            return dk * LN2_HI + dk * LN2_LO;
        }
        let r = f * f * (0.5 - f64::from_bits(0x3FD5555555555555) * f);
        if k == 0 {
            return f - r;
        }
        let dk = k as f64;
        return dk * LN2_HI - ((r - dk * LN2_LO) - f);
    }
    let s = f / (2.0 + f);
    let dk = k as f64;
    let z = s * s;
    let mut i = hx - 0x6147a;
    let w = z * z;
    let j = 0x6b851 - hx;
    let t1 = w * (LG2 + w * (LG4 + w * LG6));
    let t2 = z * (LG1 + w * (LG3 + w * (LG5 + w * LG7)));
    i |= j;
    let r = t2 + t1;
    if i > 0 {
        let hfsq = 0.5 * f * f;
        if k == 0 {
            return f - (hfsq - s * (hfsq + r));
        }
        return dk * LN2_HI - ((hfsq - (s * (hfsq + r) + dk * LN2_LO)) - f);
    }
    if k == 0 {
        return f - s * (f - r);
    }
    dk * LN2_HI - ((s * (f - r) - dk * LN2_LO) - f)
}

/// `Math.pow` and `**`, as V8 computes them since Node 24 (its `use_std_math_pow`, on by
/// default): the platform C library's `pow`, which `f64::powf` calls too, behind ECMAScript's
/// special cases and the shortcuts V8's optimizing compilers take. So a result is exact against
/// Node on the same platform only: Windows' UCRT and Linux's glibc differ in the last bit now and
/// then, and so do Node's games on them.
pub fn pow(x: f64, y: f64) -> f64 {
    if y.is_nan() || (y.is_infinite() && (x == 1.0 || x == -1.0)) {
        return f64::NAN;
    }
    if y == 2.0 {
        return x * x;
    }
    if y == 0.5 {
        if x.is_infinite() {
            return f64::INFINITY;
        }
        return (x + 0.0).sqrt();
    }
    x.powf(y)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn base36_matches_js() {
        assert_eq!(to_base36(0), "0");
        assert_eq!(to_base36(35), "z");
        assert_eq!(to_base36(36), "10");
        assert_eq!(to_base36(u32::MAX), "1z141z3");
    }
}
