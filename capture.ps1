param([string]$outFile = "screen.jpg")
Add-Type -AssemblyName System.Drawing, System.Windows.Forms
$b = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds
$bmp = New-Object System.Drawing.Bitmap($b.Width, $b.Height)
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.CopyFromScreen($b.Location, [System.Drawing.Point]::Empty, $b.Size)
$bmp.Save($outFile, [System.Drawing.Imaging.ImageFormat]::Jpeg)
$bmp.Dispose()
$g.Dispose()
Write-Output "OK: $outFile"
