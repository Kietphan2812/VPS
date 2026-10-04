$apps = Get-Process | Where-Object { $_.MainWindowTitle -ne "" } | ForEach-Object {
    [PSCustomObject]@{
        id = $_.Id
        name = $_.ProcessName
        title = $_.MainWindowTitle
    }
}
if ($apps) {
    $apps | ConvertTo-Json -Compress
} else {
    Write-Output "[]"
}
