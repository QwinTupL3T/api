"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const dotenv_1 = __importDefault(require("dotenv"));
const express_1 = __importDefault(require("express"));
const xata_1 = require("./xata");
const seed_database_1 = require("./seed_database");
const cloudinary_1 = require("cloudinary");
dotenv_1.default.config();
// Configure Cloudinary
cloudinary_1.v2.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
});
const PORT = parseInt(process.env.PORT || "3000", 10);
const app = (0, express_1.default)();
app.use(express_1.default.json({ limit: "50mb" }));
const client = new xata_1.XataClient({
    apiKey: process.env.XATA_API_KEY,
    branch: process.env.XATA_BRANCH || "main",
});
app.get("/init", (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        yield client.db.sets.create(seed_database_1.sets);
        yield client.db.cards.create(seed_database_1.cardsCapitals);
        yield client.db.cards.create(seed_database_1.cardsProgramming);
        res.send({ ok: true });
    }
    catch (err) {
        console.error(err);
        res.status(500).json({ error: "Seeding failed" });
    }
}));
//Get all sets
app.get("/sets", (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const sets = yield client.db.sets
        .select(["xata_id", "title", "description", "image_link", "cards"])
        .filter({ private: false })
        .getAll();
    res.send(sets);
}));
//Get a single set
app.get("/sets/:id", (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { id } = req.params;
    const set = yield client.db.sets.read(id);
    res.send(set);
}));
// Create a new set
app.post("/sets", (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { title, description, private: isPrivate, creator, imageLink, // renamed to "imageLink" on the client side
     } = req.body;
    try {
        const newSet = yield client.db.sets.create({
            title,
            description,
            private: isPrivate,
            creator,
            image_link: imageLink || null, // ← write to image_link column
        });
        res.status(201).json(newSet);
    }
    catch (err) {
        console.error("Failed to create set:", err);
        res.status(500).json({ error: "Failed to create set" });
    }
}));
// Add a set to user favorites
app.post("/usersets", (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { user, set } = req.body;
    const userSet = yield client.db.user_sets.create({
        user,
        set,
    });
    res.send(userSet);
}));
// Get all user sets
app.get("/usersets", (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { user } = req.query;
    const sets = yield client.db.user_sets
        .select(["xata_id", "set.*"])
        .filter({ user: `${user}` })
        .getAll();
    res.send(sets);
}));
// Remove a set
app.delete("/sets/:id", (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { id } = req.params;
    const existingSets = yield client.db.user_sets.filter({ set: id }).getAll();
    if (existingSets.length > 0) {
        const toDelete = existingSets.map((set) => set.xata_id);
        yield client.db.user_sets.delete(toDelete);
    }
    yield client.db.sets.delete(id);
    res.send({ success: true });
}));
// Create a new card
app.post("/cards", (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { set, question, answer } = req.body;
    const card = yield client.db.cards.create({
        set,
        question,
        answer,
    });
    if (card) {
        yield client.db.sets.update(set, {
            cards: {
                $increment: 1,
            },
        });
    }
    res.send(card);
}));
// Get all cards of a set
app.get("/cards", (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { setid } = req.query;
    const cards = yield client.db.cards
        .select(["*", "set.*"])
        .filter({ set: setid })
        .getAll();
    res.send(cards);
}));
// Learn a specific number of cards from a set
app.get("/cards/learn", (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { setid, limit } = req.query;
    const cards = yield client.db.cards
        .select(["question", "answer", "image_link"])
        .filter({ set: setid })
        .getAll();
    // Get a random set of cards using limit
    const randomCards = cards
        .map((value) => ({ value, sort: Math.random() }))
        .sort((a, b) => a.sort - b.sort)
        .map(({ value }) => value)
        .slice(0, +limit);
    res.send(randomCards);
}));
// Start learning progress
app.post("/learnings", (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { user, set, cardsTotal, correct, wrong } = req.body;
    const obj = {
        user,
        set,
        cards_total: +cardsTotal,
        cards_correct: +correct,
        cards_wrong: +wrong,
        score: (+correct / +cardsTotal) * 100,
    };
    const learning = yield client.db.learnings.create(obj);
    res.send(learning);
}));
// Get user learning progress
app.get("/learnings", (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { user } = req.query;
    const learnings = yield client.db.learnings
        .select(["*", "set.*"])
        .filter({ user: `${user}` })
        .getAll();
    res.send(learnings);
}));
// Image upload endpoint
const uploadHandler = (req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { image } = req.body;
        if (!image) {
            res.status(400).json({ error: "No image provided" });
            return next();
        }
        console.log("Attempting to upload image to Cloudinary...");
        // Upload image to Cloudinary
        const uploadResponse = yield cloudinary_1.v2.uploader.upload(image, {
            resource_type: "auto",
        });
        console.log("Upload successful, URL:", uploadResponse.secure_url);
        res.json({
            url: uploadResponse.secure_url,
        });
        return next();
    }
    catch (error) {
        console.error("Image upload failed:", error);
        res.status(500).json({ error: "Failed to upload image" });
        return next(error);
    }
});
app.post("/upload", uploadHandler);
app.listen(PORT, () => {
    console.log(`App listening on port ${PORT}`);
});
//# sourceMappingURL=index.js.map