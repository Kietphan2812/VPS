param([string]$targetTitle = "HiepSiOnline_400", [string]$keys = "1")

# Thêm định nghĩa Win32 API gửi phím ngầm (không cướp focus cửa sổ web)
try {
    Add-Type -TypeDefinition @"
    using System;
    using System.Runtime.InteropServices;
    using System.Text;

    public class Win32KeySender {
        [DllImport("user32.dll")]
        public static extern bool PostMessage(IntPtr hWnd, uint Msg, IntPtr wParam, IntPtr lParam);
        
        [DllImport("user32.dll")]
        public static extern bool EnumWindows(EnumWindowsProc lpEnumFunc, IntPtr lParam);
        
        [DllImport("user32.dll")]
        public static extern int GetWindowText(IntPtr hWnd, StringBuilder lpString, int nMaxCount);
        
        [DllImport("user32.dll")]
        public static extern bool IsWindowVisible(IntPtr hWnd);

        public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);

        public static IntPtr FindWindowByTitle(string[] hints) {
            IntPtr result = IntPtr.Zero;
            EnumWindows(delegate(IntPtr hWnd, IntPtr lParam) {
                if (IsWindowVisible(hWnd)) {
                    StringBuilder sb = new StringBuilder(256);
                    GetWindowText(hWnd, sb, 256);
                    string title = sb.ToString();
                    if (!string.IsNullOrEmpty(title)) {
                        foreach (string h in hints) {
                            if (!string.IsNullOrEmpty(h) && title.IndexOf(h, StringComparison.OrdinalIgnoreCase) >= 0) {
                                result = hWnd;
                                return false;
                            }
                        }
                    }
                }
                return true;
            }, IntPtr.Zero);
            return result;
        }

        public static void SendKeyBackground(IntPtr hWnd, string key) {
            uint WM_KEYDOWN = 0x0100;
            uint WM_KEYUP = 0x0101;
            uint WM_CHAR = 0x0102;
            int vk = 0;
            if (key == "{ENTER}" || key == "ENTER") vk = 0x0D;
            else if (key == " ") vk = 0x20;
            else if (key.Length == 1) vk = (int)char.ToUpper(key[0]);

            if (vk > 0) {
                PostMessage(hWnd, WM_KEYDOWN, (IntPtr)vk, IntPtr.Zero);
                PostMessage(hWnd, WM_CHAR, (IntPtr)vk, IntPtr.Zero);
                System.Threading.Thread.Sleep(25);
                PostMessage(hWnd, WM_KEYUP, (IntPtr)vk, IntPtr.Zero);
            }
        }
    }
"@ -ErrorAction SilentlyContinue
} catch {}

$candidates = @($targetTitle, "HiepSiOnline_400", "HiepSiOnline", "Knight Age", "Knight", "HSO")
$hwnd = [IntPtr]::Zero
try {
    $hwnd = [Win32KeySender]::FindWindowByTitle($candidates)
} catch {}

if ($hwnd -ne [IntPtr]::Zero) {
    [Win32KeySender]::SendKeyBackground($hwnd, $keys)
    Write-Output "OK: Background sent $keys"
} else {
    # Fallback chỉ kích hoạt khi không tìm thấy handle
    $wshell = New-Object -ComObject WScript.Shell
    foreach ($t in $candidates) {
        if ($t -and $wshell.AppActivate($t)) { break }
    }
    Start-Sleep -Milliseconds 30
    if ($keys) {
        $wshell.SendKeys($keys)
        Write-Output "OK: Sent $keys"
    }
}

