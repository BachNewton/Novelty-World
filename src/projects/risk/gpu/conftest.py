"""Puts `gpu/` on the path so the tests import `riskgpu` from any working directory."""

import os
import sys

import torch

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

# The tests' batches are tiny: a thread pool's overhead outweighs its work, many times over on a
# loaded machine.
torch.set_num_threads(1)
