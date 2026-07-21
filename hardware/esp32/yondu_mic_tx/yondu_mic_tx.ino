// Team Yondu — ESP32 audio acquisition + Bluetooth transmitter
// Captures raw audio from an INMP441 I2S microphone and streams each
// sample over Bluetooth Serial to the Raspberry Pi receiver.
//
// Board: ESP32 DEV Module
// Mic wiring (see docs/HARDWARE.md):
//   INMP441 SCK -> GPIO 32, WS -> GPIO 25, SD -> GPIO 33, L/R -> GND, VDD -> 3V3
//
// I2S mic bring-up based on atomic14's esp32-i2s-mic-test:
// https://github.com/atomic14/esp32-i2s-mic-test

#include "BluetoothSerial.h"
#include "driver/i2s.h"

// ----- Configuration -----
#define SAMPLE_BUFFER_SIZE 512
#define SAMPLE_RATE 48000
#define I2S_MIC_CHANNEL I2S_CHANNEL_FMT_ONLY_LEFT
#define I2S_MIC_SERIAL_CLOCK GPIO_NUM_32
#define I2S_MIC_LEFT_RIGHT_CLOCK GPIO_NUM_25
#define I2S_MIC_SERIAL_DATA GPIO_NUM_33

// ----- I2S Config -----
i2s_config_t i2s_config = {
    .mode = (i2s_mode_t)(I2S_MODE_MASTER | I2S_MODE_RX),
    .sample_rate = SAMPLE_RATE,
    .bits_per_sample = I2S_BITS_PER_SAMPLE_32BIT,
    .channel_format = I2S_CHANNEL_FMT_ONLY_LEFT,
    .communication_format = I2S_COMM_FORMAT_I2S,
    .intr_alloc_flags = ESP_INTR_FLAG_LEVEL1,
    .dma_buf_count = 4,
    .dma_buf_len = 1024,
    .use_apll = false,
    .tx_desc_auto_clear = false,
    .fixed_mclk = 0
};

i2s_pin_config_t i2s_mic_pins = {
    .bck_io_num = I2S_MIC_SERIAL_CLOCK,
    .ws_io_num = I2S_MIC_LEFT_RIGHT_CLOCK,
    .data_out_num = I2S_PIN_NO_CHANGE,
    .data_in_num = I2S_MIC_SERIAL_DATA
};

// ----- Bluetooth -----
BluetoothSerial SerialBT;

// ----- Data Buffer -----
int32_t raw_samples[SAMPLE_BUFFER_SIZE];

// ===== SETUP =====
void setup()
{
  Serial.begin(115200);
  SerialBT.begin("ESP32_Yondu");  // Bluetooth device name the Pi pairs with
  Serial.println("Bluetooth ready. Transmitting raw samples...");

  i2s_driver_install(I2S_NUM_0, &i2s_config, 0, NULL);
  i2s_set_pin(I2S_NUM_0, &i2s_mic_pins);
}

// ===== LOOP =====
void loop()
{
  size_t bytes_read = 0;
  i2s_read(I2S_NUM_0, raw_samples, sizeof(int32_t) * SAMPLE_BUFFER_SIZE, &bytes_read, portMAX_DELAY);
  int samples_read = bytes_read / sizeof(int32_t);

  // Transmit raw samples over Bluetooth, one sample per line
  for (int i = 0; i < samples_read; i++) {
    SerialBT.printf("%ld\n", raw_samples[i]);
    Serial.printf("%ld\n", raw_samples[i]);
  }

  delay(10);  // Optional: adjust depending on desired speed and receiver stability
}
