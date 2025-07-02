import express from 'express';
import twilio from 'twilio';
import mqttService from '../services/mqtt.js';

const router = express.Router();

// Function to buzz and return TwiML for success
function buzzAndSaySuccess() {
  mqttService.publish('activate', { qos: 1 });
  return `
    <Response>
      <Say interruptOnKey="any">Thank you, opening</Say>
      <Hangup/>
    </Response>
  `;
}

// Handle DTMF input from user
function handleDTMF(digits, res) {
  console.log(`DTMF tones received: ${digits}`);
  let twiml = '';

  if (digits === '4') {
    twiml = buzzAndSaySuccess();
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

router.post('/event', (req, res) => {
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
    const twiml = `
      <Response>
        <Start>
          <Stream url="wss://${req.headers.host}/audio-stream" />
        </Start>
        <Gather input="dtmf" numDigits="1" timeout="60" action="/twilio/event" bargeIn="true">
          <Say>State your purpose or enter code.</Say>
        </Gather>
      </Response>
    `;
    res.type('text/xml');
    res.send(twiml);
  }
});

router.post('/success', (req, res) => {
  console.log('Received success webhook');
  const twiml = buzzAndSaySuccess();
  res.type('text/xml');
  res.send(twiml);
});

export default router;
export { buzzAndSaySuccess }; 