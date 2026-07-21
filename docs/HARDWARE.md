# Hardware Rebuild Spec

Everything needed to physically recreate the Yondu rover — the audio-controlled
robot Team Yondu demoed at the UMD Capstone Design Expo (Spring 2025).

![Arrow design](images/arrow-design.png)

## Bill of Materials

| Qty | Part | Role |
|----:|------|------|
| 1 | Lafvin 2WD Robotic Kit (chassis, 2 DC gear motors + rear caster, motor driver) | Rover body & drivetrain |
| 1 | Raspberry Pi 4 | Signal processing & decision logic |
| 1 | ESP32 DEV Module | Audio acquisition & Bluetooth transmission |
| 1 | INMP441 I2S MEMS microphone | Audio capture |
| 1 | Arduino UNO | Motor actuation |
| 2 | 5 V / 2 A portable USB battery | Power (one for the Pi + Arduino stack, one for the ESP32 transmitter) |
| 1 | Prototyping board | Solid, replaceable mounting for the INMP441 ↔ ESP32 connection |
| 1 | USB flash drive | Holds `config.json` so behavior can be re-mapped without touching the Pi |
| — | Hookup wire, solder | Keep wire runs short — long unsoldered jumpers added measurable electrical noise |

The system splits into two halves:

- **Transmitter ("the fin")** — INMP441 + ESP32, worn/held near the sound source.
- **Receiver (the rover)** — Raspberry Pi 4 + Arduino UNO + motors on the Lafvin chassis.

## Wiring

### INMP441 → ESP32 (I2S)

| INMP441 pin | ESP32 pin |
|-------------|-----------|
| SCK (serial clock) | GPIO 32 |
| WS (word select / LR clock) | GPIO 25 |
| SD (serial data) | GPIO 33 |
| L/R | GND (left channel) |
| VDD | 3V3 |
| GND | GND |

Solder these connections through the prototyping board. In testing, reducing
wire length and soldering (instead of jumper wires) noticeably reduced the
electrical noise floor.

### Arduino UNO → motor driver (Lafvin 2WD)

| Signal | Arduino pin |
|--------|-------------|
| Left motor PWM (`Lpwm_pin`) | 5 |
| Right motor PWM (`Rpwm_pin`) | 6 |
| Left motor forward (`pinLF`) | 2 |
| Left motor backward (`pinLB`) | 4 |
| Right motor forward (`pinRF`) | 7 |
| Right motor backward (`pinRB`) | 8 |

### Inter-device links

| Link | Transport |
|------|-----------|
| ESP32 → Raspberry Pi | Bluetooth serial (`/dev/rfcomm0`, 115200 baud) |
| Raspberry Pi → Arduino | USB serial (`/dev/ttyUSB0`, 9600 baud) |
| Flash drive → Raspberry Pi | USB (holds `config.json`) |

## Firmware & software setup

### 1. ESP32 transmitter

Flash [`hardware/esp32/yondu_mic_tx/yondu_mic_tx.ino`](../hardware/esp32/yondu_mic_tx/yondu_mic_tx.ino)
from the Arduino IDE (board: *ESP32 Dev Module*). It advertises Bluetooth as
**`ESP32_Yondu`** and streams raw 32-bit I2S samples (48 kHz capture), one
integer per line.

### 2. Arduino rover

Flash [`hardware/arduino/yondu_rover/yondu_rover.ino`](../hardware/arduino/yondu_rover/yondu_rover.ino)
(board: *Arduino UNO*). On power-up it calls `stopMotors()` before anything
else so the rover stays stationary during initialization; all direction pins
default LOW. Commands are newline-terminated strings:

| Code | Action | PWM |
|------|--------|-----|
| `A` | Drive forward | 128 |
| `B` | Drive backward | 128 |
| `C` | Pivot turn right | 100 |
| `D` | Pivot turn left | 128 |
| `0` | Stop | 0 |

> The report body describes C/D as left/right; on the assembled rover the
> motor orientation made `C` pivot right and `D` pivot left as coded. Swap
> `turnLeft`/`turnRight` calls if your build behaves mirrored. Turn speeds
> were deliberately reduced so turns stay slow and correlated to individual
> notes — this made expo participants far more accurate.

### 3. Raspberry Pi receiver

```bash
sudo apt update && sudo apt install python3-numpy python3-serial bluez

# Pair with the ESP32 (once):
bluetoothctl
  scan on            # find ESP32_Yondu's MAC address
  pair <MAC>
  trust <MAC>
  quit

# Bind the Bluetooth serial port (each boot, or add to rc.local/systemd):
sudo rfcomm bind /dev/rfcomm0 <MAC>

# Copy a config (or plug in the config flash drive) and run:
cp config.example.json config.json
python3 signal_processor.py
```

### 4. Calibrating a new instrument / environment

1. Run the processor with [`env_scan.json`](../hardware/raspberry-pi/env_scan.json)
   as `config.json` — it prints the top-20 FFT peaks instead of driving.
2. Strike each note repeatedly at different angles/intensities and log the
   detected peak frequencies and their variance.
3. Pick four notes with well-separated, reproducible frequency bands.
4. Write them into a config file (see
   [`config.example.json`](../hardware/raspberry-pi/config.example.json)):
   each peak gets a `frequency`, a `sensitivity` (± Hz tolerance, typically 5),
   and an `output_code`. `Global_Sensitivity`/`Global_Amplitude` set the
   default tolerances and the dB threshold.

## Lessons learned (read before you build)

- **Don't mount the mic inside the drum.** Resonance amplified voice
  frequencies that matched drum notes and caused false triggers. Mount the
  mic/ESP32 assembly *near* the instrument instead (ours lived in a wearable
  "fin").
- **One note at a time.** Simultaneous strikes cause constructive/destructive
  interference and break single-peak detection.
- **Test with noise.** The lab is quiet; the expo floor is not. We validated
  against subway ambience recordings before demo day.
- **Latency budget:** end-to-end (strike → wheels) target was < 200 ms; the
  115200 baud Bluetooth link and 1024-sample FFT windows kept us inside it.
- **Fuse and standardize wiring** so a short doesn't take out the Pi.
