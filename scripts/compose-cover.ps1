# Monta autor, título y subtítulo (Outfit) sobre una ilustración de portada.
# Uso: powershell -File compose-cover.ps1 -Image ilus.png -Out portada.jpg -Author "Sun Tzu" -Title "EL ARTE|DE LA GUERRA" -Subtitle "Vencer sin combatir" -Shadow "#1E1E1E"
param(
  [Parameter(Mandatory)] [string]$Image,
  [Parameter(Mandatory)] [string]$Out,
  [Parameter(Mandatory)] [string]$Author,
  [Parameter(Mandatory)] [string]$Title,      # líneas separadas por |
  [string]$Subtitle = '',
  [string]$Shadow = '#F28C28',
  [string]$Ink = '#FFFFFF',
  [double]$TextZone = 0.41                   # fracción superior reservada al texto
)
Add-Type -AssemblyName System.Drawing

function Color($hex, $alpha = 255) {
  $c = [System.Drawing.ColorTranslator]::FromHtml($hex)
  [System.Drawing.Color]::FromArgb($alpha, $c.R, $c.G, $c.B)
}

$src = [System.Drawing.Image]::FromFile((Resolve-Path $Image))
$W = $src.Width; $H = $src.Height
$bmp = New-Object System.Drawing.Bitmap $W, $H
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.SmoothingMode = 'AntiAlias'
$g.InterpolationMode = 'HighQualityBicubic'
$g.TextRenderingHint = 'AntiAlias'
$g.DrawImage($src, 0, 0, $W, $H)

$s = $W / 1024.0
$margin = [int](78 * $s)
$maxW = $W - 2 * $margin
$fmt = [System.Drawing.StringFormat]::GenericTypographic

function MeasurePath($text, $family, $style, $size) {
  $p = New-Object System.Drawing.Drawing2D.GraphicsPath; $p.FillMode = "Winding"
  $p.AddString($text, $family, [int]$style, $size, (New-Object System.Drawing.PointF 0, 0), $fmt)
  $b = $p.GetBounds(); $p.Dispose(); return $b
}

$fBlack = New-Object System.Drawing.FontFamily 'Outfit Black'
$fMed = New-Object System.Drawing.FontFamily 'Outfit Medium'
$fReg = New-Object System.Drawing.FontFamily 'Outfit'

# Autor
$y = 84 * $s
$authorSize = 34 * $s
$p = New-Object System.Drawing.Drawing2D.GraphicsPath; $p.FillMode = "Winding"
$p.AddString($Author, $fMed, 0, $authorSize, (New-Object System.Drawing.PointF $margin, $y), $fmt)
$g.FillPath((New-Object System.Drawing.SolidBrush (Color $Ink 235)), $p)
$y += $authorSize * 1.55

# Título: tamaño máximo que cabe en ancho y en la zona reservada
$lines = $Title.Split('|')
$subSize = 30 * $s
$zoneBottom = $H * $TextZone
$subBlock = if ($Subtitle) { $subSize * 1.9 } else { 0 }
$size = 132 * $s
while ($size -gt 40) {
  $lineH = $size * 0.98
  $widest = ($lines | ForEach-Object { (MeasurePath $_ $fBlack 0 $size).Width } | Measure-Object -Maximum).Maximum
  if ($widest -le $maxW -and ($y + $lineH * $lines.Count + $subBlock) -le $zoneBottom) { break }
  $size -= 2
}
$lineH = $size * 0.98
$off = [Math]::Max(4, $size * 0.055)
$shadowBrush = New-Object System.Drawing.SolidBrush (Color $Shadow)
$inkBrush = New-Object System.Drawing.SolidBrush (Color $Ink)
foreach ($line in $lines) {
  $b = MeasurePath $line $fBlack 0 $size
  $x = $margin - $b.X
  $p = New-Object System.Drawing.Drawing2D.GraphicsPath; $p.FillMode = "Winding"
  $p.AddString($line, $fBlack, 0, $size, (New-Object System.Drawing.PointF ($x + $off), ($y + $off)), $fmt)
  $g.FillPath($shadowBrush, $p)
  $p = New-Object System.Drawing.Drawing2D.GraphicsPath; $p.FillMode = "Winding"
  $p.AddString($line, $fBlack, 0, $size, (New-Object System.Drawing.PointF $x, $y), $fmt)
  $g.FillPath($inkBrush, $p)
  $y += $lineH
}

# Subtítulo
if ($Subtitle) {
  $y += $subSize * 1.0
  $p = New-Object System.Drawing.Drawing2D.GraphicsPath; $p.FillMode = "Winding"
  $p.AddString($Subtitle, $fReg, 0, $subSize, (New-Object System.Drawing.PointF $margin, $y), $fmt)
  $g.FillPath((New-Object System.Drawing.SolidBrush (Color $Ink 230)), $p)
}

$g.Dispose(); $src.Dispose()
$outFull = [System.IO.Path]::GetFullPath($Out)
New-Item -ItemType Directory -Force (Split-Path $outFull) | Out-Null
if ($outFull -match '\.png$') {
  $bmp.Save($outFull, [System.Drawing.Imaging.ImageFormat]::Png)
} else {
  $enc = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object { $_.MimeType -eq 'image/jpeg' }
  $ps = New-Object System.Drawing.Imaging.EncoderParameters 1
  $ps.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter ([System.Drawing.Imaging.Encoder]::Quality), 92L
  $bmp.Save($outFull, $enc, $ps)
}
$bmp.Dispose()
Write-Output "OK $outFull ($([int]$size)px)"
