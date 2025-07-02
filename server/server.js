import dotenv from 'dotenv';
dotenv.config();
import express from 'express';
import bodyParser from 'body-parser';
import http from 'http';
import { setupAudioStream } from './ws/audioStream.js';
import mqttService from './services/mqtt.js';
import twilioRouter from './routes/twilio.js';
import fetch from 'node-fetch';
import WebSocket from 'ws';

const app = express();
const port = process.env.PORT || 3000;

mqttService.connect();

app.use(bodyParser.urlencoded({ extended: false }));

const server = http.createServer(app);
setupAudioStream(server);

app.use('/twilio', twilioRouter);

async function testApiKey() {
  try {
    const response = await fetch('https://api.deepgram.com/v1/projects', {
      headers: {
        'Authorization': `Token ${process.env.DEEPGRAM_API_KEY}`
      }
    });
    console.log('API key test:', response.status, response.ok);
    return response.ok;
  } catch (error) {
    console.error('API key test failed:', error);
    return false;
  }
}

function testRawWebSocket() {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket('wss://api.deepgram.com/v1/listen?model=nova-3', {
      headers: {
        'Authorization': `Token ${process.env.DEEPGRAM_API_KEY}`
      }
    });

    const timeout = setTimeout(() => {
      ws.close();
      reject(new Error('WebSocket connection timeout'));
    }, 10000);

    ws.on('open', () => {
      console.log('✅ Raw WebSocket connected');
      clearTimeout(timeout);
      ws.close();
      resolve(true);
    });

    ws.on('error', (error) => {
      console.error('❌ Raw WebSocket error:', error);
      clearTimeout(timeout);
      reject(error);
    });
  });
}

async function testNetworkConnectivity() {
  try {
    const response = await fetch('https://api.deepgram.com/v1/projects', {
      method: 'HEAD'
    });
    console.log('Network connectivity:', response.status);
    return true;
  } catch (error) {
    console.error('Network test failed:', error.message);
    return false;
  }
}

async function deepgramHealthCheck() {
  console.log('🔍 Starting Deepgram health check...');
  console.log('ENV check - API key exists:', !!process.env.DEEPGRAM_API_KEY);
  console.log('ENV check - API key length:', process.env.DEEPGRAM_API_KEY?.length);

  const networkOk = await testNetworkConnectivity();
  const apiKeyOk = await testApiKey();

  try {
    await testRawWebSocket();
    console.log('✅ All checks passed');
  } catch (error) {
    console.error('❌ WebSocket check failed:', error.message);
  }
}

deepgramHealthCheck();

server.listen(port, () => {
  console.log(`Server listening on port ${port}`);
}); 