require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const mqtt = require('mqtt');
const twilio = require('twilio');

const app = express();
const port = process.env.PORT || 3000;

// --- MQTT Configuration ---
const mqttBroker = process.env.MQTT_BROKER_URL;
const mqttTopic = process.env.MQTT_TOPIC || 'default';
const client = mqtt.connect(mqttBroker, {
  username: process.env.MQTT_USERNAME,
  password: process.env.MQTT_PASSWORD,
});

client.on('connect', () => {
  console.log('Connected to MQTT broker');
});

client.on('error', (err) => {
  console.error('MQTT connection error:', err);
});

app.use(bodyParser.urlencoded({ extended: false }));

// --- Twilio Webhook Endpoint ---
app.post('/twilio/event', (req, res) => {
  const twilioSignature = req.headers['x-twilio-signature'];
  const params = req.body;
  const url = `https://${req.headers.host}${req.originalUrl}`;

  // Validate the Twilio request
  const requestIsValid = twilio.validateRequest(
    process.env.TWILIO_AUTH_TOKEN,
    twilioSignature,
    url,
    params
  );

  if (!requestIsValid) {
    return res.status(401).send('Unauthorized');
  }

  console.log('Received Twilio webhook:', params);

  const digits = params.Digits;

  // Branch based on whether DTMF input exists
  if (digits) {
    handleDTMF(digits, res);
  } else {
    greetWithTimeout(res);
  }
});

// Handle DTMF input from user
function handleDTMF(digits, res) {
  console.log(`DTMF tones received: ${digits}`);
  let twiml = '';

  if (digits === '4') {
    console.log(`Publishing to MQTT topic: ${mqttTopic}`);
    client.publish(mqttTopic, 'activate', { qos: 1 }, (err) => {
      if (err) {
        console.error('Failed to publish MQTT message:', err);
      }
    });
    twiml = `
      <Response>
        <Say interruptOnKey="any">Thank you, opening</Say>
        <Hangup/>
      </Response>
    `;
  } else {
    twiml = `
    <Response>
      <Say interruptOnKey="any">Invalid code</Say>
      <Hangup/>
    </Response>
  `;
  }

  res.type('text/xml');
  res.send(twiml);
}

// Initial greeting with timeout
function greetWithTimeout(res) {
  const twiml = `
    <Response>
      <Gather input="dtmf" numDigits="1" timeout="15" action="/twilio/event">
        <Pause length="1"/>
        <Say interruptOnKey="any">Hello, awaiting code</Say>
      </Gather>
      <Say interruptOnKey="any">No input, try again</Say>
      <Hangup/>
    </Response>
  `;

  res.type('text/xml');
  res.send(twiml);
}

app.listen(port, () => {
  console.log(`Server listening on port ${port}`);
}); 