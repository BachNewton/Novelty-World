# Network Test Ideas

## Adaptive Throughput Rounds (Cloudflare-style)

The current throughput test floods the DataChannel for a fixed 5-second window and
measures what the receiver got. This works on fast connections but breaks on slower
ones: the framework queues sends when the DataChannel buffer is full, and the queue
can take longer to drain than the timeout allows.

Cloudflare's speed test (`@cloudflare/speedtest`) avoids this entirely with a
different approach worth adopting:

### How Cloudflare does it

1. **Discrete rounds with increasing payload sizes** — not a fixed-time flood.
   Default download sequence: 100KB x1, 100KB x9, 1MB x8, 10MB x6, 25MB x4, etc.
   Upload: 100KB x8, 1MB x6, 10MB x4, 25MB x4, 50MB x3.

2. **One transfer at a time.** Send a known-size payload, measure how long it takes,
   move on. No concurrent sends, no buffer management headaches.

3. **Early termination.** After each round, check the minimum request duration. If
   any request took over 1 second, stop — don't attempt larger sizes. A slow
   connection stops at 1MB; a fast connection ramps to 250MB.

4. **90th percentile.** Final bandwidth is the 90th percentile across all qualifying
   measurements (excluding requests shorter than 10ms to filter out handshake noise).

### Adapting for WebRTC

For the DataChannel throughput test, the same model works:

- Send a chunk of known size to a peer.
- Peer ACKs with bytes received and elapsed time.
- Measure the round-trip. If it was fast, send a bigger chunk next time.
- Stop when a round takes over ~1 second.
- Compute throughput from the collected measurements.

This eliminates the unbounded send queue problem, adapts naturally to any connection
speed, and finishes in a reasonable time without generous timeouts.

### References

- Cloudflare speed test source: `@cloudflare/speedtest` npm package
- Blog/docs: speed.cloudflare.com
