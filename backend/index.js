const got = require('got');
const express = require('express');
const app = express();
const port = process.env.PORT || 3000;

app.get('/', (req, res) => res.json({ app: 'backend' }));

app.get('/test', (req, res) => res.json({ result: 'ok' }));

app.get('/envoy', async (req, res) => {
    try {
        const data = await got('http://localhost:9901/stats').text();
        console.log(data);
        res.send(data.replace(/(?:\r\n|\r|\n)/g, '<br>'));
    } catch (error) {
        console.log(error);
        res.json(error);
    }
});

app.listen(port, () => console.log(`Example app listening on port ${port}!`));