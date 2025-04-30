import dotenv from 'dotenv';

dotenv.config();

import express from 'express';
import { SetsRecord, XataClient  } from './xata';
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

//Get a single set
app.get('/sets/:id', async (req, res) => {
    const { id } = req.params;
    const set = await client.db.sets.read(id);
    res.send(set);
});


// Create a new set
app.post('/sets', async (req, res) => {
    const {
        title,
        description,
        private: isPrivate,
        creator,
        imageLink // renamed to “imageLink” on the client side
    } = req.body;
  
    try {
        const newSet = await client.db.sets.create({
            title,
            description,
            private: isPrivate,
            creator,
            image_link: imageLink || null   // ← write to image_link column
        });
  
        res.status(201).json(newSet);
    } catch (err) {
        console.error('Failed to create set:', err);
        res.status(500).json({ error: 'Failed to create set' });
    }
});

// Add a set to user favorites
app.post('/usersets', async (req, res) => {
    const { user, set } = req.body;
    const userSet = await client.db.user_sets.create({
      user,
      set,
    });
    res.send(userSet);
});

// Get all user sets
app.get('/usersets', async (req, res) => {
    const { user } = req.query;
  
    const sets = await client.db.user_sets
      .select(['xata_id', 'set.*'])
      .filter({ user: `${user}` })
      .getAll();
    res.send(sets);
  });

// Remove a set
app.delete('/sets/:id', async (req, res) => {
    const { id } = req.params;
    const existingSets = await client.db.user_sets.filter({ set: id }).getAll();
  
    if (existingSets.length > 0) {
      const toDelete = existingSets.map((set: SetsRecord) => set.xata_id);
      await client.db.user_sets.delete(toDelete);
    }
    await client.db.sets.delete(id);
  
    res.send({ success: true });
  });

app.listen(PORT, () => {
    console.log(`App listening on port ${PORT}`);
});
