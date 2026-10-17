param([switch]$StopServer, [switch]$SmokeTest)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms
if ($SmokeTest) {
  $probe = New-Object Windows.Forms.Form
  $probe.ShowInTaskbar = $false
  $probe.Opacity = 0
  $probe.Show()
  [Windows.Forms.Application]::DoEvents()
  $probe.Dispose()
  Write-Output 'PASS: Agenda native startup.'
  exit 0
}
$appRoot = Split-Path -Parent $PSScriptRoot
$dataRoot = Join-Path $appRoot '.data'
$pidPath = Join-Path $dataRoot 'local-server.json'
Set-Location -LiteralPath $appRoot
try {
  if ($StopServer) {
    if (Test-Path -LiteralPath $pidPath) {
      $saved = Get-Content -LiteralPath $pidPath -Raw | ConvertFrom-Json
      $running = Get-CimInstance Win32_Process -Filter ("ProcessId = " + [int]$saved.id)
      $expectedScript = Join-Path $appRoot 'node_modules\next\dist\bin\next'
      if ($saved.script -eq $expectedScript -and $running -and $running.CommandLine.IndexOf($saved.script, [StringComparison]::OrdinalIgnoreCase) -ge 0) {
        & taskkill.exe /PID ([string]$saved.id) /T /F | Out-Null
        Remove-Item -LiteralPath $pidPath
        [Windows.Forms.MessageBox]::Show('Servidor local encerrado. Seus dados continuam salvos.', 'Agenda Free') | Out-Null
      } else { [Windows.Forms.MessageBox]::Show('O servidor registrado nao esta mais executando. Nenhum outro processo foi encerrado.', 'Agenda Free') | Out-Null }
    }
    exit
  }
  $version = & node --version
  if ($LASTEXITCODE -ne 0 -or $version -notmatch '^v24\.') { throw 'Instale Node.js 24 pelo site nodejs.org e tente novamente.' }
  New-Item -ItemType Directory -Force -Path $dataRoot | Out-Null
  $note = New-Object Windows.Forms.Form
  $note.Text = 'Agenda Free - preparando'
  $note.Size = New-Object Drawing.Size(440,140)
  $note.StartPosition = 'CenterScreen'
  $label = New-Object Windows.Forms.Label
  $label.Text = 'Preparando a agenda. Na primeira vez, o download pode demorar alguns minutos. Aguarde...'
  $label.SetBounds(20,20,390,70)
  $note.Controls.Add($label)
  $note.Show()
  [Windows.Forms.Application]::DoEvents()
  if (-not (Test-Path -LiteralPath (Join-Path $appRoot 'node_modules\next\package.json'))) {
    & npm.cmd ci --ignore-scripts *> (Join-Path $dataRoot 'installation.log')
    if ($LASTEXITCODE -ne 0) { throw 'Falha ao baixar dependencias. Confira a internet e .data/installation.log.' }
  }
  $setupJson = & node --env-file-if-exists=.env.local scripts/setup.mts --json 2> (Join-Path $dataRoot 'setup.log')
  if ($LASTEXITCODE -ne 0) { throw 'Falha ao preparar banco. Confira .data/setup.log.' }
  $setup = ($setupJson | Out-String) | ConvertFrom-Json
  $uri = [Uri]$setup.url
  if ($uri.Host -notin @('localhost','127.0.0.1')) { throw 'Este iniciador e somente local. Para servidor publico, siga o manual de publicacao.' }
  $origin = $uri.GetLeftPart([UriPartial]::Authority)
  $port = $uri.Port
  $nextScript = Join-Path $appRoot 'node_modules\next\dist\bin\next'
  $existing = $null
  try { $existing = Invoke-RestMethod -Uri ($origin + '/api/health') -TimeoutSec 2 } catch {}
  if ($existing) {
    if ($existing.application -ne 'agenda-free' -or -not (Test-Path -LiteralPath $pidPath)) { throw 'Esta porta ja e usada por uma instancia fora deste iniciador. Confira o servidor ou escolha APP_URL local com outra porta.' }
    $saved = Get-Content -LiteralPath $pidPath -Raw | ConvertFrom-Json
    $running = Get-CimInstance Win32_Process -Filter ("ProcessId = " + [int]$saved.id)
    if ($saved.script -ne $nextScript -or -not $running -or $running.CommandLine.IndexOf($nextScript, [StringComparison]::OrdinalIgnoreCase) -lt 0) { throw 'A instancia nessa porta nao corresponde a esta pasta. Nenhum processo foi alterado.' }
  }
  if (-not $existing) {
    $listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback,$port)
    try { $listener.Start() } catch { throw 'A porta esta ocupada por outro aplicativo. Encerre-o ou ajuste APP_URL em .env.local.' } finally { $listener.Stop() }
    $nodePath = (Get-Command node).Source
    $nextScript = Join-Path $appRoot 'node_modules\next\dist\bin\next'
    $arguments = @('--env-file-if-exists=.env.local', '"' + $nextScript + '"', 'dev', '--port', [string]$port)
    $process = Start-Process -FilePath $nodePath -ArgumentList $arguments -WorkingDirectory $appRoot -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $dataRoot 'server.log') -RedirectStandardError (Join-Path $dataRoot 'server-error.log')
    @{id=$process.Id;script=$nextScript} | ConvertTo-Json | Set-Content -LiteralPath $pidPath
    for ($i=0; $i -lt 100; $i++) {
      [Windows.Forms.Application]::DoEvents()
      Start-Sleep -Milliseconds 300
      try { $existing = Invoke-RestMethod -Uri ($origin + '/api/health') -TimeoutSec 1; break } catch {}
      if ($process.HasExited) { throw 'O servidor encerrou. Confira .data/server-error.log.' }
    }
  }
  if (-not $existing -or $existing.application -ne 'agenda-free') { throw 'Nao foi possivel confirmar a Agenda Free nesta porta.' }
  $note.Close()
  Start-Process $setup.url
} catch {
  if ($note) { $note.Close() }
  [Windows.Forms.MessageBox]::Show($_.Exception.Message,'Agenda Free') | Out-Null
  exit 1
}
