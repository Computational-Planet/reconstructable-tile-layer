param(
  [Parameter(Mandatory = $true)][int]$RootPid,
  [Parameter(Mandatory = $true)][string]$OutputPath,
  [Parameter(Mandatory = $true)][string]$StopPath,
  [int]$IntervalMilliseconds = 200
)

$ErrorActionPreference = "Stop"
$logicalProcessorCount = [Environment]::ProcessorCount

function Get-ProcessTreeIds {
  param([int]$ParentRootPid, [object[]]$AllProcesses)

  $ids = [System.Collections.Generic.HashSet[int]]::new()
  $queue = [System.Collections.Generic.Queue[int]]::new()
  $queue.Enqueue($ParentRootPid)
  while ($queue.Count -gt 0) {
    $parent = $queue.Dequeue()
    if (-not $ids.Add($parent)) { continue }
    foreach ($child in $AllProcesses | Where-Object { $_.ParentProcessId -eq $parent }) {
      $queue.Enqueue([int]$child.ProcessId)
    }
  }
  return @($ids)
}

function Get-EdgeProcessType {
  param([string]$CommandLine, [int]$ProcessId, [int]$BrowserPid)

  if ($ProcessId -eq $BrowserPid) { return "browser" }
  if ($CommandLine -match "--type=([^ ]+)") { return $Matches[1] }
  return "child"
}

$cimProcesses = @()
$processIds = @($RootPid)
$lastTreeRefresh = [DateTimeOffset]::MinValue
while (-not (Test-Path -LiteralPath $StopPath)) {
  $capturedAt = [DateTimeOffset]::UtcNow
  if (($capturedAt - $lastTreeRefresh).TotalSeconds -ge 5) {
    $cimProcesses = @(Get-CimInstance Win32_Process -Filter "Name='msedge.exe'")
    $processIds = @(Get-ProcessTreeIds -ParentRootPid $RootPid -AllProcesses $cimProcesses)
    $lastTreeRefresh = $capturedAt
  }
  $processRecords = @()
  $privateBytes = [ordered]@{}
  $workingSetBytes = [ordered]@{}

  foreach ($processId in $processIds) {
    $cim = $cimProcesses | Where-Object { $_.ProcessId -eq $processId } | Select-Object -First 1
    $process = Get-Process -Id $processId -ErrorAction SilentlyContinue
    if (-not $process) { continue }
    $type = Get-EdgeProcessType -CommandLine ([string]$cim.CommandLine) -ProcessId $processId -BrowserPid $RootPid
    $key = "${type}:${processId}"
    $privateBytes[$key] = [long]$process.PrivateMemorySize64
    $workingSetBytes[$key] = [long]$process.WorkingSet64
    $processRecords += [ordered]@{
      pid = $processId
      parentPid = [int]$cim.ParentProcessId
      type = $type
      cpuSeconds = [double]$process.TotalProcessorTime.TotalSeconds
      privateBytes = [long]$process.PrivateMemorySize64
      workingSetBytes = [long]$process.WorkingSet64
    }
  }

  $sample = [ordered]@{
    epochMs = $capturedAt.ToUnixTimeMilliseconds()
    utc = $capturedAt.ToString("o")
    logicalProcessorCount = $logicalProcessorCount
    processIds = $processIds
    processes = $processRecords
    processPrivateBytes = $privateBytes
    processWorkingSetBytes = $workingSetBytes
  }
  $sample | ConvertTo-Json -Depth 8 -Compress | Out-File -LiteralPath $OutputPath -Append -Encoding utf8
  Start-Sleep -Milliseconds $IntervalMilliseconds
}
