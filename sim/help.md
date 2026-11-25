# ROV Pool help {#top}

A practice pool for a scout-style ROV: drive it with the keyboard or the on-screen switch box, pick up rings with the nose or the claw,
and say hello to the fish. It runs entirely in your browser. You can also drive it from a **micro:bit or Raspberry Pi Pico** plugged in with USB.

- [Driving](#driving)
- [The pool](#pool)
- [Micro:bit and Pico](#microcontrollers)
- [Page options and settings](#options)
- [For teachers](#teachers)

## Driving {#driving}

The **switch box** (top right) imitates the controller most scout ROVs use: three momentary switches that each give full reverse, off, or full forward.
Let go and a switch springs back to off, just like the real thing.

| Switch | Drives | Keys | With the mouse |
|---|---|---|---|
| **red** | thruster 1 (the left one) | `1` reverse, `2` forward | hold the left half / right half |
| **green** | thruster 2 (the right one) | left arrow reverse, right arrow forward | hold the left half / right half |
| **up / down** | both vertical thrusters | down arrow, up arrow | hold the bottom half / top half |

Click the page once so it has keyboard focus. If red and green both go forward the ROV drives straight; if they differ, it turns.

**H-bridge only (`H`).** The badge under the switches shows the mode. With **all keys** (the start-up mode) the extra keys below also work, at 80% power.
Press `H` (or click the badge) and it becomes **H-bridge only**: just the three switches work, like the real controller.

| Extra key | Does |
|---|---|
| `W` / `S` | both side thrusters forward / reverse |
| `A` / `D` | turn left / right |
| `R` or Space / `F` or Shift | both vertical thrusters up / down |
| `I` / `K` | tilt the nose up / down (front thruster up and rear down, or the reverse) |
| `Z` / `C` | the left / right thruster only |

Other keys: `[` and `]` close and open the claw gradually, `T` switches between the nose and the claw, `B` changes the buoyancy,
`V` (or a double-click) resets the camera view, `X` lets go of every key.

Buttons: **Orbit** (drag to turn the view, scroll to zoom), **Follow** (a chase camera), **Top**, **Buoyancy**, **Tool**, **Water FX**
(refraction and ripples), **Quality**, **Reset** (back to the start). The little window is the ROV's own camera.

## The pool {#pool}

- The pool is L-shaped: a **deep end** (2 m deep) and a **shallow end** (1 m deep) off to one side at the far end. The step is a wall to a ROV that is too deep to go over it.
- **Rings** stand on the floor. Drive the **nose** through a ring and rise: the ring hangs from the nose, and the ROV tips a little under its weight (twice as much for two rings). Bump a ring with any part of the ROV and it is pushed, and spun by where you hit it.
  With the **claw**, open it, put the jaws round the side of the ring, then close it to grip. Open it to let go.
- **Buoyancy** (`B`): **floats** (a long piece of dark pipe insulation on each of the top four sticks: it rises to the surface by itself),
  **neutral** (a few short pieces: it hovers) or **sinks** (no foam: it needs thrust to stay up).
- A **fish** lives here. It is shy: it never lets the ROV catch it. Sit still for a few seconds and it may come to look into your camera.
- The ROV bobs when it breaks the surface and bounces gently off the floor. The walls stop it, and it slides along them.

## Micro:bit and Pico {#microcontrollers}

This page can be driven by a micro:bit or Pico over USB, with no extra software. The board talks in plain text lines, one message per line.
These are the same lines used elsewhere in this project, so a program can move between the pool and other projects.

> Needs **Chrome or Edge** (Chromebooks are fine). It does not work in Firefox or Safari, and a school-managed Chromebook can have it switched off.
> The page must be opened from `https://` or `http://localhost`.

### Connect {#connect}

1. Flash your program on the board (the micro:bit Python editor, or Thonny for a Pico). Leave it plugged in with USB.
2. **Close** any serial window (the editor's, Thonny, other browser tabs). Only one program can use the USB port at a time.
3. Click **Connect micro:bit / Pico** on the pool page and choose the board (Shift-click lists every serial device).
4. The button says **Device connected** and a small log shows the lines going each way.
5. Unplug the cable, or click the button again, and **all four thrusters stop**. A port the page used before is reopened automatically next time.

The link is 115200 baud, and the keyboard and the board work together: for each thruster, the last new value wins.

### The lines {#protocol}

| Prefix | Example | Direction | Meaning |
|---|---|---|---|
| `p:` | `p:t1,0.5` | board to pool | **publish** a value on a channel (here: thruster 1 at half power) |
| `s:` | `s:depth` | board to pool | **subscribe**: "send me this reading" |
| `m:` | `m:depth,0.82` | pool to board | a **message**: the reading you asked for |

Channel names are lower case letters, digits and `_`. The value is everything after the first comma. Anything that is not a valid line
(boot messages, a `print` for debugging, half a line) is ignored, so it is safe to `print` other things.

**Commands the board can send:**

| Line | Meaning |
|---|---|
| `p:t1,0.5` | thruster 1, the **red** one (left), from -1 to 1 |
| `p:t2,0.5` | thruster 2, the **green** one (right), from -1 to 1 |
| `p:t3,0.5` | thruster 3, the front up/down thruster (+ is up) |
| `p:t4,0.5` | thruster 4, the rear up/down thruster (+ is up) |
| `p:claw,1` | the claw servo: 0 closed to 1 fully open |
| `p:tool,nose` | choose `nose` or `claw` |
| `p:reset,1` | back to the start position |

Values above 1 or below -1 are clamped. A thruster keeps its last value until you send a new one.

**Readings the pool can send** (only after the board sends `s:<name>`; repeat the `s:` line every few seconds, it lapses after 15 s):

| Subscribe with | You receive | Meaning |
|---|---|---|
| `s:depth` | `m:depth,0.82` | metres below the surface |
| `s:heading` | `m:heading,90` | degrees, 0 = toward the far end of the pool, counter-clockwise is positive |
| `s:pitch` | `m:pitch,-1.5` | degrees, nose **down** is positive |
| `s:accel` | `m:accel,0.00,0.00,9.81` | accelerometer in m/s², with gravity (x forward, y left, z up) |
| `s:speed` | `m:speed,0.12` | metres per second |

### Rules that keep it safe {#rules}

- The pool sends at most one line at a time, about 16 a second, each at most 32 bytes, and only changed values (plus a reminder every second).
- A micro:bit has a small receive buffer: read the serial input often, and throw away anything you do not need.
- When the link breaks, the thrusters stop. A board that simply **stops talking** (its program froze) does *not* stop them, as with a real controller: send `p:t1,0` yourself.

### A first program {#first-program}

The micro:bit prints lines; the pool does the rest. Button A drives forward, button B reverses.
(These examples are written to match the protocol but have **not been tried on real hardware yet**: tell us what you find.)

```python
from microbit import button_a, button_b, sleep

while True:
    power = 0
    if button_a.is_pressed():
        power = 1
    if button_b.is_pressed():
        power = -1
    print("p:t1," + str(power))     # red thruster
    print("p:t2," + str(power))     # green thruster
    sleep(100)
```

Read the depth back (ask for it, then look at each line that arrives):

```python
from microbit import uart, display, sleep, running_time

uart.init(115200)
last_ask = -5000
while True:
    if running_time() - last_ask > 5000:
        print("s:depth")                  # ask again every few seconds
        last_ask = running_time()
    line = uart.readline()
    if line:
        text = str(line, "utf-8").strip()
        if text.startswith("m:depth,"):
            depth = float(text.split(",")[1])
            display.show(int(depth * 5))  # a bigger number the deeper it is
    sleep(20)
```

On a Pico (MicroPython) the same lines go through `print()` and `sys.stdin`; the repository has ready-made examples in
`nodes/rov_sim/examples/`: `microbit_tilt.py` (steer by tilting the micro:bit) and `pico_throttle.py` (a dial for power, a button to dive).

A micro:bit that talks over the **radio** can use the same lines through a gateway micro:bit plugged into the computer
(`nodes/microbit/gateway.py`): keep each line at 32 bytes or less.

### If it does not work {#troubleshooting}

| What you see | What to try |
|---|---|
| The button explains that Web Serial is missing | use Chrome or Edge, and `https://` or `localhost` |
| "Could not open the port: close MakeCode, Thonny..." | close the other program or tab that has the port, unplug and replug |
| The board does not appear in the list | use a data USB cable (not charge-only); Shift-click to list every device |
| Nothing moves | look at the log: do the `p:` lines arrive? Is the value between -1 and 1? Is a program still `print`ing text that is not a line? |
| It moves, then stops by itself | the cable came loose, or the board reset: the thrusters stop when the link breaks |

## Page options and settings {#options}

Add these to the page address, for example `?tool=claw&quality=low`.

| Option | Does |
|---|---|
| `tool=nose` or `tool=claw` | start with this tool (the web version starts with the nose) |
| `buoyancy=positive`, `neutral` or `negative` | start floating, hovering, or sinking |
| `quality=high`, `low`, `lowest` or `auto` | graphics level; **Auto** lowers it by itself if the page runs slowly, and `lowest` hides the ROV camera window |
| `view=orbit`, `follow` or `top` | starting camera |
| `mode=local` or `mode=server` | force the built-in simulation, or the Python server |
| `selftest` | the page drives itself for a few seconds and writes PASS or FAIL in its title |

The **Quality** and **H-bridge only** choices are remembered by your browser.

## For teachers {#teachers}

- There are two versions of the same pool. This **browser version** needs nothing installed. The **Python version** (`nodes/rov_sim/`) also publishes ROS 2 topics (`/sim/t1` ...)
  so students can write ROS 2 code; the same page is its display. The physics are kept the same by tests that compare the two.
- To drive the Python/ROS version from a micro:bit or Pico, use the bridge in `nodes/serial_bridge/` instead of the Connect button.
- The full protocol is on this page; the project's `docs/PROTOCOL.md` describes the same lines for the ROS bridge.
- The page uses no outside web sites (everything is bundled), so a school web filter does not break it.

[Back to the pool](index.html)
