import dotenv from 'dotenv';
dotenv.config();
import express from 'express';
import bodyParser from 'body-parser';
import http from 'http';
import { setupAudioStream } from './ws/audioStream.js';
import mqttService from './services/mqtt.js';
import twilioRouter from './routes/twilio.js';

const app = express();
const port = process.env.PORT || 3000;

mqttService.connect();

app.use(bodyParser.urlencoded({ extended: false }));

const server = http.createServer(app);
setupAudioStream(server);

app.use('/twilio', twilioRouter);

server.listen(port, () => {
  console.log(`Server listening on port ${port}`);
}); 