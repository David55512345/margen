# Genera scripts/lector.ico: cuadrado verde redondeado con un libro abierto en
# blanco, para que el acceso directo del escritorio no use el icono de consola.
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

$lado = 256
$mapa = New-Object System.Drawing.Bitmap($lado, $lado)
$g = [System.Drawing.Graphics]::FromImage($mapa)
$g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias

$verde = [System.Drawing.Color]::FromArgb(255, 47, 111, 94)
$papel = [System.Drawing.Color]::White

# Fondo redondeado.
$radio = 56
$fondo = New-Object System.Drawing.Drawing2D.GraphicsPath
$fondo.AddArc(0, 0, $radio, $radio, 180, 90)
$fondo.AddArc($lado - $radio, 0, $radio, $radio, 270, 90)
$fondo.AddArc($lado - $radio, $lado - $radio, $radio, $radio, 0, 90)
$fondo.AddArc(0, $lado - $radio, $radio, $radio, 90, 90)
$fondo.CloseFigure()
$g.FillPath((New-Object System.Drawing.SolidBrush($verde)), $fondo)

# Paginas del libro abierto: dos hojas simetricas con el lomo en el centro.
$pincel = New-Object System.Drawing.SolidBrush($papel)
$izquierda = New-Object System.Drawing.Drawing2D.GraphicsPath
$izquierda.AddCurve(@(
  (New-Object System.Drawing.PointF(52, 86)),
  (New-Object System.Drawing.PointF(88, 72)),
  (New-Object System.Drawing.PointF(122, 78))), 0.4)
$izquierda.AddLine(122, 78, 122, 190)
$izquierda.AddCurve(@(
  (New-Object System.Drawing.PointF(122, 190)),
  (New-Object System.Drawing.PointF(88, 182)),
  (New-Object System.Drawing.PointF(52, 194))), 0.4)
$izquierda.CloseFigure()
$g.FillPath($pincel, $izquierda)

$derecha = New-Object System.Drawing.Drawing2D.GraphicsPath
$derecha.AddCurve(@(
  (New-Object System.Drawing.PointF(204, 86)),
  (New-Object System.Drawing.PointF(168, 72)),
  (New-Object System.Drawing.PointF(134, 78))), 0.4)
$derecha.AddLine(134, 78, 134, 190)
$derecha.AddCurve(@(
  (New-Object System.Drawing.PointF(134, 190)),
  (New-Object System.Drawing.PointF(168, 182)),
  (New-Object System.Drawing.PointF(204, 194))), 0.4)
$derecha.CloseFigure()
$g.FillPath($pincel, $derecha)

$g.Dispose()

# Un ICO puede envolver un PNG directamente: 6 bytes de cabecera + 16 de entrada.
$memoria = New-Object System.IO.MemoryStream
$mapa.Save($memoria, [System.Drawing.Imaging.ImageFormat]::Png)
$png = $memoria.ToArray()
$memoria.Dispose()
$mapa.Dispose()

$salida = Join-Path $PSScriptRoot 'lector.ico'
$flujo = [System.IO.File]::Create($salida)
$escritor = New-Object System.IO.BinaryWriter($flujo)
$escritor.Write([UInt16]0)   # reservado
$escritor.Write([UInt16]1)   # tipo: icono
$escritor.Write([UInt16]1)   # numero de imagenes
$escritor.Write([Byte]0)     # ancho 0 = 256
$escritor.Write([Byte]0)     # alto 0 = 256
$escritor.Write([Byte]0)     # colores en paleta
$escritor.Write([Byte]0)     # reservado
$escritor.Write([UInt16]1)   # planos
$escritor.Write([UInt16]32)  # bits por pixel
$escritor.Write([UInt32]$png.Length)
$escritor.Write([UInt32]22)  # desplazamiento de la imagen
$escritor.Write($png)
$escritor.Flush()
$escritor.Dispose()
$flujo.Dispose()

Write-Host "Icono generado: $salida ($($png.Length) bytes PNG)"
