import { NextResponse } from "next/server";
import { MsEdgeTTS, OUTPUT_FORMAT } from "msedge-tts";
import { IDEAS } from "@/projects/finland-catalogue/ideas";
import { TOPICS } from "@/projects/finland-catalogue/topics";

// Microsoft's "Edge Read Aloud" TTS endpoint — same neural voices as Azure
// Cognitive Services, no API key required (the trustedClientToken is
// hardcoded into Edge and into the msedge-tts library). Undocumented but
// widely used and stable in practice.
//
// Multilingual neural voice — auto-detects language at the phrase level
// and pronounces 70+ languages natively. For Finland Catalogue this means
// English narration with Finnish place names sit naturally side-by-side,
// and years/numbers read in English without manual workarounds. Swap to
// en-US-AndrewMultilingualNeural (male) or any other *MultilingualNeural
// voice to change.
const VOICE = "en-US-AvaMultilingualNeural";

// msedge-tts interpolates input into its SSML template without escaping,
// so any `&`, `<`, or `>` in the source text (e.g. "H&M", "fish & chips")
// breaks Edge's XML parser and the server silently returns zero audio
// bytes. Escape ourselves before handing it to the library.
function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const kind = url.searchParams.get("kind");
  const slug = url.searchParams.get("slug");

  if (kind !== "idea" && kind !== "topic") {
    return NextResponse.json(
      { error: "kind must be 'idea' or 'topic'" },
      { status: 400 },
    );
  }
  if (!slug) {
    return NextResponse.json({ error: "slug is required" }, { status: 400 });
  }

  const entry =
    kind === "idea"
      ? IDEAS.find((i) => i.slug === slug)
      : TOPICS.find((t) => t.slug === slug);

  if (!entry) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const text = [entry.title, entry.shortDescription, ...entry.longDescription].join(
    "\n\n",
  );

  const tts = new MsEdgeTTS();
  try {
    await tts.setMetadata(VOICE, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);
  } catch (err) {
    tts.close();
    return NextResponse.json(
      {
        error: "tts setup failed",
        detail: err instanceof Error ? err.message : String(err),
      },
      { status: 502 },
    );
  }

  const { audioStream } = tts.toStream(escapeXml(text));

  // Stream Edge's audio chunks straight through to the browser instead of
  // waiting for the full synthesis (~45s for a long topic at ~4-5x real-
  // time). The <audio> element starts playing as soon as the first frames
  // arrive — usually 1-2 seconds after the click.
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      audioStream.on("data", (chunk: Buffer) => {
        controller.enqueue(
          new Uint8Array(chunk.buffer, chunk.byteOffset, chunk.byteLength),
        );
      });
      audioStream.on("end", () => {
        controller.close();
        tts.close();
      });
      audioStream.on("error", (err: Error) => {
        controller.error(err);
        tts.close();
      });
    },
    cancel() {
      audioStream.destroy();
      tts.close();
    },
  });

  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": "audio/mpeg",
      "Cache-Control": "no-store",
    },
  });
}
