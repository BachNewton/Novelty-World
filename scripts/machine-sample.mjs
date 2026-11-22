/**
 * What the hardware is really doing, and whose it is, for the machine's recorder.
 * Windows' own counters are read by one long-lived PowerShell, a sample per line it
 * is sent: GPU memory and engine time per adapter and process, and the process table
 * with each process's CPU time. The one thing they can't see is how busy the eGPU is:
 * CUDA in WSL reads 0% there while nvidia-smi reads 50%, so the recorder asks that
 * beside them. Memory stays theirs, since nvidia-smi names no process's under WDDM.
 *
 * Everything below the script is pure: readings in, a sample out.
 */

/**
 * Ends when its stdin closes, so it can't outlive the recorder. A sample is lines of
 * tab-separated fields by their first letter, then `end`:
 *   a  luid, vendor id                       an adapter
 *   m  luid, bytes                           an adapter's dedicated memory in use
 *   g  instance, bytes                       a process's dedicated memory on an adapter
 *   u  instance, running time (100 ns)       a process's time on one of an adapter's engines
 *   p  pid, parent, created, CPU time (100 ns), name, role
 * A process's role is b (a Playwright browser), g (its GPU process) or r (a renderer).
 * The script has no double quotes, which Windows PowerShell's -Command would eat.
 */
export const COUNTERS_SCRIPT = `
$ErrorActionPreference = 'Stop'
$tab = [string][char]9
$memory = New-Object Diagnostics.PerformanceCounterCategory 'GPU Adapter Memory'
$held = New-Object Diagnostics.PerformanceCounterCategory 'GPU Process Memory'
$engine = New-Object Diagnostics.PerformanceCounterCategory 'GPU Engine'
$query = 'SELECT ProcessId,ParentProcessId,Name,CommandLine,CreationDate,KernelModeTime,UserModeTime FROM Win32_Process'
while ($null -ne [Console]::In.ReadLine()) {
  $out = New-Object Text.StringBuilder
  foreach ($key in Get-ChildItem 'HKLM:\\SOFTWARE\\Microsoft\\DirectX') {
    $luid = $key.GetValue('AdapterLuid'); $vendor = $key.GetValue('VendorId')
    if ($null -ne $luid -and $null -ne $vendor) { [void]$out.AppendLine(('a', $luid, $vendor) -join $tab) }
  }
  $use = $memory.ReadCategory()['Dedicated Usage']
  if ($null -ne $use) { foreach ($i in $use.Values) { [void]$out.AppendLine(('m', $i.InstanceName, $i.RawValue) -join $tab) } }
  $use = $held.ReadCategory()['Dedicated Usage']
  if ($null -ne $use) { foreach ($i in $use.Values) { if ($i.RawValue -gt 0) { [void]$out.AppendLine(('g', $i.InstanceName, $i.RawValue) -join $tab) } } }
  $use = $engine.ReadCategory()['Utilization Percentage']
  if ($null -ne $use) { foreach ($i in $use.Values) { if ($i.RawValue -gt 0) { [void]$out.AppendLine(('u', $i.InstanceName, $i.RawValue) -join $tab) } } }
  foreach ($p in Get-CimInstance -Query $query) {
    $role = '-'
    $line = [string]$p.CommandLine
    if ($line -match 'ms-playwright|playwright_chromiumdev_profile') {
      if ($line -notmatch '--type=') { $role = 'b' } elseif ($line -match '--type=gpu-process') { $role = 'g' } elseif ($line -match '--type=renderer') { $role = 'r' }
    } elseif ($line -match '--type=renderer' -and $p.Name -match '^chrom') { $role = 'r' }
    $born = 0
    if ($null -ne $p.CreationDate) { $born = $p.CreationDate.ToFileTimeUtc() }
    [void]$out.AppendLine(('p', $p.ProcessId, $p.ParentProcessId, $born, ([long]$p.KernelModeTime + [long]$p.UserModeTime), $p.Name, $role) -join $tab)
  }
  [void]$out.Append('end')
  [Console]::Out.WriteLine($out.ToString())
  [Console]::Out.Flush()
}
`;

const VENDORS = { 4098: "radeon", 4318: "egpu" };
const MIB = 1024 * 1024;

/** The adapter in a counter's instance name, as the decimal LUID the registry writes. */
const luidOf = (instance) => {
  const found = /luid_0x([0-9a-f]+)_0x([0-9a-f]+)/i.exec(instance);
  return found === null ? "" : String((BigInt(`0x${found[1]}`) << 32n) + BigInt(`0x${found[2]}`));
};
const pidOf = (instance) => Number(/^pid_(\d+)/.exec(instance)?.[1]);

/** One sample's lines as readings. */
export function parseCounters(lines) {
  const gpus = new Map();
  const readings = { adapters: { radeon: 0, egpu: 0 }, held: [], engines: new Map(), processes: new Map() };
  for (const line of lines) {
    const [type, ...fields] = line.split("\t");
    // The adapters come first; one that isn't either GPU (the software renderer) is left out.
    if (type === "a" && fields[1] in VENDORS) gpus.set(fields[0], VENDORS[fields[1]]);
    else if (type === "p") {
      const [pid, parent, born, time, name, role] = fields;
      readings.processes.set(Number(pid), { pid: Number(pid), parent: Number(parent), born: Number(born), time: Number(time), name, role });
    } else if (type === "m" || type === "g" || type === "u") {
      const [instance, value] = fields;
      const gpu = gpus.get(luidOf(instance));
      if (gpu === undefined) continue;
      if (type === "m") readings.adapters[gpu] += Number(value) / MIB;
      if (type === "g") readings.held.push({ gpu, pid: pidOf(instance), mib: Number(value) / MIB });
      if (type === "u") readings.engines.set(instance, { gpu, engine: instance.replace(/^pid_\d+_/, ""), time: Number(value) });
    }
  }
  return readings;
}

/** A GPU process holding less than this isn't drawing: the software renderer's holds a few MiB. */
const DRAWING_MIB = 20;
/** What a process holds of the eGPU before it's worth naming as no run's. */
const UNCLAIMED_MIB = 300;
/** The WSL virtual machine, which every process inside it is counted as. */
const WSL = /^(?:vmwp|vmmem)/i;

/**
 * The pages a browser has open, from its renderers. Measured with known pages, in one
 * context and apart: the headless shell runs one for each, and full Chromium keeps a spare.
 */
const pagesOf = (browser, renderers) => Math.max(1, /headless-shell/i.test(browser) ? renderers : renderers - 1);

/**
 * The machine between two readings, `seconds` apart: `cores` busy of all, each GPU's
 * use, each running run's share, and the GPU work no run accounts for. A process is
 * a run's when it descends from the run's slot. WSL's processes can't be traced, so
 * they are the running `wsl` run's (the one claiming the eGPU, where several are).
 */
export function measure({ before, after, seconds, cores, runs, egpuBusy = null }) {
  const { processes } = after;
  const running = runs.filter((run) => run.state === "running");
  const bySlot = new Map(running.map((run) => [run.pid, run]));
  const viaWsl = running.filter((run) => /\bwsl(?:\.exe)?\b/i.test(run.command));
  const wslRun = viaWsl.find((run) => run.egpu > 0) ?? viaWsl[0];
  const use = new Map(running.map((run) => [run.id, { cores: 0, pages: 0, egpu: 0 }]));

  const ownerOf = (pid) => {
    let at = processes.get(pid);
    if (at !== undefined && WSL.test(at.name)) return wslRun;
    const seen = new Set();
    while (at !== undefined && !seen.has(at.pid)) {
      if (bySlot.has(at.pid)) return bySlot.get(at.pid);
      seen.add(at.pid);
      const parent = processes.get(at.parent);
      // A parent younger than its child is another process that was given the dead parent's id.
      at = parent !== undefined && parent.born <= at.born ? parent : undefined;
    }
    return undefined;
  };

  for (const process of processes.values()) {
    const last = before.processes.get(process.pid);
    const since = last !== undefined && last.born === process.born ? last.time : 0;
    const busy = (process.time - since) / 1e7 / seconds;
    if (process.pid === 0 || busy <= 0) continue;
    const owner = ownerOf(process.pid);
    if (owner !== undefined) use.get(owner.id).cores += busy;
  }

  const gpus = {
    radeon: { mib: Math.round(after.adapters.radeon), busy: 0, pages: 0 },
    egpu: { mib: Math.round(after.adapters.egpu), busy: egpuBusy },
  };
  const engines = new Map();
  for (const [instance, { gpu, engine, time }] of after.engines) {
    if (gpu !== "radeon") continue;
    // An instance first seen now began within the interval.
    const spent = time - (before.engines.get(instance)?.time ?? 0);
    engines.set(engine, (engines.get(engine) ?? 0) + Math.max(0, spent));
  }
  for (const time of engines.values()) {
    gpus.radeon.busy = Math.max(gpus.radeon.busy, Math.min(100, Math.round((time / 1e7 / seconds) * 100)));
  }

  const unclaimed = [];
  for (const { gpu, pid, mib } of after.held) {
    const process = processes.get(pid);
    if (process === undefined) continue;
    const owner = ownerOf(pid);
    if (gpu === "egpu") {
      if (owner !== undefined) use.get(owner.id).egpu += mib;
      if (mib >= UNCLAIMED_MIB && !(owner?.egpu > 0)) unclaimed.push({ gpu, name: process.name, mib: Math.round(mib), id: owner?.id });
    } else if (process.role === "g" && mib >= DRAWING_MIB) {
      // The Radeon is counted in the pages of the browsers drawing on it: the owner's own Chrome and the desktop
      // draw there too, and aren't the budget's.
      let renderers = 0;
      for (const each of processes.values()) if (each.role === "r" && each.parent === process.parent) renderers++;
      const pages = pagesOf(process.name, renderers);
      gpus.radeon.pages += pages;
      if (owner !== undefined) use.get(owner.id).pages += pages;
      if (!(owner?.radeon > 0)) unclaimed.push({ gpu, name: process.name, pages, id: owner?.id });
    }
  }

  const round = (value) => Math.round(value * 10) / 10;
  return {
    cores: round(cores),
    ...gpus,
    use: Object.fromEntries([...use].map(([id, each]) => [id, [round(each.cores), each.pages, Math.round(each.egpu)]])),
    unclaimed,
  };
}
