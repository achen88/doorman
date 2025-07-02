import mqtt from 'mqtt';

let client;

const mqttTopic = process.env.MQTT_TOPIC || 'default';

function connect() {
  const mqttBroker = process.env.MQTT_BROKER_URL;
  client = mqtt.connect(mqttBroker, {
    username: process.env.MQTT_USERNAME,
    password: process.env.MQTT_PASSWORD,
  });

  client.on('connect', () => {
    console.log('Connected to MQTT broker');
  });

  client.on('error', (err) => {
    console.error('MQTT connection error:', err);
  });
}

function publish(message, options = { qos: 1 }) {
  console.log(`Publishing to MQTT topic: ${mqttTopic}`);
  if (!client) {
    console.error('MQTT client not connected');
    return;
  }
  client.publish(mqttTopic, message, options, (err) => {
    if (err) {
      console.error('Failed to publish MQTT message:', err);
    }
  });
}

const mqttService = {
  connect,
  publish,
};

export default mqttService;
export { mqttService };