"""Puts `gpu/` on the path so the tests import `riskgpu` from any working directory."""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
