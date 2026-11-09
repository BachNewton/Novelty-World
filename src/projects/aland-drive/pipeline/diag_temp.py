"""TEMPORARY: where an Actions build and a local Linux build part. Removed before landing."""
import hashlib, os, sys, numpy as np
import ground, laser, sources
from grid import tile_from_name
def h(a): return hashlib.sha256(np.ascontiguousarray(a).tobytes()).hexdigest()[:12]
tile = tile_from_name("L2343A")
print("cpu", next((l.split(":")[1].strip() for l in open("/proc/cpuinfo") if l.startswith("model name")), "?"), "avx512f" in open("/proc/cpuinfo").read())
print("env", os.environ.get("NPY_DISABLE_CPU_FEATURES"), os.environ.get("OPENBLAS_CORETYPE"))
raw = ground.read_photo(tile); print("photo", raw.dtype, raw.shape, h(raw))
print("graded", h(ground.graded(raw)))
with np.load(sources.msnfi_path(tile)) as kept: print("msnfi", {k: h(kept[k]) for k in kept.files})
above = laser.above_ground(tile); print("above", above.dtype, h(above))
