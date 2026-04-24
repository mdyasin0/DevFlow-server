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
// tasks status change
app.patch("/move-task/:projectId", async (req, res) => {
  try {
    const { projectId } = req.params;
    const { email, from, to, taskId } = req.body;

    if (!email || !from || !to || !taskId) {
      return res.send({
        success: false,
        message: "Missing required fields",
      });
    }

    const project = await projectsCollection.findOne({
      _id: new ObjectId(projectId),
    });

    if (!project) {
      return res.send({ success: false, message: "Project not found" });
    }

    const member = project.teammember.find((m) => m.email === email);

    if (!member) {
      return res.send({ success: false, message: "Member not found" });
    }

    // ✅ এখানে তোমার চাওয়া validation block ADD করা হলো
    const task = member[from]?.find((t) => t.id === taskId);

    if (!task) {
      return res.send({
        success: false,
        message: "Task not found in source array",
      });
    }

    // 🟢 REMOVE from old array
    await projectsCollection.updateOne(
      { _id: new ObjectId(projectId) },
      {
        $pull: {
          [`teammember.$[m].${from}`]: { id: taskId },
        },
      },
      {
        arrayFilters: [{ "m.email": email }],
      }
    );

    // 🟢 ADD to new array
    await projectsCollection.updateOne(
      { _id: new ObjectId(projectId) },
      {
        $push: {
          [`teammember.$[m].${to}`]: task,
        },
      },
      {
        arrayFilters: [{ "m.email": email }],
      }
    );

    res.send({
      success: true,
      message: "Task moved successfully",
    });

  } catch (error) {
    res.status(500).send({
      success: false,
      message: error.message,
    });
  }
});
// joined team data get by user email
app.get("/my-projects/:email", async (req, res) => {
  try {
    const email = req.params.email.toLowerCase();

    const projects = await projectsCollection
      .find({
        "teammember.email": email,
      })
      .toArray();

    res.send({
      success: true,
      data: projects,
    });
  } catch (error) {
    res.status(500).send({
      success: false,
      message: error.message,
    });
  }
});
// member remove with invite email 
app.delete("/remove-member/:projectId/:email", async (req, res) => {
  try {
    const { projectId, email } = req.params;

    const decodedEmail = decodeURIComponent(email);

    const result = await projectsCollection.updateOne(
      { _id: new ObjectId(projectId) },
      {
        $pull: {
          teammember: { email: decodedEmail },
          invite_email: { email: decodedEmail },
        },
      }
    );

    res.send({
      success: true,
      message: "Member removed from team & invites",
      result,
    });
  } catch (error) {
    res.status(500).send({
      success: false,
      message: error.message,
    });
  }
});
// remove that invite email which status are inpending or reject

app.delete("/remove-invite/:id/:email", async (req, res) => {
  const { id } = req.params;
  const email = decodeURIComponent(req.params.email); // ✅ important

  try {
    const result = await projectsCollection.updateOne(
      { _id: new ObjectId(id) },
      {
        $pull: {
          invite_email: { email: email },
        },
      }
    );

    console.log("DELETE RESULT:", result);

    res.send({ success: true, result });
  } catch (err) {
    res.status(500).send({ success: false, error: err.message });
  }
});
// UPDATE task
app.patch("/update-task/:projectId", async (req, res) => {
  try {
    const { projectId } = req.params;
    const { email, type, taskId, text } = req.body;

    const result = await projectsCollection.updateOne(
      { _id: new ObjectId(projectId) },
      {
        $set: {
          [`teammember.$[m].${type}.$[t].text`]: text.replace(/\n/g, "<br/>"),
        },
      },
      {
        arrayFilters: [
          { "m.email": email },
          { "t.id": taskId },
        ],
      }
    );

    res.send({ success: true, message: "Updated" });
  } catch (err) {
    res.send({ success: false, message: err.message });
  }
});
// DELETE task
app.delete("/delete-task/:projectId", async (req, res) => {
  try {
    const { projectId } = req.params;
    const { email, type, taskId } = req.body;

    const result = await projectsCollection.updateOne(
      { _id: new ObjectId(projectId) },
      {
        $pull: {
          [`teammember.$[m].${type}`]: { id: taskId },
        },
      },
      {
        arrayFilters: [{ "m.email": email }],
      }
    );

    res.send({ success: true, message: "Deleted" });
  } catch (err) {
    res.send({ success: false, message: err.message });
  }
});
// work assign
app.patch("/add-task/:projectId", async (req, res) => {
  try {
    const { projectId } = req.params;
    const { email, text } = req.body;

    if (!email || !text) {
      return res.send({
        success: false,
        message: "Missing data",
      });
    }

    // 🔥 task object বানানো
    const newTask = {
      id: Date.now().toString(),
      text: text, // line break frontend e handle korbi
      createdAt: new Date(),
    };

    const result = await projectsCollection.updateOne(
      {
        _id: new ObjectId(projectId),
        "teammember.email": email,
      },
      {
        $push: {
          "teammember.$.todo": newTask,
        },
      }
    );

    res.send({
      success: true,
      message: "Task added successfully",
      data: newTask,
    });
  } catch (error) {
    res.send({
      success: false,
      message: error.message,
    });
  }
});

// GET invited projects by user email
app.get("/my-invitations/:email", async (req, res) => {
  try {
    const email = req.params.email.toLowerCase();

    const projects = await projectsCollection
      .find({
        "invite_email.email": email,
      })
      .toArray();

    res.send({
      success: true,
      data: projects,
    });
  } catch (error) {
    res.send({
      success: false,
      message: error.message,
    });
  }
});

// Update invitation status (approved/rejected) with add team member if approved
app.patch("/invite-status/:projectId", async (req, res) => {
  try {
    const { projectId } = req.params;
    const { email, status , name} = req.body;

    if (!email || !status) {
      return res.send({ success: false, message: "Missing data" });
    }

    const project = await projectsCollection.findOne({
      _id: new ObjectId(projectId),
    });

    const invite = project.invite_email.find(
      (i) => i.email.toLowerCase() === email.toLowerCase()
    );

    if (!invite) {
      return res.send({
        success: false,
        message: "Invitation not found",
      });
    }

    // already selected হলে block
    if (invite.status !== "pending") {
      return res.send({
        success: false,
        message: "You already selected an option",
      });
    }

    // 1. update invite status
    await projectsCollection.updateOne(
      {
        _id: new ObjectId(projectId),
        "invite_email.email": email,
      },
      {
        $set: {
          "invite_email.$.status": status,
        },
      }
    );

    // 2. যদি approved হয় → teammember এ add
    if (status === "approved") {
      await projectsCollection.updateOne(
        { _id: new ObjectId(projectId) },
        {
          $push: {
            teammember: {
              email: email,
              name: name,
              todo: [],
              running: [],
              done: [],
            },
          },
        }
      );
    }

    res.send({
      success: true,
      message: `Invitation ${status}`,
    });
  } catch (error) {
    res.send({
      success: false,
      message: error.message,
    });
  }
});


// invite email send and save email and status 

const nodemailer = require("nodemailer");

app.post("/invite/:id", async (req, res) => {
  try {
    const projectId = req.params.id;
    const { email } = req.body;

    if (!email) {
      return res.send({ success: false, message: "Email required" });
    }

    // 1. project find কর
    const project = await projectsCollection.findOne({
      _id: new ObjectId(projectId),
    });

    // 2. check already invited কিনা
    const existingInvite = project.invite_email.find(
      (item) => item.email === email
    );

    if (existingInvite) {
      // status অনুযায়ী message
      if (existingInvite.status === "pending") {
        return res.send({
          success: false,
          message:
            "Already invitation sent. Please tell your team member to accept the invitation.",
        });
      }

      if (existingInvite.status === "approved") {
        return res.send({
          success: false,
          message: "This member already joined your team.",
        });
      }

      if (existingInvite.status === "rejected") {
        return res.send({
          success: false,
          message:
            "User already rejected the invitation. If you want to send again by this email, delete the email from invitation list first.",
        });
      }
    }

    // 3. DB save
    await projectsCollection.updateOne(
      { _id: new ObjectId(projectId) },
      {
        $push: {
          invite_email: {
            email: email,
            status: "pending",
          },
        },
      }
    );

    // 4. email send
    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: "mdyasin01928364@gmail.com",
        pass: process.env.EMAIL_PASS,
      },
    });

    await transporter.sendMail({
      from: '"DevFlow" <your_email@gmail.com>',
      to: email,
      subject: "Project Invitation",
      html: `
        <h3>You have been invited to a project</h3>
        <a href="http://localhost:5173/invite/${projectId}">
          Join Project
        </a>
      `,
    });

    res.send({
      success: true,
      message: "Invite sent & saved",
    });

  } catch (error) {
    res.send({
      success: false,
      message: error.message,
    });
  }
});

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
      invite_email:[],
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
// user data get by email
app.get("/user/:email", async (req, res) => {
  try {
    const email = req.params.email;

    const user = await usersCollection.findOne({
      email: email,
    });

    if (!user) {
      return res.send({
        success: false,
        message: "User not found",
      });
    }

    res.send({
      success: true,
      data: user,
    });
  } catch (error) {
    res.send({
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
