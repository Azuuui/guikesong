import 'dotenv/config';
import {createApp} from './app';
import {loadPublicConfig} from './config/env';

const config = loadPublicConfig();
const app = createApp({providerMode: config.providerMode});

app.listen(config.port, () => {
  console.log(`backend on ${config.port} (${config.providerMode})`);
});
