"""Performs a whole scene with VibeVoice, on the CPU: every line hears the ones before it.

usage: vibevoice_render.py <scene.txt> <out.wav> <voice1.wav> [voice2.wav ...]
       [--model microsoft/VibeVoice-1.5B] [--steps 10] [--cfg 1.3] [--dtype float32]

VibeVoice-Large is aoi-ot/VibeVoice-Large (a mirror: Microsoft withdrew its own) and
runs with --dtype bfloat16.

The scene is "Speaker N: text" lines; Speaker N is cloned from the Nth voice clip, at
most four. Decoding is greedy (no sampling), so the same scene renders the same way
every time. Runs in WSL from ~/.venvs/vibevoice, on the community code in
~/vibevoice-src (Microsoft took its own down).
"""

import argparse
import time

import torch
from vibevoice.modular.modeling_vibevoice_inference import (
    VibeVoiceForConditionalGenerationInference,
)
from vibevoice.processor.vibevoice_processor import VibeVoiceProcessor


def cast_inputs(method, dtype):
    def wrapped(*args, **kwargs):
        cast = lambda v: v.to(dtype) if torch.is_tensor(v) and v.is_floating_point() else v
        return method(*[cast(a) for a in args], **{k: cast(v) for k, v in kwargs.items()})
    return wrapped


def use_fp32_sound(model):
    """Keeps the language model in bfloat16 but runs every part that makes or reads sound
    (the diffusion head, both speech tokenizers) in float32, casting at the hand-offs.
    Diagnoses whether 16-bit arithmetic on the CPU is what garbles Large's audio."""
    m = model.model
    lm_dtype = next(m.language_model.parameters()).dtype
    for tokenizer in (m.acoustic_tokenizer, m.semantic_tokenizer):
        tokenizer.float()
        for name in ("encode", "decode"):  # the semantic tokenizer only encodes
            if hasattr(tokenizer, name):
                setattr(tokenizer, name, cast_inputs(getattr(tokenizer, name), torch.float32))
    m.prediction_head.float()
    for connector in (m.acoustic_connector, m.semantic_connector):
        connector.forward = cast_inputs(connector.forward, lm_dtype)

    @torch.no_grad()
    def sample_speech_tokens(condition, neg_condition, cfg_scale=3.0):
        m.noise_scheduler.set_timesteps(model.ddpm_inference_steps)
        condition = torch.cat([condition, neg_condition], dim=0).float()
        speech = torch.randn(condition.shape[0], model.config.acoustic_vae_dim)
        for t in m.noise_scheduler.timesteps:
            half = speech[: len(speech) // 2]
            combined = torch.cat([half, half], dim=0)
            eps = m.prediction_head(combined, t.repeat(combined.shape[0]).to(combined), condition=condition)
            cond_eps, uncond_eps = torch.split(eps, len(eps) // 2, dim=0)
            half_eps = uncond_eps + cfg_scale * (cond_eps - uncond_eps)
            speech = m.noise_scheduler.step(torch.cat([half_eps, half_eps], dim=0), t, speech).prev_sample
        return speech[: len(speech) // 2]

    model.sample_speech_tokens = sample_speech_tokens


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("scene")
    ap.add_argument("out")
    ap.add_argument("voices", nargs="+")
    ap.add_argument("--model", default="microsoft/VibeVoice-1.5B")
    ap.add_argument("--steps", type=int, default=10)
    ap.add_argument("--cfg", type=float, default=1.3)
    ap.add_argument("--threads", type=int, default=4)
    # Large is stored in bfloat16; loading it at float32 would double it past WSL's memory.
    ap.add_argument("--dtype", choices=["float32", "bfloat16"], default="float32")
    ap.add_argument("--fp32-sound", action="store_true")
    args = ap.parse_args()

    torch.set_num_threads(args.threads)
    with open(args.scene, encoding="utf-8") as f:
        script = "\n".join(line.strip() for line in f if line.strip())

    processor = VibeVoiceProcessor.from_pretrained(args.model)
    model = VibeVoiceForConditionalGenerationInference.from_pretrained(
        args.model, torch_dtype=getattr(torch, args.dtype), device_map="cpu", attn_implementation="sdpa"
    )
    model.eval()
    model.set_ddpm_inference_steps(num_steps=args.steps)
    if args.fp32_sound:
        use_fp32_sound(model)

    inputs = processor(
        text=[script],
        voice_samples=[args.voices],
        padding=True,
        return_tensors="pt",
        return_attention_mask=True,
    )
    started = time.perf_counter()
    outputs = model.generate(
        **inputs,
        max_new_tokens=None,
        cfg_scale=args.cfg,
        tokenizer=processor.tokenizer,
        generation_config={"do_sample": False},
        verbose=False,
        is_prefill=True,
    )
    speech = outputs.speech_outputs[0]
    processor.save_audio(speech, output_path=args.out)
    seconds = speech.shape[-1] / 24000
    print(f"{args.out}: {seconds:.0f}s of audio in {time.perf_counter() - started:.0f}s")


if __name__ == "__main__":
    main()
