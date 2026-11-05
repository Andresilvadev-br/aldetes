# Real pointer drag through the X server (XTest): python3 xdrag.py x1 y1 x2 y2 [steps]   (x2 == "click" → just click)
import sys, time
from Xlib import X, display
from Xlib.ext import xtest
d = display.Display()
def move(x, y):
    xtest.fake_input(d, X.MotionNotify, x=int(x), y=int(y)); d.sync()
x1, y1 = float(sys.argv[1]), float(sys.argv[2])
move(x1, y1); time.sleep(0.15)
xtest.fake_input(d, X.ButtonPress, 1); d.sync(); time.sleep(0.08)
if sys.argv[3] != 'click':
    x2, y2 = float(sys.argv[3]), float(sys.argv[4])
    n = int(sys.argv[5]) if len(sys.argv) > 5 else 20
    for i in range(1, n + 1):
        move(x1 + (x2 - x1) * i / n, y1 + (y2 - y1) * i / n); time.sleep(0.016)
    time.sleep(0.1)
xtest.fake_input(d, X.ButtonRelease, 1); d.sync(); time.sleep(0.1)
