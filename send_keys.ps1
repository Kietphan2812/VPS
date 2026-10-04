param([string]$targetTitle = "HiepSiOnline_400", [string]$keys = "1")
$wshell = New-Object -ComObject WScript.Shell

# Ưu tiên kích hoạt cửa sổ game thật
$activated = $false
$candidates = @($targetTitle, "HiepSiOnline_400", "HiepSiOnline", "Knight Age", "Knight")

foreach ($t in $candidates) {
    if ($t -and $wshell.AppActivate($t)) {
        $activated = $true
        break
    }
}

Start-Sleep -Milliseconds 40

if ($keys) {
    $wshell.SendKeys($keys)
    Write-Output "OK: Sent $keys to game window"
}
