"use client";

import { Component, type ReactNode } from "react";
import { BETRAYAL_THEME } from "../components/theme";
import { ErrorBox } from "../components/error-box";

// Diagnostic: the house view fails on the owner's phone but not in headless
// Chromium, and production hides the error. This shows a thrown error, or the
// GPU dropping the WebGL context, with the device's WebGL limits so the cause
// can be found; remove it once it is.

function webglLimits(): string {
  const gl = document.createElement("canvas").getContext("webgl2");
  if (!gl) return "WebGL2: unavailable";
  const debug = gl.getExtension("WEBGL_debug_renderer_info");
  const limits = {
    renderer: debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER),
    maxTextureUnits: gl.getParameter(gl.MAX_TEXTURE_IMAGE_UNITS),
    maxFragmentUniformVectors: gl.getParameter(gl.MAX_FRAGMENT_UNIFORM_VECTORS),
    maxVertexUniformVectors: gl.getParameter(gl.MAX_VERTEX_UNIFORM_VECTORS),
    maxTextureSize: gl.getParameter(gl.MAX_TEXTURE_SIZE),
    maxRenderbufferSize: gl.getParameter(gl.MAX_RENDERBUFFER_SIZE),
    devicePixelRatio: window.devicePixelRatio,
    screen: `${window.innerWidth}x${window.innerHeight}`,
    userAgent: navigator.userAgent,
  };
  return Object.entries(limits)
    .map(([key, value]) => `${key}: ${String(value)}`)
    .join("\n");
}

export class CrashReport extends Component<{ children: ReactNode }, { report: string | null }> {
  state: { report: string | null } = { report: null };

  componentDidMount() {
    // The canvas fires it and it doesn't bubble, so listen in the capture phase.
    window.addEventListener("webglcontextlost", this.contextLost, true);
  }

  componentWillUnmount() {
    window.removeEventListener("webglcontextlost", this.contextLost, true);
  }

  contextLost = (event: Event) => {
    const message = event instanceof WebGLContextEvent ? event.statusMessage : "";
    this.setState({ report: `The GPU dropped the WebGL context (webglcontextlost)${message ? `: ${message}` : ""}

${webglLimits()}` });
  };

  static getDerivedStateFromError(error: unknown) {
    const detail = error instanceof Error ? `${error.message}\n\n${error.stack ?? ""}` : String(error);
    return { report: `${detail}\n\n${webglLimits()}` };
  }

  render() {
    if (this.state.report === null) return this.props.children;
    return (
      <div style={BETRAYAL_THEME} className="fixed inset-0 overflow-auto bg-(--bt-bg) p-3 text-(--bt-ink)">
        <p className="mb-2 text-sm">The 3D view crashed. Screenshot this for Claude:</p>
        <ErrorBox message={this.state.report} />
      </div>
    );
  }
}
