import ctypes

user32 = ctypes.windll.user32
windows = []

def enum_windows_callback(hwnd, extra):
    if user32.IsWindowVisible(hwnd):
        length = user32.GetWindowTextLengthW(hwnd)
        if length > 0:
            buff = ctypes.create_unicode_buffer(length + 1)
            user32.GetWindowTextW(hwnd, buff, length + 1)
            title = buff.value.strip()
            if title and title != "Program Manager":
                windows.append((hwnd, title))
    return True

EnumWindowsProc = ctypes.WINFUNCTYPE(ctypes.c_bool, ctypes.c_int, ctypes.c_int)
user32.EnumWindows(EnumWindowsProc(enum_windows_callback), 0)

print(f"Total active windows found: {len(windows)}")
for h, t in windows:
    print(f"HWND: {h} | Title: {t}")
