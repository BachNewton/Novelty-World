<#
.SYNOPSIS
  List the processes that keep a folder in use: those whose working directory
  is inside it, or whose command line names it.

.DESCRIPTION
  Windows won't delete a folder some process has as its working directory, and
  has no built-in command that shows another process's working directory, so
  this reads it from each process's own memory. A command that was interrupted
  can leave its processes running in the folder it started in.

  64-bit processes only, and only those this user may read; anything else is
  skipped.

.EXAMPLE
  .\.claude\skills\worktree\holders.ps1 -Path .claude\worktrees\portrait-bg
#>
[CmdletBinding()]
param([Parameter(Mandatory = $true)][string]$Path)
$ErrorActionPreference = 'Stop'

$folder = [IO.Path]::GetFullPath($Path).TrimEnd('\') + '\'

if (-not ('ProcessCwd' -as [type])) {
  Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
using System.Text;
public static class ProcessCwd {
  [StructLayout(LayoutKind.Sequential)]
  struct BasicInfo { public IntPtr ExitStatus; public IntPtr Peb; public IntPtr Affinity; public IntPtr Priority; public IntPtr Pid; public IntPtr ParentPid; }
  [DllImport("ntdll.dll")] static extern int NtQueryInformationProcess(IntPtr process, int infoClass, ref BasicInfo info, int size, out int returned);
  [DllImport("kernel32.dll")] static extern IntPtr OpenProcess(int access, bool inherit, int pid);
  [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr handle);
  [DllImport("kernel32.dll")] static extern bool ReadProcessMemory(IntPtr process, IntPtr address, byte[] buffer, int size, out IntPtr read);

  static byte[] Read(IntPtr process, IntPtr address, int size) {
    var buffer = new byte[size];
    IntPtr read;
    return ReadProcessMemory(process, address, buffer, size, out read) ? buffer : null;
  }

  // The PEB's ProcessParameters (at 0x20) holds CurrentDirectory's path (a UNICODE_STRING at 0x38).
  public static string Of(int pid) {
    IntPtr process = OpenProcess(0x0410, false, pid); // PROCESS_QUERY_INFORMATION | PROCESS_VM_READ
    if (process == IntPtr.Zero) return null;
    try {
      var info = new BasicInfo();
      int returned;
      if (NtQueryInformationProcess(process, 0, ref info, Marshal.SizeOf(info), out returned) != 0) return null;
      byte[] parameters = Read(process, info.Peb + 0x20, 8);
      if (parameters == null) return null;
      byte[] cwd = Read(process, (IntPtr)BitConverter.ToInt64(parameters, 0) + 0x38, 16);
      if (cwd == null) return null;
      byte[] text = Read(process, (IntPtr)BitConverter.ToInt64(cwd, 8), BitConverter.ToUInt16(cwd, 0));
      return text == null ? null : Encoding.Unicode.GetString(text);
    } finally { CloseHandle(process); }
  }
}
"@
}

$inside = { param($p) $p -and ($p.TrimEnd('\') + '\').StartsWith($folder, [StringComparison]::OrdinalIgnoreCase) }

Get-CimInstance Win32_Process | ForEach-Object {
  $cwd = [ProcessCwd]::Of([int]$_.ProcessId)
  $named = $_.CommandLine -and $_.CommandLine.IndexOf($folder.TrimEnd('\'), [StringComparison]::OrdinalIgnoreCase) -ge 0
  if ((& $inside $cwd) -or $named) {
    [pscustomobject]@{
      Pid     = $_.ProcessId
      Parent  = $_.ParentProcessId
      Name    = $_.Name
      Started = $_.CreationDate
      Why     = if (& $inside $cwd) { 'working directory' } else { 'command line' }
      Command = if ($_.CommandLine) { $_.CommandLine.Substring(0, [Math]::Min(120, $_.CommandLine.Length)) } else { '' }
    }
  }
}
