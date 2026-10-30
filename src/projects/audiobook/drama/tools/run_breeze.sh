#!/usr/bin/env bash
# Runs a Breeze script under a watchdog: usage run_breeze.sh <script.py> <outdir> <story>.
# The eGPU sometimes faults and leaves CUDA hung, so if no new clip or log line appears
# for 4 minutes the process is killed and restarted; the scripts skip finished clips.
# The script must print "all done" when finished.
cd "$(dirname "$0")/.."
SCRIPT=$1; OUT=$2; shift 2; LOG=$OUT/log.txt
mkdir -p "$OUT"
: >"$LOG"
for attempt in $(seq 1 20); do
  rm -f "$OUT"/*.part.wav
  ~/.venvs/nana-breeze/bin/python "$SCRIPT" "$@" >>"$LOG" 2>&1 &
  pid=$!
  progress() { echo "$(ls "$OUT"/*.wav 2>/dev/null | grep -vc part) $(stat -c %s "$LOG")"; }
  last=$(progress); idle=0
  while kill -0 $pid 2>/dev/null; do
    sleep 10
    now=$(progress)
    if [ "$now" != "$last" ]; then last=$now; idle=0; else idle=$((idle + 10)); fi
    if [ $idle -ge 240 ]; then
      echo "no progress for 4 min (GPU hang?), restarting" >>"$LOG"
      kill -9 $pid; break
    fi
  done
  grep -q "all done" "$LOG" && exit 0
done
exit 1
