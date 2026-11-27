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
| `W` or Shift / `S` or Space | both side thrusters forward / reverse |
| `A` / `D` | turn left / right |
| `R` / `F` | both vertical thrusters up / down (the arrow keys up and down do too) |
| `I` / `K` | tilt the nose up / down (front thruster up and rear down, or the reverse) |
| `Z` / `C` | the left / right thruster only |

Other keys: `J` changes how the running water from the wall outlets is drawn (bubbles, tracer streaks, ripple rings, or a mix), `N` drops a new pool ring into the water where the mouse is (move the mouse over the pool first and a message says "Ring dropped"; if there is no message at all, reload the page with Ctrl+Shift+R. It sinks, there can be 10 rings at most, and **Reset** removes the dropped ones), `[` and `]` close and open the claw gradually, `T` switches between the nose and the claw, `B` changes the buoyancy (it is also in **Config**), **Ctrl+`L`**, **Ctrl+`W`** and **Ctrl+`D`** make the pool one step **longer**, **wider** or **deeper** without moving the ROV (the pool can only grow: use **Config** to go back to a small one). Some browsers keep **Ctrl+`W`** for themselves and close the tab instead: **Ctrl+`.`** also makes the pool wider and is safe everywhere,
`V` (or a double-click) resets the camera view, `X` lets go of every key.

The panel at the top left shows the thrusters, the depth, the heading and the **IMU**: how far the ROV is tilted (pitch: nose down is positive; roll: right side down is positive), what the **accelerometer** reads (x forward, y left, z up, in m/s², including gravity: about +9.81 up when it sits still), the same minus gravity, and the **gyro** (how fast it is turning). When the current is on it also shows how fast the water is moving at the ROV.

Buttons: **Orbit** (drag to turn the view, scroll to zoom), **Deck** (you stand on the deck at the edge of the pool nearest the ROV, looking down at it and at what its nose is working on; the wheel zooms; a mission starts here), **Follow** (a chase camera), **Top**, **Current** (turns the water on and off), **Water FX**
(refraction and ripples), **Quality**, **Reset** (back to the start), **Config** (see below), **Help**. The little window is the ROV's own camera.

**Config** opens a dialog. The first box changes the pool **right away**: the front **tool** (nose or claw), the **main pool size** (five sizes: 6 × 3 m, 12 × 3 m, 6 × 6 m, 12 × 6 m, 12 × 9 m; a wide pool has one lane line down the middle of each 3 m lane; the ROV, rings, fish, crabs and the wall outlets go back to the start in the new pool), whether the **water runs** out of the wall outlets and **how it is drawn**, and the red and green **thruster power**. The second box needs a **restart** (press *Restart with these*): the controls mode, the fish, rings, crabs and the camera. The link at the bottom makes the same setup for anyone you send it to, and the address is kept in step with the first box too, so a reload keeps it.

## The pool {#pool}

- The pool is L-shaped: a **deep end** (2 m deep) and a **shallow end** (1 m deep) off to one side at the far end. The step is a wall to a ROV that is too deep to go over it.
- **Rings** stand on the floor. Drive the **nose** through a ring and rise: the ring hangs from the nose, and the ROV tips a little under its weight (twice as much for two rings). Bump a ring with any part of the ROV and it is pushed, and spun by where you hit it.
  With the **claw**, open it, put the jaws round the side of the ring, then close it to grip. Open it to let go.
- **Buoyancy** (`B`, or **Config**): **floats** (a long piece of dark pipe insulation on each of the top four sticks: it rises to the surface by itself),
  **neutral** (a few short pieces: it hovers) or **sinks** (no foam: it needs thrust to stay up).
- **Stairs** are cut into the shallow end's outer wall: three steps, 0.8, 0.6 and 0.4 m deep, up to the deck. They are real: the ROV can drive onto the first one (floating near the surface), and a ring that is dropped or pushed there lies on the step (even on the top one it stays under the water). The crab and the fish stay in the pool itself and keep out of them. A good place for a task to end: "deliver the ring to the stairs".
- A **bigger pool** suits the current. In **Config**, *Main pool size* offers five sizes (it also goes into the address, so a reload or a shared link keeps it); `poollength` and `poolwidth` in the address allow the other combinations. The ROV, rings, fish, crabs and the outlets all go back to the start in the new pool.
- Two round **water outlets** are always in the wall on the shallow-end side, in the middle of the wall, a third and two thirds of the way down. With the *Run the water* box in **Config** (or `current=on`) water runs out of them straight across the pool, as if filling it. It is not very realistic, but it gives you something to fight: a ROV floating at the surface feels a gentle push across the middle of the pool, at the outlets' own depth it is stronger, and within half a metre of an outlet the water is faster than the ROV can swim. It carries a ROV that is just sitting there across the pool, and it **tilts** it: a push from the side heels it over (the *roll* reading), a push on the nose or tail pitches it, and a ROV that is held against the water stays tilted. The IMU shows all of it. Only the ROV and the fish feel it: the fish is carried along a little (it swims against it), rings and the crab are not moved by it.
- A small **green crab** (the 2026 task is to remove this invasive species) crawls sideways on the floor of the shallow end. It scuttles away when the ROV comes close, but it is much slower than the ROV, and if the ROV touches it, it is simply shoved out of the way, like a ring. (Picking it up is a job for later.)
- A **fish** lives here. It is shy: it never lets the ROV catch it. Sit still for a few seconds and it may come to look into your camera.
- The ROV bobs when it breaks the surface and bounces gently off the floor. The walls stop it, and it slides along them.

## The 2026 SCOUT mission {#mission}

Add **`?mission=scout2026`** to the address (or ask for a mission link) and the pool holds the props of the 2026 SCOUT competition instead of the rings. The pool is 6 × 6 m and 2 m deep (the SCOUT class is done in a 2 m pool), the ROV starts at the surface
beside the stairs, and a **10 minute clock** starts with the ROV's first move. A **score board** on the right lists every task with its points and ticks them off (and takes the points back if something
is lost again). When the time is up the clock **does not stop**: it keeps counting, now in negative numbers (overtime), and everything still works. Only the physical tasks are in the simulator (125 points): the paper questions and the float are not.

| Task | What to do | Points |
|---|---|---|
| 1.1 Coral garden | bring 2 basket stars and 2 corals to the deck | 5 each |
| 1.2 Transect | fly the 3.1 m white pipe from one end to the other, staying over it | 10 |
| 2.1 Invasive species | bring 2 green crabs to the deck | 5 each |
| 2.2 Iceberg | press a survey marker onto each of the iceberg's two legs (the Velcro sticks) | 10 each |
| 2.3 Lobster pot | push the red handle round 60 degrees so the buoy is released (5), and it reaches the surface (5) | 10 |
| 2.4 eDNA station | old sensor to the deck (10); new sensor standing in the yellow square, after the old one is out (10); connector in the observatory's port (5) | 25 |
| 3.1 Wind farm | lift the power connector off its stand (10); its wire between the four waypoint posts (10); its Velcro tip in the oil platform port (10) | 30 |

**Everything can be done with just the nose** (the tool normally selected); the claw works too where you choose it (**T**). To pick something up, hold the **nose tip inside its loop, hook or branches** for a moment: it hooks on
and then **hangs from the nose** (so a connector hangs with its tip pointing down, ready to be lowered into a port). To put something down, lower it until it rests and **reverse** (back the nose away): it slides off. Until you do, something resting on the floor or a step is **dragged along** by the nose. **`G` away from the stairs lets go** of what the nose carries (it sinks from where it is, and cannot be picked up again for 2 seconds); the nose can only carry one thing at a time, and the page says so when it is busy. With the claw,
open it around the loop or pipe and close it.

**The deck is the stairs.** Carry things to the stairs (the ROV has to be near the top step, close to the surface) and press **`G`**: the crew takes what the ROV carries and sets it on the deck table beside the stairs, which scores it.
**`Tab`** opens the **inventory**: everything on the deck, including the things that start there (the two survey markers, the new sensor and the eDNA connector). Choose with the arrow keys and **Enter** (or the mouse) and
the crew hangs it on the ROV's nose (or puts it in the open claw). Only at the stairs; **Esc** closes it.

To make it a little easier to see and steer in a simulation, the props are about **1.5 times more forgiving** than the real ones (the catch zones, the targets and the waypoint are a bit bigger). Simplifications: the ROV passes through the frames and the platform (only the pot's handle can be pushed), the wires are drawn lines (the 2 m and 4 m wires are not enforced), and what has stuck (markers, connectors) stays stuck.

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
| `p:t5,0.5` … `p:t8,0.5` | thrusters 5 to 8, only with `thrusters=6` (`t5`, `t6`: up/down, + is up) or `8` (the bottom corners); with 6 or 8 thrusters `t1` to `t4` are the front left, front right, rear left and rear right ones. A thruster the ROV does not have is ignored |
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

**[Set up the pool](index.html?config)** opens a panel (the address option `config`) where you choose everything below, and it gives you a **link** that makes the same setup
for anyone you send it to. Every setting is also a plain option you can add to the page address yourself, for example `?controls=h&rings=2&poollength=2`.

| Option | Does |
|---|---|
| `config` | open the set-up panel |
| `controls=all` | all keys: the three switches and the extra keys |
| `controls=h` | **H-circuit only**: just the three switches work, and `H` no longer changes it (the link decides). Without any `controls` the page also starts in this mode (for the scouts), but `H` can still switch it |
| `controls=h-hidden` | H-circuit only **and every other control hidden**: only the switch box (and the camera window, if there is a camera) is left on the page |
| `fish=on` or `off` | the fish (normally off) |
| `rings=0` to `5` | how many pick-up rings (normally 3) |
| `poollength=1` or `2` | the main pool is 6 m times this long (normally 1, so 6 m; 2 is 12 m) |
| `mission=scout2026` | a **mission** instead of free driving: the 2026 SCOUT competition props are in the pool, with a score board and a 10 minute clock (browser version only; it also starts the pool at 6 × 6 m, 2 m deep, with no rings (the fish and the crab stay) unless the address says otherwise) |
| `pooldepth=2`, `3`, `4` or `6` | how deep the main pool is, in metres (normally 2; the shallow end stays 1 m). Also in **Config** |
| `poolwidth=1`, `2` or `3` | the main pool is 3 m times this wide (normally 1, so 3 m; 3 is 9 m) |
| `speed=0.25` to `4` | the power of the red and green thrusters (normally 1). **1 is the normal speed, half of what these thrusters used to give**; 2 is the old strength. The up/down thrusters do not change |
| `thrusters=3`, `4`, `6` or `8` | how many thrusters the ROV has (normally 4: red, green and two up/down). **3**: one up/down thruster, so no nose trim. **6**: four angled thrusters on the corner posts (`t1` front left, `t2` front right, `t3` rear left, `t4` rear right) that can also slide the ROV sideways (**`Q`** left, **`E`** right), plus two up/down (`t5`, `t6`). **8**: one thruster at each of the cube's 8 corners, just outside it and tilted 45°, the rear ones the mirror images of the front ones (`t1` to `t4` on the top corners, `t5` to `t8` on the bottom ones: front left, front right, rear left, rear right). They can move the ROV every way, including rolling it (**`U`** / **`O`**). The red switch drives the left thrusters, the green one the right ones, up/down all of them (the keys mix them for you) |
| `crabs=0` to `5` | how many green crabs crawl on the shallow end (normally 1; the 2026 scout task has two) |
| `flow=bubbles`, `streaks`, `rings` or `mix` | how the running water is drawn: small bubbles in a narrow plume, thin tracer lines along the flow, ripple rings that expand as they travel out, or rings with a few bubbles (normally `mix`). **`J`** changes it while the page runs. The picture is a little narrower than the real flow: the water moves more gently over a wider area |
| `current=on` or `off` | run the water out of the two outlets in the pool wall on the shallow-end side (the outlets are always there): a current that pushes and tilts the ROV (normally off) |
| `camera=on` or `off` | whether the ROV has a camera: its housing on the model, the camera window, and the fish coming to look into it (normally off) |

Whole numbers (and any number from 0.25 to 4 for `speed`): anything else is rounded and kept inside the limits, and an option the page does not understand is ignored. The shallow end keeps its size
and stays at the far end whatever the main pool size. A bigger pool has coarser water ripples so it still runs on a slow computer.
With the Python server, `controls` and `camera` work the same; the pool, rings, fish, crabs, current and speed are set by the server's own options (`--rings`, `--fish`, `--crabs`, `--current`, `--speed`).

Other options:

| Option | Does |
|---|---|
| `tool=nose` or `tool=claw` | start with this tool (the web version starts with the nose) |
| `buoyancy=positive`, `neutral` or `negative` | start floating, hovering, or sinking |
| `quality=high`, `low`, `lowest` or `auto` | graphics level; **Auto** lowers it by itself if the page runs slowly, and `lowest` hides the ROV camera window |
| `view=orbit`, `follow` or `top` | starting camera |
| `mode=local` or `mode=server` | force the built-in simulation, or the Python server |
| `selftest` | the page drives itself for a few seconds and writes PASS or FAIL in its title |

The **Quality** choice and (when no `controls` option is given) the **H-bridge only** choice are remembered by your browser.

## For teachers {#teachers}

- There are two versions of the same pool. This **browser version** needs nothing installed. The **Python version** (`nodes/rov_sim/`) also publishes ROS 2 topics (`/sim/t1` ...)
  so students can write ROS 2 code; the same page is its display. The physics are kept the same by tests that compare the two.
- To drive the Python/ROS version from a micro:bit or Pico, use the bridge in `nodes/serial_bridge/` instead of the Connect button.
- The full protocol is on this page; the project's `docs/PROTOCOL.md` describes the same lines for the ROS bridge.
- To give students a fixed setup (for example H-circuit only, 2 rings, no fish), open **Set up the pool**, choose, and send them the link it makes.
- The page uses no outside web sites (everything is bundled), so a school web filter does not break it.

[Back to the pool](index.html)
