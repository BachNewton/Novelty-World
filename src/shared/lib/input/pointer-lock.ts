/**
 * Lock the pointer to `element` for mouse-look, asking for raw mouse input.
 * Chrome on Windows otherwise reads locked movement through the OS cursor and
 * now and then reports one movement far larger than the hand made, which jolts
 * the camera; raw input doesn't, and it drops the OS's mouse acceleration too.
 * A browser that can't give raw input refuses the option with
 * NotSupportedError, and gets a plain lock instead. Any other refusal (no user
 * gesture, Chrome's pause after Esc) is the caller's to handle.
 */
export async function lockPointer(element: Element): Promise<void> {
  try {
    await element.requestPointerLock({ unadjustedMovement: true });
  } catch (error) {
    if (!(error instanceof DOMException && error.name === "NotSupportedError")) throw error;
    await element.requestPointerLock();
  }
}
