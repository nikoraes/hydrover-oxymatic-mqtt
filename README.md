# Hydrover Oxymatic MQTT Integration

This project integrates the Hydrover Oxymatic Controller with Home Assistant using MQTT. It publishes sensor data and allows control of the device mode via MQTT Select.

## Features

- Publishes sensor data (e.g., temperature, pH, redox) to Home Assistant.
- Allows setting the device mode (`auto`, `man`, `off`) using MQTT Select.
- Sends alerts to Home Assistant in case of errors.

## Prerequisites

- Node.js (LTS version 18 or later)
- MQTT broker (e.g., Mosquitto)
- Home Assistant with MQTT integration enabled

## Installation

1. Clone the repository:

   ```bash
   git clone <repository-url>
   cd hydrover-oxymatic-mqtt
   ```

2. Install dependencies:

   ```bash
   pnpm install
   ```

## Configuration

1. Create a `.env` file in the project root with the following variables:

   ```env
   MQTT_HOST=<your-mqtt-host>
   MQTT_PORT=<your-mqtt-port>
   MQTT_USERNAME=<your-mqtt-username>
   MQTT_PASSWORD=<your-mqtt-password>
   DEVICE_ID=<unique-device-id>
   LOGIN_REQUEST=user=<oxymatic-username>&password=<oxymatic-password>
   ```

## Usage

1. Build the project:

   ```bash
   pnpm build
   ```

2. Start the application:

   ```bash
   pnpm start
   ```

## Docker

1. Build the Docker image:

   ```bash
   docker build -t hydrover-oxymatic-mqtt .
   ```

2. Run the container:

   ```bash
   docker run -d --env-file .env hydrover-oxymatic-mqtt
   ```

## Deployment

This project can be deployed on Kubernetes or any container orchestration platform. Ensure the `.env` file is converted to a Kubernetes secret or environment variables.

## Development

- Watch for changes and rebuild automatically:

  ```bash
  pnpm dev
  ```

## License

This project is licensed under the MIT License.
