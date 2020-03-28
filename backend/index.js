const got = require('got');
const express = require('express');
const app = express();
const port = process.env.PORT || 3000;

app.get('/', (req, res) => res.json({ app: 'backend' }));

app.get('/test', (req, res) => res.json({ result: 'ok' }));

app.listen(port, () => console.log(`Example app listening on port ${port}!`));