import mqtt, { MqttClient } from 'mqtt';
import axios from 'axios';
import { parse } from 'node-html-parser';

interface DeviceConfig {
  identifiers: string[];
  name: string;
  manufacturer: string;
  model: string;
}

interface SensorConfig {
  name: string;
  state_topic: string;
  unique_id: string;
  device: DeviceConfig;
  unit_of_measurement?: string;
  device_class?: string;
  options?: string[];
  command_topic?: string;
}

const client: MqttClient = mqtt.connect({
  host: process.env.MQTT_HOST!,
  port: Number(process.env.MQTT_PORT!),
  username: process.env.MQTT_USERNAME!,
  password: process.env.MQTT_PASSWORD!,
});

client.on('error', (err) => {
  console.error('MQTT connection error:', err);
});

const deviceConfig: DeviceConfig = {
  identifiers: [process.env.DEVICE_ID!],
  name: process.env.HOMIE_NAME!,
  manufacturer: 'Hydrover',
  model: 'Oxymatic Controller',
};

const login = async (): Promise<string> => {
  try {
    await axios.post('https://oxymaticapp.hydrover.eu/home/login', process.env.LOGIN_REQUEST, {
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      maxRedirects: 0,
    });
    throw new Error('Login failed');
  } catch (err: any) {
    const cookie = err.response?.headers['set-cookie'][0].split(';')[0];
    if (!cookie) throw new Error('Login failed');

    const resp = await axios.get('https://oxymaticapp.hydrover.eu/Users/Account', {
      headers: { cookie },
    });

    const requestVerificationTokenCookie = `${ resp.headers['set-cookie']?.[0] }`.split(';')?.[0]
    return `${cookie}; ${requestVerificationTokenCookie}`;
  }
};

const getDeviceStatusPage = async (cookie: string): Promise<string> => {
  const resp = await axios.get('https://oxymaticapp.hydrover.eu/devices/DeviceStatus?id=2723', {
    headers: { cookie },
  });
  return resp.data;
};

const setDeviceMode = async (mode: string, cookie: string): Promise<void> => {
  await axios.get(`https://oxymaticapp.hydrover.eu/devices/${mode}?id=2723`, {
    headers: { cookie },
  });
};

// Updated mode to use MQTT Select with predefined options
const publishDiscoveryConfig = (sensor: string, name: string, unit?: string, deviceClass?: string, component: string = 'sensor', options?: string[]): void => {
  const topic = `homeassistant/${component}/${process.env.DEVICE_ID}/${sensor}/config`;
  const payload: SensorConfig = {
    name,
    state_topic: `homeassistant/${component}/${process.env.DEVICE_ID}/${sensor}/state`,
    unique_id: `${process.env.DEVICE_ID}_${sensor}`,
    device: deviceConfig,
    unit_of_measurement: unit,
    device_class: deviceClass,
    options: component === 'select' ? options : undefined,
    command_topic: component === 'select' ? `homeassistant/${component}/${process.env.DEVICE_ID}/${sensor}/set` : undefined,
  };

  client.publish(topic, JSON.stringify(payload), { retain: true });
};

const publishState = (sensor: string, value: string): void => {
  const topic = `homeassistant/sensor/${process.env.DEVICE_ID}/${sensor}/state`;
  client.publish(topic, value, { retain: true }, (err) => {
    if (err) {
      console.error(`Failed to publish state for ${sensor}:`, err);
    } else {
      console.log(`Published state for ${sensor}: ${value}`);
    }
  });
};

const publishAlert = (message: string): void => {
  const topic = `homeassistant/text/${process.env.DEVICE_ID}/alert/state`;
  client.publish(topic, message, { retain: true }, (err) => {
    if (err) {
      console.error('Failed to publish alert:', err);
    } else {
      console.log(`Published alert: ${message}`);
    }
  });
};

const processLoop = async (): Promise<void> => {
  const interval = Number(process.env.PROCESS_LOOP_INTERVAL) || 300000; // Default to 5 minutes

  try {
    const cookie = await login();
    const deviceStatusRaw = await getDeviceStatusPage(cookie);
    const deviceStatusPage = parse(deviceStatusRaw);

    const temperature = deviceStatusPage.querySelector('.control-temp .big-number')?.text || '';
    const pH = deviceStatusPage.querySelector('.control-ph .big-number')?.text || '';
    const redox = deviceStatusPage.querySelector('.control-redox .big-number')?.text || '';
    const mode =
      deviceStatusPage.querySelectorAll('.statusresume p').find((x) => x.text.includes('MODE'))?.text.replace('MODE: ', '').toLowerCase() || '';
    const prog =
      deviceStatusPage.querySelectorAll('.statusresume p').find((x) => x.text.includes('PROG'))?.text.replace('PROG: ', '').trim() || '';

    publishState('temperature', temperature);
    publishState('pH', pH);
    publishState('redox', redox);
    publishState('mode', mode);
    publishState('prog', prog);
  } catch (err) {
    console.error('Error in processLoop:', err);
    publishAlert(`Error: ${(err as Error).message}`);
  }
  setTimeout(processLoop, interval);
};

const handleCommand = async (command: string): Promise<void> => {
  console.log(`Handling command: ${command}`);
  try {
    const cookie = await login();
    await setDeviceMode(command, cookie);
    console.log(`Device mode set to: ${command}`);
  } catch (err) {
    console.error('Error handling command:', err);
  }
};

const main = (): void => {
  client.on('connect', () => {
    console.log('Connected to MQTT broker');

    publishDiscoveryConfig('temperature', 'Temperature', '°C', 'temperature');
    publishDiscoveryConfig('pH', 'pH');
    publishDiscoveryConfig('redox', 'Redox', 'mV');
    publishDiscoveryConfig('mode', 'Mode', undefined, undefined, 'select', ['auto', 'man', 'off']);
    publishDiscoveryConfig('prog', 'Program');

    const commandTopic = `homeassistant/select/${process.env.DEVICE_ID}/mode/set`;
    client.subscribe(commandTopic);
    client.on('message', (topic, message) => {
      console.log(`Received message on topic ${topic}: ${message.toString()}`);
      if (topic === commandTopic) {
        handleCommand(message.toString());
      }
    });

    processLoop();
  });
};

main();