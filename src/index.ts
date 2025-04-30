import dotenv from "dotenv";
import express, { RequestHandler } from "express";
import { SetsRecord, XataClient } from "./xata";
import { cardsCapitals, cardsProgramming, sets } from "./seed_database";
import { v2 as cloudinary } from "cloudinary";

dotenv.config();

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const PORT = parseInt(process.env.PORT || "3000", 10);

const app = express();
app.use(express.json({ limit: "50mb" }));

const client = new XataClient({
  apiKey: process.env.XATA_API_KEY!,
  branch: process.env.XATA_BRANCH || "main",
});

app.get("/init", async (req, res) => {
  try {
    await client.db.sets.create(sets);
    await client.db.cards.create(cardsCapitals);
    await client.db.cards.create(cardsProgramming);
    res.send({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Seeding failed" });
  }
});

//Get all sets
app.get("/sets", async (req, res) => {
  const sets = await client.db.sets
    .select(["xata_id", "title", "description", "image_link", "cards"])
    .filter({ private: false })
    .getAll();
  res.send(sets);
});

//Get a single set
app.get("/sets/:id", async (req, res) => {
  const { id } = req.params;
  const set = await client.db.sets.read(id);
  res.send(set);
});

// Create a new set
app.post("/sets", async (req, res) => {
  const {
    title,
    description,
    private: isPrivate,
    creator,
    imageLink, // renamed to "imageLink" on the client side
  } = req.body;

  try {
    const newSet = await client.db.sets.create({
      title,
      description,
      private: isPrivate,
      creator,
      image_link: imageLink || null, // ← write to image_link column
    });

    // Add id field as alias to xata_id for backward compatibility
    const response = {
      ...newSet,
      id: newSet.xata_id,
    };

    res.status(201).json(response);
  } catch (err) {
    console.error("Failed to create set:", err);
    res.status(500).json({ error: "Failed to create set" });
  }
});

// Add a set to user favorites
app.post("/usersets", async (req, res) => {
  const { user, set } = req.body;
  const userSet = await client.db.user_sets.create({
    user,
    set,
  });
  res.send(userSet);
});

// Get all user sets
app.get("/usersets", async (req, res) => {
  const { user } = req.query;
  if (!user || typeof user !== "string") {
    res.status(400).json({ error: "Invalid user ID" });
    return;
  }

  const sets = await client.db.user_sets
    .select(["xata_id", "set.*"])
    .filter("user", user)
    .getAll();
  res.send(sets);
});

// Remove a set
app.delete("/sets/:id", async (req, res) => {
  const { id } = req.params;
  const existingSets = await client.db.user_sets.filter({ set: id }).getAll();

  if (existingSets.length > 0) {
    const toDelete = existingSets.map((set: SetsRecord) => set.xata_id);
    await client.db.user_sets.delete(toDelete);
  }
  await client.db.sets.delete(id);

  res.send({ success: true });
});

// Create a new card
app.post("/cards", async (req, res) => {
  const { set, question, answer } = req.body;

  console.log("Creating card with data:", { set, question, answer });

  try {
    // Validate input
    if (!set || !question || !answer) {
      console.error("Invalid card data:", { set, question, answer });
      res.status(400).json({ error: "Missing required fields" });
    }

    // Create the card
    const card = await client.db.cards.create({
      set,
      question,
      answer,
    });

    console.log("Card created:", card);

    if (card) {
      // Update the cards count in the set
      await client.db.sets.update(set, {
        cards: {
          $increment: 1,
        },
      });
    }

    // Add id field as alias to xata_id for backward compatibility
    const response = {
      ...card,
      id: card.xata_id,
    };

    res.send(response);
  } catch (error) {
    console.error("Failed to create card:", error);
    res.status(500).json({ error: "Failed to create card" });
  }
});

// Get all cards of a set
app.get("/cards", async (req, res) => {
  const { setid } = req.query;
  if (!setid || typeof setid !== "string") {
    res.status(400).json({ error: "Invalid set ID" });
    return;
  }

  const cards = await client.db.cards
    .select(["*", "set.*"])
    .filter("set.xata_id", setid)
    .getAll();
  res.send(cards);
});

// Learn a specific number of cards from a set
app.get("/cards/learn", async (req, res) => {
  const { setid, limit } = req.query;
  if (!setid || typeof setid !== "string") {
    res.status(400).json({ error: "Invalid set ID" });
    return;
  }

  const cards = await client.db.cards
    .select(["question", "answer", "image_link"])
    .filter("set.xata_id", setid)
    .getAll();

  // Get a random set of cards using limit
  const randomCards = cards
    .map((value) => ({ value, sort: Math.random() }))
    .sort((a, b) => a.sort - b.sort)
    .map(({ value }) => value)
    .slice(0, +limit!);

  res.send(randomCards);
});

// Start learning progress
app.post("/learnings", async (req, res) => {
  const { user, set, cardsTotal, correct, wrong } = req.body;
  const obj = {
    user,
    set,
    cards_total: +cardsTotal,
    cards_correct: +correct,
    cards_wrong: +wrong,
    score: (+correct / +cardsTotal) * 100,
  };
  const learning = await client.db.learnings.create(obj);
  res.send(learning);
});

// Get user learning progress
app.get("/learnings", async (req, res) => {
  const { user } = req.query;
  if (!user || typeof user !== "string") {
    res.status(400).json({ error: "Invalid user ID" });
    return;
  }

  const learnings = await client.db.learnings
    .select(["*", "set.*"])
    .filter("user", user)
    .getAll();
  res.send(learnings);
});

// Image upload endpoint
const uploadHandler: RequestHandler = async (req, res, next) => {
  try {
    const { image } = req.body;

    console.log("Received upload request");

    if (!image) {
      console.error("No image provided in request");
      res.status(400).json({ error: "No image provided" });
      return next();
    }

    // Log image data length for debugging
    console.log("Image data length:", image.length, "characters");

    if (!image.startsWith("data:")) {
      console.error("Invalid image format, missing data URI prefix");
      res.status(400).json({ error: "Invalid image format" });
      return next();
    }

    console.log("Attempting to upload image to Cloudinary...");
    // Upload image to Cloudinary
    try {
      const uploadResponse = await cloudinary.uploader.upload(image, {
        resource_type: "auto",
      });
      console.log("Upload successful, URL:", uploadResponse.secure_url);

      res.json({
        url: uploadResponse.secure_url,
      });
      return next();
    } catch (cloudinaryError: any) {
      console.error("Cloudinary upload error:", cloudinaryError);
      res.status(500).json({
        error: "Failed to upload image to Cloudinary",
        details: cloudinaryError.message || String(cloudinaryError),
      });
      return next(cloudinaryError);
    }
  } catch (error: any) {
    console.error("Image upload failed:", error);
    res.status(500).json({
      error: "Failed to upload image",
      details: error.message || String(error),
    });
    return next(error);
  }
};

app.post("/upload", uploadHandler);

app.listen(PORT, "0.0.0.0", () => {
  console.log(`App listening on port ${PORT}`);
});
