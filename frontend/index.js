const got = require('got');
const express = require('express');
const app = express();
const port = process.env.PORT || 3000;

app.get('/', (req, res) => res.json({ app: 'frontend' }));

app.get('/test', async (req, res) => {
    try {
        const data = await got('http://backend.ecs.local/test').json();
        console.log(data);
        res.json(data);
    } catch (error) {
        console.log(error);
        res.json(error);
    }
});

app.listen(port, () => console.log(`Example app listening on port ${port}!`));