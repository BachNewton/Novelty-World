"""Breeze TTS 2, loaded once: the one place the rest of tools/ reaches the model."""
import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path.home() / ".venvs" / "nana-breeze-src"))

from breeze_infer.runtime import (  # noqa: E402
    load_runtime, resolve_device, set_all_seeds, update_generation_config_for_breeze,
)
from breeze_infer.templates import get_template, prepare_inputs, select_template_name  # noqa: E402
from models.fast_streaming import FastBreezeStreamingRuntime, FastStreamingConfig  # noqa: E402

tokenizer, model, audio_tokenizer = load_runtime(
    Path.home() / "models" / "breeze-tts-2", device=resolve_device(),
    attn_implementation="eager",
)
update_generation_config_for_breeze(model)
runtime = FastBreezeStreamingRuntime(
    model, audio_tokenizer,
    FastStreamingConfig(max_new_tokens=1500, max_seq_len=2048, fast_all=False,
                        repetition_penalty=1.1),
    tokenizer=tokenizer,
)
sample_rate = runtime.sample_rate


def generate(request: dict, cfg: float, seed: int) -> np.ndarray:
    set_all_seeds(seed)
    inputs = prepare_inputs(
        tokenizer, audio_tokenizer, model, [request],
        get_template(select_template_name(request)),
        guidance_scale=cfg, guidance_scale_ref=None, guidance_scale_ins=None,
    )
    chunks = runtime.iter_audio_chunks(inputs, request_id=request["id"], seed=seed)
    return np.concatenate([c.audio for c in chunks]).astype(np.float32)
