require("dotenv").config();

const express = require("express");
const cors = require("cors");

const app = express();

const PORT = process.env.PORT || 5000;

// middleware
app.use(cors());
app.use(express.json());

// test route
app.get("/", (req, res) => {
  res.send("DevFlow-server running...");
});

const { MongoClient, ServerApiVersion } = require("mongodb");
const uri = process.env.MONGO_URI;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    await client.connect();

    // database collections
    const database = client.db("DevFlow");
    usersCollection = database.collection("users");
    const projectsCollection = database.collection("projects");

const { ObjectId } = require("mongodb");

    // get single project by id 
    app.get("/project/:id", async (req, res) => {
  try {
    const id = req.params.id;

    const query = { _id: new ObjectId(id) };

    const result = await projectsCollection.findOne(query);

    res.send({
      success: true,
      data: result,
    });
  } catch (error) {
    res.status(500).send({
      success: false,
      message: error.message,
    });
  }
});
// created project get
app.get("/projects/:email", async (req, res) => {
  try {
    const email = req.params.email;

    const query = { created_by: email };

    const result = await projectsCollection.find(query).toArray();

    res.send({
      success: true,
      data: result,
    });
  } catch (error) {
    res.status(500).send({
      success: false,
      message: error.message,
    });
  }
});
    // project save

    app.post("/projects", async (req, res) => {
  try {
    const { teamName, projectTitle, email } = req.body;

    if (!teamName || !projectTitle || !email) {
      return res.status(400).send({
        success: false,
        message: "All fields are required",
      });
    }

    const project = {
      teamName,
      projectTitle,
      created_by: email,
      created_time: new Date(),
      teammember: [],
    };

    const result = await projectsCollection.insertOne(project);

    res.send({
      success: true,
      message: "Project created successfully",
      data: result,
    });
  } catch (error) {
    res.status(500).send({
      success: false,
      message: error.message,
    });
  }
});

    // users data save
    app.post("/users", async (req, res) => {
      try {
        const { name, email, role } = req.body;

        const user = {
          name,
          email,
          role: role || "developer", // default role
          createdAt: new Date(),
        };

        const result = await usersCollection.insertOne(user);

        res.send({
          success: true,
          message: "User registered successfully",
          data: result,
        });
      } catch (error) {
        res.status(500).send({
          success: false,
          message: error.message,
        });
      }
    });

    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!",
    );
  } catch (err) {
    console.log(err);
  }
}
run();

// server start
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
