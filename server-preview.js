'use strict';
const { createApp } = require('./server');
const path = require('path');
const PORT = process.env.PORT ? Number(process.env.PORT) : 3000;
const { app } = createApp({ demo: true, dataFile: path.join(__dirname, 'data', 'demo-library.json') });
app.listen(PORT, '0.0.0.0', () => console.log(`Console Launcher preview on http://0.0.0.0:${PORT}`));
