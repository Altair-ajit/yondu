"""Team Yondu — Raspberry Pi signal processing & decision logic.

Reads the raw sample stream from the ESP32 (Bluetooth serial, one integer
sample per line), runs an FFT over each window, maps detected frequency
peaks to output codes using a JSON configuration file, and forwards the
codes to the Arduino over USB serial.

Pipeline (see docs/ARCHITECTURE.md):
  raw I2S samples -> Hanning window + FFT -> dB magnitude ->
  peak-vs-config matching -> output codes ('A'/'B'/'C'/'D', '0' = none)

Special config: if config_name == "env_scan" the script prints the top 20
peaks instead of emitting control codes — used to survey an environment /
instrument and pick well-separated frequencies for a new config file.

From the Final Capstone Report appendix (Spring 2025).
"""

import numpy as np
import serial
import json
import time

# === CONFIGURATION ===
CONFIG_FILE = 'config.json'
SERIAL_PORT = '/dev/rfcomm0'     # ESP32 serial (bound via bluetoothctl + rfcomm)
ARDUINO_PORT = '/dev/ttyUSB0'    # Arduino serial
BAUD_RATE = 115200
ARDUINO_BAUD = 9600
SAMPLE_SIZE = 1024   # Number of samples per FFT window
SAMPLE_RATE = 44100  # FFT bin spacing (as submitted; ESP32 firmware captures at 48 kHz)


def load_config():
    with open(CONFIG_FILE, 'r') as f:
        return json.load(f)


def process_signal(samples, config):
    # Apply window and FFT
    fft_result = np.fft.rfft(samples * np.hanning(len(samples)))
    magnitude = np.abs(fft_result)
    db_values = 20 * np.log10(np.maximum(magnitude, 1e-10))  # Avoid log(0)
    freqs = np.fft.rfftfreq(len(samples), d=1 / SAMPLE_RATE)
    return list(zip(freqs, db_values))


def detect_outputs(peaks, config):
    global_sens = config.get("Global_Sensitivity", 5)
    detected = set()

    if config.get("config_name") == "env_scan":
        top_peaks = sorted(peaks, key=lambda x: x[1], reverse=True)[:20]
        print("Top 20 Peaks (Freq, dB):")
        for f, d in top_peaks:
            print(f"{f:.2f} Hz: {d:.2f} dB")
        return [f"{f:.1f}:{d:.1f}" for f, d in top_peaks]

    for freq, amp in peaks:
        for details in config.get("Peaks", {}).values():
            expected = details["frequency"]
            sensitivity = details.get("sensitivity", global_sens)
            output = details["output_code"].strip()
            if abs(freq - expected) <= sensitivity and amp >= global_sens:
                detected.add(output)

    if not detected:
        detected.add("0")
    return list(detected)


def send_outputs(outputs, arduino):
    print("Detected Output Codes:", outputs)
    if arduino:
        arduino.write(",".join(outputs).encode() + b'\n')


def main():
    config = load_config()
    try:
        esp_serial = serial.Serial(SERIAL_PORT, BAUD_RATE, timeout=1)
        print(f"CONNECTED TO ESP32 via {SERIAL_PORT}")
    except serial.SerialException:
        print("ERROR: Could not open ESP32 serial port.")
        return

    try:
        arduino = serial.Serial(ARDUINO_PORT, ARDUINO_BAUD, timeout=1)
        print(f"CONNECTED TO ARDUINO via {ARDUINO_PORT}")
    except Exception:
        print("ERROR: Could not open Arduino serial port.")
        raise

    buffer = []

    while True:
        try:
            line = esp_serial.readline().decode().strip()
            if line:
                val = int(line)
                buffer.append(val)
                if len(buffer) >= SAMPLE_SIZE:
                    start_time = time.time()
                    peaks = process_signal(np.array(buffer[-SAMPLE_SIZE:]), config)
                    outputs = detect_outputs(peaks, config)
                    send_outputs(outputs, arduino)
                    print(f"FFT Processed in {1000 * (time.time() - start_time):.2f} ms\n")
                    buffer.clear()
        except Exception as e:
            print("ERROR:", e)
            buffer.clear()


if __name__ == '__main__':
    main()
