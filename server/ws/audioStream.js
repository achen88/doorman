import { WebSocketServer } from 'ws';
import { createClient, LiveTranscriptionEvents } from '@deepgram/sdk';
import twilio from 'twilio';

const DELIVERY_KEYWORDS = [
  'amazon', 'fedex', 'ups', 'usps', 'dhl', 'delivery', 'package',
  'doordash', 'door dash', 'ubereats', 'uber eats', 'uber'
];

function setupAudioStream(server) {
  const wss = new WebSocketServer({ server, path: '/audio-stream' });
  const twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

  wss.on('connection', (ws, req) => {
    console.log("Twilio WS connected");
    let callSid = null;
    let isDeepgramReady = false;

    // Create Deepgram live transcription connection
    const deepgram = createClient(process.env.DEEPGRAM_API_KEY);
    const connection = deepgram.listen.live({
      model: 'nova-3',
      language: 'en-US',
      smart_format: true,
      encoding: 'mulaw',
      sample_rate: 8000,
    });
    console.log('[Deepgram] Live transcription connection opened');

    connection.on(LiveTranscriptionEvents.Open, () => {
      console.log('[Deepgram] Connection READY');
      isDeepgramReady = true;
    });

    connection.on(LiveTranscriptionEvents.Transcript, (data) => {
      try {
        const transcript = data.channel?.alternatives[0]?.transcript;
        console.log('[Deepgram Transcript Event]', JSON.stringify(data));
        if (transcript) {
          console.log('[Transcript]', transcript);
          const matched = DELIVERY_KEYWORDS.find(word => transcript.toLowerCase().includes(word));
          if (matched) {
            const trigger = matched.toUpperCase();
            console.log('[Delivery Detected] Trigger:', trigger, 'Transcript:', transcript);
            if (callSid) {
              console.log('[Twilio CallSid]', callSid, 'Updating call with trigger:', trigger);
              twilioClient.calls(callSid).update({
                url: `https://${req.headers.host}/twilio/success${trigger ? `?trigger=${encodeURIComponent(trigger)}` : ''}`,
                method: 'POST'
              }).then(() => {
                console.log('Sent Thank you message.');
              }).catch((err) => {
                console.error('Twilio update error:', err);
              });
            } else {
              console.warn('No callSid available for Twilio client call!');
            }
          }
        }
      } catch (err) {
        console.error('[Transcript handling error]:', err);
      }
    });

    connection.on(LiveTranscriptionEvents.Error, (err) => {
      console.error('[Deepgram error]:', err);
      ws.close();
    });

    ws.on('message', (message) => {
      try {
        const data = JSON.parse(message);
        if (data.event === 'connected' || data.event === 'start') {
          callSid = data.start?.callSid;
          console.log('[WS] Set callSid:', callSid);
        }
        if (data.event === 'media') {
          if (!callSid) {
            console.warn('[WS] Received media event before callSid was set!');
          }
          if (isDeepgramReady) {
            const audio = Buffer.from(data.media.payload, 'base64');
            connection.send(audio);
          } else {
            console.warn('[Deepgram] Not ready yet, dropping audio packet');
          }
        }
      } catch (err) {
        console.error('[Error handling Twilio message]:', err);
      }
    });

    ws.on('close', () => {
      connection.finish();
      console.log('[WS] Twilio media stream disconnected');
    });

    ws.on('error', (err) => {
      console.error('[WebSocket error]:', err);
      connection.finish();
    });
  });
}

export { setupAudioStream }; 