param(
    [string]$outFile = "screen.jpg",
    [string]$windowTitle = ""
)

Add-Type -AssemblyName System.Drawing, System.Windows.Forms

$bounds = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds

if ($windowTitle -ne "") {
    $code = @"
using System;
using System.Text;
using System.Runtime.InteropServices;
using System.Drawing;

public class Win32 {
    public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);

    [DllImport("user32.dll")]
    public static extern bool EnumWindows(EnumWindowsProc enumProc, IntPtr lParam);

    [DllImport("user32.dll", CharSet = CharSet.Auto)]
    public static extern int GetWindowText(IntPtr hWnd, StringBuilder strText, int maxCount);

    [DllImport("user32.dll")]
    [return: MarshalAs(UnmanagedType.Bool)]
    public static extern bool GetWindowRect(IntPtr hWnd, out RECT lpRect);

    [StructLayout(LayoutKind.Sequential)]
    public struct RECT {
        public int Left;
        public int Top;
        public int Right;
        public int Bottom;
    }

    public static IntPtr FindWindowBySubstring(string substring) {
        IntPtr found = IntPtr.Zero;
        EnumWindows(delegate(IntPtr wnd, IntPtr param) {
            StringBuilder title = new StringBuilder(256);
            if (GetWindowText(wnd, title, 256) > 0) {
                if (title.ToString().ToLower().Contains(substring.ToLower())) {
                    found = wnd;
                    return false; // Stop enumerating
                }
            }
            return true;
        }, IntPtr.Zero);
        return found;
    }
}
"@
    try {
        Add-Type -TypeDefinition $code -Language CSharp -ErrorAction SilentlyContinue
    } catch {}

    $hwnd = [Win32]::FindWindowBySubstring($windowTitle)
    if ($hwnd -ne [IntPtr]::Zero) {
        $rect = New-Object Win32+RECT
        if ([Win32]::GetWindowRect($hwnd, [ref]$rect)) {
            $bounds = [System.Drawing.Rectangle]::FromLTRB($rect.Left, $rect.Top, $rect.Right, $rect.Bottom)
        }
    }
}

if ($bounds.Width -le 0 -or $bounds.Height -le 0) {
    $bounds = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds
}

$bmp = New-Object System.Drawing.Bitmap($bounds.Width, $bounds.Height)
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.CopyFromScreen($bounds.Location, [System.Drawing.Point]::Empty, $bounds.Size)
$bmp.Save($outFile, [System.Drawing.Imaging.ImageFormat]::Jpeg)
$bmp.Dispose()
$g.Dispose()
Write-Output "OK: $outFile"
