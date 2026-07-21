// Team Yondu — rover actuation (Arduino UNO on a Lafvin 2WD chassis)
// Listens on USB serial (9600 baud, from the Raspberry Pi) for newline-
// terminated command strings and drives the motors via H-bridge logic:
//   A = forward, B = backward, C = turn right, D = turn left, 0 = stop
// (The report body labels C/D as left/right; on the assembled rover the
// wiring orientation made C spin right and D spin left, as coded below.)
//
// Recovered from the Final Capstone Report appendix (Spring 2025).

#define Lpwm_pin  5   // PWM pin for left motor
#define Rpwm_pin  6   // PWM pin for right motor

int pinLB = 4;        // Left motor backward
int pinLF = 2;        // Left motor forward
int pinRB = 8;        // Right motor backward
int pinRF = 7;        // Right motor forward

// Define incremental turning parameters
const int turnStepTime  = 200;  // milliseconds for each incremental turn
const int turnPauseTime = 200;  // pause time between increments
const int numTurnSteps  = 5;    // total increments per turning phase

void setup() {
  // Initialize serial for debugging
  Serial.begin(115200);

  // Set all motor pins as outputs
  pinMode(pinLB, OUTPUT);
  pinMode(pinLF, OUTPUT);
  pinMode(pinRB, OUTPUT);
  pinMode(pinRF, OUTPUT);
  pinMode(Lpwm_pin, OUTPUT);
  pinMode(Rpwm_pin, OUTPUT);

  pinMode(LED_BUILTIN, OUTPUT);

  // Stop motors at startup
  stopMotors();
  delay(1000);
}

void loop() {

  if (Serial.available()) {
    String line = Serial.readStringUntil('\n');
    line.trim();

    Serial.print("Received: ");
    Serial.println(line);

    if (line.indexOf("A") >= 0) {
      digitalWrite(LED_BUILTIN, HIGH);
      delay(100);
      digitalWrite(LED_BUILTIN, LOW);

      int SPEED = 128;

      Serial.println("Driving forward...");
      driveForward(SPEED);
    }

    if (line.indexOf("B") >= 0) {
      digitalWrite(LED_BUILTIN, HIGH);
      delay(100);
      digitalWrite(LED_BUILTIN, LOW);

      int SPEED = 128;

      Serial.println("Driving backward...");
      driveBackward(SPEED);
    }

    if (line.indexOf("C") >= 0) {
      digitalWrite(LED_BUILTIN, HIGH);
      delay(100);
      digitalWrite(LED_BUILTIN, LOW);

      int SPEED = 100;

      Serial.println("Driving right...");
      turnRight(SPEED);
    }

    if (line.indexOf("D") >= 0) {
      digitalWrite(LED_BUILTIN, HIGH);
      delay(100);
      digitalWrite(LED_BUILTIN, LOW);

      int SPEED = 128;

      Serial.println("Driving left...");
      turnLeft(SPEED);
    }

    if (line.indexOf("0") >= 0) {
      digitalWrite(LED_BUILTIN, HIGH);
      delay(100);
      digitalWrite(LED_BUILTIN, LOW);
      Serial.println("Stop...");
      stopMotors();
    }
  }
}

//---------------- Motor Control Functions ----------------//

// Drive both motors forward
void driveForward(int speedVal) {
  // Left motor forward: set pinLF LOW, pinLB HIGH
  digitalWrite(pinLF, LOW);
  digitalWrite(pinLB, HIGH);
  // Right motor forward: set pinRF LOW, pinRB HIGH
  digitalWrite(pinRF, LOW);
  digitalWrite(pinRB, HIGH);

  // Apply speed via PWM
  analogWrite(Lpwm_pin, speedVal);
  analogWrite(Rpwm_pin, speedVal);
}

// Drive both motors backward
void driveBackward(int speedVal) {
  // Left motor backward: set pinLF HIGH, pinLB LOW
  digitalWrite(pinLF, HIGH);
  digitalWrite(pinLB, LOW);
  // Right motor backward: set pinRF HIGH, pinRB LOW
  digitalWrite(pinRF, HIGH);
  digitalWrite(pinRB, LOW);

  // Apply speed via PWM
  analogWrite(Lpwm_pin, speedVal);
  analogWrite(Rpwm_pin, speedVal);
}

// Turn right (pivot turn)
void turnRight(int speedVal) {
  // For a pivot turn right:
  // Left motor forward and right motor backward
  digitalWrite(pinLF, LOW);
  digitalWrite(pinLB, HIGH);
  digitalWrite(pinRF, HIGH);
  digitalWrite(pinRB, LOW);

  analogWrite(Lpwm_pin, speedVal);
  analogWrite(Rpwm_pin, speedVal);
}

// Turn left (pivot turn)
void turnLeft(int speedVal) {
  // For a pivot turn left:
  // Left motor backward and right motor forward
  digitalWrite(pinLF, HIGH);
  digitalWrite(pinLB, LOW);
  digitalWrite(pinRF, LOW);
  digitalWrite(pinRB, HIGH);

  analogWrite(Lpwm_pin, speedVal);
  analogWrite(Rpwm_pin, speedVal);
}

// Stop both motors
void stopMotors() {
  // Set PWM outputs to 0
  analogWrite(Lpwm_pin, 0);
  analogWrite(Rpwm_pin, 0);

  // Optionally set direction pins LOW
  digitalWrite(pinLF, LOW);
  digitalWrite(pinLB, LOW);
  digitalWrite(pinRF, LOW);
  digitalWrite(pinRB, LOW);
}
