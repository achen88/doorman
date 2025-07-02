import dotenv from 'dotenv';
dotenv.config();
import express from 'express';
import twilio from 'twilio';
import mqttService from '../services/mqtt.js';

const router = express.Router();

// Twilio client for sending SMS
const twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
// List of numbers to notify (E.164 format)
const NOTIFY_NUMBERS = process.env.NOTIFY_NUMBERS ? process.env.NOTIFY_NUMBERS.split(',') : [];
const FROM_NUMBER = process.env.TWILIO_PHONE_NUMBER;

// Helper to format the SMS message
function formatGateOpenedMessage({ trigger, caller }) {
  let parts = [];
  if (trigger) parts.push(`${trigger}`);
  if (caller) parts.push(`${caller}`);
  return `FRONT GATE OPENED BY: ${parts.join(', ')}`;
}

// Helper to send SMS to all notify numbers
function sendGateOpenedSMS({ trigger, caller }) {
  const message = formatGateOpenedMessage({ trigger, caller });
  if (NOTIFY_NUMBERS.length > 0 && FROM_NUMBER) {
    NOTIFY_NUMBERS.forEach(number => {
      twilioClient.messages.create({
        body: message,
        from: FROM_NUMBER,
        to: number.trim(),
      }).then(msg => {
        console.log(`SMS sent to ${number}: ${msg.sid}`);
      }).catch(err => {
        console.error(`Failed to send SMS to ${number}:`, err);
      });
    });
  } else {
    console.warn('No NOTIFY_NUMBERS or FROM_NUMBER set for SMS notification.');
  }
}

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
function handleDTMF(digits, req, res) {
  console.log(`DTMF tones received: ${digits}`);
  let twiml = '';
  const caller = req.body.From;

  if (digits === '4') {
    sendGateOpenedSMS({ caller });
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
    handleDTMF(digits, req, res);
  } else {
    const twiml = `
      <Response>
        <Start>
          <Stream url="wss://${req.headers.host}/audio-stream" />
        </Start>
        <Gather input="dtmf" numDigits="1" timeout="60" action="/twilio/event">
          <Say>hello, please state your purpose or enter your code.</Say>
        </Gather>
      </Response>
    `;
    res.type('text/xml');
    res.send(twiml);
  }
});

router.post('/success', (req, res) => {
  console.log('Received success webhook');
  const trigger = req.query.trigger;
  const caller = req.body.From;
  sendGateOpenedSMS({ trigger, caller });
  const twiml = buzzAndSaySuccess();
  res.type('text/xml');
  res.send(twiml);
});

export default router;
export { buzzAndSaySuccess }; 