# ---------------------------------------------------------------------------
# Abre Margen en el navegador. Reutiliza el servidor de desarrollo si
# ya esta escuchando y, si no, lo arranca en segundo plano y espera a
# que responda antes de abrir la pestana.
# ---------------------------------------------------------------------------
$ErrorActionPreference = 'Stop'

$proyecto = Split-Path -Parent $PSScriptRoot
$puerto = 5178
$url = "http://127.0.0.1:$puerto"

function Test-Puerto {
  param([int]$Puerto)
  # El servidor local se limita al loopback IPv4.
  $destinos = @(
    @{ Direccion = '127.0.0.1'; Familia = [Net.Sockets.AddressFamily]::InterNetwork }
  )
  foreach ($destino in $destinos) {
    try {
      $cliente = New-Object Net.Sockets.TcpClient($destino.Familia)
      $cliente.Connect($destino.Direccion, $Puerto)
      $cliente.Close()
      return $true
    } catch { }
  }
  return $false
}

if (Test-Puerto -Puerto $puerto) {
  Write-Host "El servidor ya estaba en marcha en $url."
} else {
  Write-Host 'Iniciando el servidor del lector...'
  Start-Process -FilePath 'cmd.exe' -WorkingDirectory $proyecto -WindowStyle Hidden `
    -ArgumentList "/c title Servidor Margen & npm run dev -- --port $puerto"

  $limite = (Get-Date).AddSeconds(120)
  while (-not (Test-Puerto -Puerto $puerto)) {
    if ((Get-Date) -gt $limite) {
      Write-Warning "El servidor no respondio en $url. Ejecuta npm run dev en la carpeta del proyecto para ver el error."
      Read-Host 'Pulsa Enter para cerrar'
      exit 1
    }
    Start-Sleep -Milliseconds 700
  }
  Write-Host "Servidor listo en $url."
}

Start-Process $url
