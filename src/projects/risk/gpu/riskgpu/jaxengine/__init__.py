"""The Risk engine in JAX (`ideas/tpu.md`, "The engine on the TPU"): the PyTorch engine's rules in
32-bit arithmetic, jit-compiled over a fixed batch, so a TPU can play games. It sits beside the
PyTorch engine and never replaces it."""
