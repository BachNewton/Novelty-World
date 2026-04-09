export default async function globalTeardown() {
  const pid = process.env.WS_RELAY_PID;
  if (pid) {
    try {
      process.kill(Number(pid));
    } catch {
      // Process may already be gone
    }
  }
}
