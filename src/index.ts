import dotenv from 'dotenv';

dotenv.config();

import express from 'express';
import { XataClient  } from './xata';
import { cardsCapitals, cardsProgramming, sets } from './seed_database';

const PORT = parseInt(process.env.PORT || '3000', 10);

const app = express();
app.use(express.json({ limit: '50mb' }));

const client = new XataClient({
    apiKey: process.env.XATA_API_KEY!,
    branch: process.env.XATA_BRANCH || 'main'
  });


app.get('/init', async (req, res) => {
    try {
        await client.db.sets.create(sets);
        await client.db.cards.create(cardsCapitals);
        await client.db.cards.create(cardsProgramming);
        res.send({ ok: true });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Seeding failed' });
    }
});

//Get all sets
app.get('/sets', async (req, res) => {
    const sets = await client.db.sets
    .select(['xata_id', 'title', 'description', 'image_link', 'cards'])
    .filter({private: false})
    .getAll();
    res.send(sets);
});

app.listen(PORT, () => {
    console.log(`App listening on port ${PORT}`);
});
