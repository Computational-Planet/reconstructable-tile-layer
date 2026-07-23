param(
  [Parameter(Mandatory = $true)][int]$RootPid,
  [Parameter(Mandatory = $true)][string]$OutputPath,
  [Parameter(Mandatory = $true)][string]$StopPath
)

$ErrorActionPreference = "Stop"
$edgeProcessIds = @($RootPid)
$lastTreeRefresh = [DateTimeOffset]::MinValue

while (-not (Test-Path -LiteralPath $StopPath)) {
  $capturedAt = [DateTimeOffset]::UtcNow
  try {
    if (($capturedAt - $lastTreeRefresh).TotalSeconds -ge 5) {
      $allEdgeProcesses = @(Get-CimInstance Win32_Process -Filter "Name='msedge.exe'")
      $ids = [System.Collections.Generic.HashSet[int]]::new()
      $queue = [System.Collections.Generic.Queue[int]]::new()
      $queue.Enqueue($RootPid)
      while ($queue.Count -gt 0) {
        $parent = $queue.Dequeue()
        if (-not $ids.Add($parent)) { continue }
        foreach ($child in $allEdgeProcesses | Where-Object { $_.ParentProcessId -eq $parent }) {
          $queue.Enqueue([int]$child.ProcessId)
        }
      }
      $edgeProcessIds = @($ids)
      $lastTreeRefresh = $capturedAt
    }

    $pidLookup = [System.Collections.Generic.HashSet[int]]::new()
    foreach ($edgeProcessId in $edgeProcessIds) { [void]$pidLookup.Add($edgeProcessId) }
    $engineRows = @(Get-CimInstance Win32_PerfFormattedData_GPUPerformanceCounters_GPUEngine)
    $memoryRows = @(Get-CimInstance Win32_PerfFormattedData_GPUPerformanceCounters_GPUProcessMemory)
    $sample = [ordered]@{
      epochMs = $capturedAt.ToUnixTimeMilliseconds()
      utc = $capturedAt.ToString("o")
      engineRows = @($engineRows | Where-Object {
        $_.Name -match "pid_(\d+)" -and $pidLookup.Contains([int]$Matches[1])
      } | ForEach-Object {
        [ordered]@{
          name = $_.Name
          utilizationPercentage = [double]$_.UtilizationPercentage
        }
      })
      memoryRows = @($memoryRows | Where-Object {
        $_.Name -match "pid_(\d+)" -and $pidLookup.Contains([int]$Matches[1])
      } | ForEach-Object {
        [ordered]@{
          name = $_.Name
          dedicatedBytes = [long]$_.DedicatedUsage
          sharedBytes = [long]$_.SharedUsage
        }
      })
    }
  } catch {
    $sample = [ordered]@{
      epochMs = $capturedAt.ToUnixTimeMilliseconds()
      utc = $capturedAt.ToString("o")
      error = $_.Exception.Message
      engineRows = @()
      memoryRows = @()
    }
  }
  $sample | ConvertTo-Json -Depth 6 -Compress | Out-File -LiteralPath $OutputPath -Append -Encoding utf8
  Start-Sleep -Milliseconds 200
}
