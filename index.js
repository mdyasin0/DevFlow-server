require("dotenv").config();

const express = require("express");
const cors = require("cors");

const app = express();
const http = require("http");
const server = http.createServer(app);
const { Server } = require("socket.io");
const PORT = process.env.PORT || 5000;
const io = new Server(server, {
  cors: {
    origin: "*", // production এ specific domain দিবা
    methods: ["GET", "POST", "PATCH", "DELETE"],
  },
});


io.on("connection", (socket) => {
  console.log("User connected:", socket.id);

  // user join room (IMPORTANT for notification)
socket.on("join", (userId) => {
  socket.join(userId.toString());
  console.log("User joined room:", userId);
});

  socket.on("disconnect", () => {
    console.log("User disconnected:", socket.id);
  });
});


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
    const notificationsCollection = database.collection("notifications");

    const { ObjectId } = require("mongodb");


    // user bloack
    app.patch("/users/block/:id", async (req, res) => {
  try {
    const id = req.params.id;

    const result = await usersCollection.updateOne(
      { _id: new ObjectId(id) },
      {
        $set: {
          isBlocked: true,
          updatedAt: new Date(),
        },
      }
    );

    res.send({
      success: true,
      message: "User blocked successfully",
      data: result,
    });
  } catch (error) {
    res.send({
      success: false,
      message: error.message,
    });
  }
});

// user unbloack
app.patch("/users/unblock/:id", async (req, res) => {
  try {
    const id = req.params.id;

    const result = await usersCollection.updateOne(
      { _id: new ObjectId(id) },
      {
        $set: {
          isBlocked: false,
          updatedAt: new Date(),
        },
      }
    );

    res.send({
      success: true,
      message: "User unblocked successfully",
      data: result,
    });
  } catch (error) {
    res.send({
      success: false,
      message: error.message,
    });
  }
});
// users role change
app.patch("/users/role/:id", async (req, res) => {
  try {
    const id = req.params.id;
    const { role } = req.body;

    const result = await usersCollection.updateOne(
      { _id: new ObjectId(id) },
      {
        $set: { role: role },
      }
    );

    res.send({
      success: true,
      message: "Role updated successfully",
      result,
    });
  } catch (error) {
    res.send({
      success: false,
      message: error.message,
    });
  }
});

// user data get by email
app.get("/users/:email", async (req, res) => {
  try {
    const email = req.params.email;

    const user = await usersCollection.findOne({ email });

    if (!user) {
      return res.status(404).send({
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
// all not block user get
app.get("/approved_users", async (req, res) => {
  try {
    const users = await usersCollection
      .find({ isBlocked: false })
      .toArray();

    res.send({
      success: true,
      data: users,
    });
  } catch (error) {
    res.status(500).send({
      success: false,
      message: error.message,
    });
  }
});
// send email all inactive users 


app.post("/email/send-inactive", async (req, res) => {
  try {
    const { subject, message } = req.body;

    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const inactiveUsers = await usersCollection
      .find({
        isBlocked: false,
        lastActiveAt: { $lt: sevenDaysAgo },
      })
      .toArray();

    const emails = inactiveUsers.map((u) => u.email);

    // nodemailer setup
    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: "mdyasin01928364@gmail.com",
        pass: process.env.EMAIL_PASS,
      },
    });

    await transporter.sendMail({
      from: process.env.EMAIL,
      to: emails,
      subject,
      html: message,
    });

    res.send({
      success: true,
      message: "Email sent to inactive users",
      total: emails.length,
    });
  } catch (error) {
    res.status(500).send({
      success: false,
      message: error.message,
    });
  }
});
    // all users
    app.get("/users", async (req, res) => {
  try {
    const users = await usersCollection.find().toArray();

    res.send({
      success: true,
      data: users,
    });
  } catch (error) {
    res.send({
      success: false,
      message: error.message,
    });
  }
});
// project status update notification save socket .io added
app.patch("/projects/:id/status", async (req, res) => {
  try {
    const id = req.params.id;
    const { status, updatedBy } = req.body;

    if (!status) {
      return res.status(400).send({
        success: false,
        message: "Status is required",
      });
    }

    const allowedStatus = ["pending", "approved", "rejected"];
    if (!allowedStatus.includes(status)) {
      return res.status(400).send({
        success: false,
        message: "Invalid status value",
      });
    }

    // 🔥 1. project find
    const project = await projectsCollection.findOne({
      _id: new ObjectId(id),
    });

    if (!project) {
      return res.status(404).send({
        success: false,
        message: "Project not found",
      });
    }

    // 🔥 2. update status
    await projectsCollection.updateOne(
      { _id: new ObjectId(id) },
      { $set: { status } }
    );

    // 🔥 3. message set
    let message = "";
    if (status === "approved") {
      message = "Your project has been approved";
    } else if (status === "rejected") {
      message =
        "Your project rejected. Please create project based on rules and regulations";
    } else {
      message = "Project status updated";
    }

    // 🔥 4. receiver user find
    const receiverUser = await usersCollection.findOne({
      email: project.created_by,
    });

    if (!receiverUser?._id) {
      return res.status(404).send({
        success: false,
        message: "Receiver user not found",
      });
    }

    // 🔥 5. notification object (UPDATED ✅)
    const notification = {
      type: "project_status_updated",
      message,

      receiverId: receiverUser._id,           // আগের মতোই থাকবে
      receiverEmail: receiverUser.email,     // 🔥 NEW FIELD

      url: "/developer_dashboard/created_project",

      created_by: updatedBy,
      created_time: new Date(),
      read: false,
    };

    // 🔥 6. save
    const result = await notificationsCollection.insertOne(notification);

    const fullNotification = {
      _id: result.insertedId,
      ...notification,
    };

    // 🔥 7. socket send
    io.to(receiverUser._id.toString()).emit(
      "newNotification",
      fullNotification
    );

    res.send({
      success: true,
      message: `Project ${status} successfully`,
    });

  } catch (error) {
    res.status(500).send({
      success: false,
      message: error.message,
    });
  }
});
// all projects
app.get("/projects", async (req, res) => {
  try {
    const projects = await projectsCollection.find().toArray();

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
// Send Email API (Nodemailer)


app.post("/send-email", async (req, res) => {
  try {
    const { emails, subject, message } = req.body;

    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: "mdyasin01928364@gmail.com",
        pass: process.env.EMAIL_PASS,
      },
    });

    const mailOptions = {
      from: "mdyasin01928364@gmail.com",
      to: emails, // array
      subject: subject,
      html: message, // rich text support
    };

    await transporter.sendMail(mailOptions);

    res.send({
      success: true,
      message: "Email sent successfully",
    });
  } catch (error) {
    res.send({
      success: false,
      message: error.message,
    });
  }
});
    // created project update
 app.put("/projects/:id", async (req, res) => {
  try {
    const id = req.params.id;
    const { teamName, projectTitle, description } = req.body;

    // 👉 project data আগে নিয়ে আসো
    const project = await projectsCollection.findOne({
      _id: new ObjectId(id),
    });

    if (!project) {
      return res.status(404).send({
        success: false,
        message: "Project not found",
      });
    }

    const filter = { _id: new ObjectId(id) };

    const updateDoc = {
      $set: {
        teamName,
        projectTitle,
        description,
      },
    };

    const result = await projectsCollection.updateOne(filter, updateDoc);

    // 👉 শুধু team member email (created_by বাদ)
    const memberEmails = project.teammember.map((m) => m.email);

    // 👉 users collection থেকে সব user আনো
    const users = await usersCollection
      .find({ email: { $in: memberEmails } })
      .toArray();

    // 👉 email → userId map
    const userMap = {};
    users.forEach((u) => {
      userMap[u.email] = u._id;
    });

    // 👉 bulk notification তৈরি
    const notifications = memberEmails.map((email) => ({
      type: "update_team_project_information",
      message: "Manager updated team project information",
      receiverId: userMap[email],
      receiverEmail: email,
      url: `/developer_dashboard/joined_team_details/${id}`,
      created_by: project.created_by,
      created_time: new Date(),
      read: false,
    }));

    // 👉 insertMany
    if (notifications.length > 0) {
      await notificationsCollection.insertMany(notifications);
    }

    res.send({
      success: true,
      message: "Project updated successfully",
      data: result,
    });
  } catch (error) {
    res.status(500).send({
      success: false,
      message: error.message,
    });
  }
});
    // reopen , move done to running
  app.patch("/reopen-task/:projectId", async (req, res) => {
  try {
    const { projectId } = req.params;
    const { email, taskId } = req.body;

    if (!email || !taskId) {
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

    // 👉 user থেকে receiverId আনো
    const user = await usersCollection.findOne({ email: email });

    // 👉 find task in done
    const task = member.done?.find((t) => t.id === taskId);

    if (!task) {
      return res.send({
        success: false,
        message: "Task not found in done",
      });
    }

    // 👉 remove from done
    await projectsCollection.updateOne(
      { _id: new ObjectId(projectId) },
      {
        $pull: {
          "teammember.$[m].done": { id: taskId },
        },
      },
      { arrayFilters: [{ "m.email": email }] }
    );

    // 👉 remove submittedAt when reopening
    const updatedTask = { ...task };
    delete updatedTask.submittedAt;

    // 👉 push to running
    await projectsCollection.updateOne(
      { _id: new ObjectId(projectId) },
      {
        $push: {
          "teammember.$[m].running": updatedTask,
        },
      },
      { arrayFilters: [{ "m.email": email }] }
    );

    // 👉 notification তৈরি
    const notification = {
      type: "reopened_task",
      message:
        "Manager reopen your task and your task moved from done to running status",
      receiverId: user?._id,
      receiverEmail: email,
      url: `/developer_dashboard/joined_team_details/${projectId}`, // ✅ dynamic
      created_by: project.created_by,
      created_time: new Date(),
      read: false,
    };

    await notificationsCollection.insertOne(notification);

    return res.send({
      success: true,
      message: "Task reopened successfully",
    });
  } catch (err) {
    return res.status(500).send({
      success: false,
      message: err.message,
    });
  }
});
    // delete project

  app.delete("/projects/:id", async (req, res) => {
  try {
    const id = req.params.id;

    // 👉 project data আগে নিয়ে আসো
    const project = await projectsCollection.findOne({
      _id: new ObjectId(id),
    });

    if (!project) {
      return res.status(404).send({
        success: false,
        message: "Project not found",
      });
    }

    // 👉 delete project
    const result = await projectsCollection.deleteOne({
      _id: new ObjectId(id),
    });

    if (result.deletedCount === 1) {
      // 👉 team member list থেকে created_by বাদ দাও
      const members = project.teammember.filter(
        (m) => m.email !== project.created_by
      );

      // 👉 সব member এর user data একসাথে আনো
      const emails = members.map((m) => m.email);

      const users = await usersCollection
        .find({ email: { $in: emails } })
        .toArray();

      // 👉 email → user map বানাও
      const userMap = {};
      users.forEach((u) => {
        userMap[u.email] = u._id;
      });

      // 👉 bulk notification array বানাও
      const notifications = members.map((member) => ({
        type: "team_project_delete",
        message: "Manager delete the team project",
        receiverId: userMap[member.email],
        receiverEmail: member.email,
        url: "/developer_dashboard/joined_team",
        created_by: project.created_by,
        created_time: new Date(),
        read: false,
      }));

      // 👉 একবারে insert (performance better 🚀)
      if (notifications.length > 0) {
        await notificationsCollection.insertMany(notifications);
      }

      return res.send({
        success: true,
        message: "Project deleted successfully",
      });
    }

    res.status(404).send({
      success: false,
      message: "Project not found",
    });
  } catch (error) {
    res.status(500).send({
      success: false,
      message: error.message,
    });
  }
});
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

        const allowedMoves = {
          todo: ["running"],
          running: ["done"],
          done: [],
        };

        if (!allowedMoves[from]?.includes(to)) {
          return res.send({
            success: false,
            message: `Invalid move ${from} → ${to}`,
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

        const task = member[from]?.find((t) => t.id === taskId);

        if (!task) {
          return res.send({ success: false, message: "Task not found" });
        }

        // remove from old status
        await projectsCollection.updateOne(
          { _id: new ObjectId(projectId) },
          {
            $pull: {
              [`teammember.$[m].${from}`]: { id: taskId },
            },
          },
          { arrayFilters: [{ "m.email": email }] },
        );

        // prepare updated task
        const updatedTask = {
          ...task,
        };

        // ADD SUBMIT TIME ONLY WHEN DONE
        if (to === "done") {
          updatedTask.submittedAt = new Date().toISOString();
        }

        // push to new status
        await projectsCollection.updateOne(
          { _id: new ObjectId(projectId) },
          {
            $push: {
              [`teammember.$[m].${to}`]: updatedTask,
            },
          },
          { arrayFilters: [{ "m.email": email }] },
        );

        return res.send({
          success: true,
          message: "Task moved successfully",
        });
      } catch (err) {
        return res.status(500).send({
          success: false,
          message: err.message,
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

    // 🔥 1. project find (for created_by)
    const project = await projectsCollection.findOne({
      _id: new ObjectId(projectId),
    });

    // 🔥 2. remove member (existing logic unchanged)
    const result = await projectsCollection.updateOne(
      { _id: new ObjectId(projectId) },
      {
        $pull: {
          teammember: { email: decodedEmail },
          invite_email: { email: decodedEmail },
        },
      }
    );

    // 🔥 3. receiver user must exist
    const receiverUser = await usersCollection.findOne({
      email: decodedEmail,
    });

    // 🔥 4. notification (NO NULL receiverId)
    const notification = {
      type: "removemember",
      message: "Manager removed you from their team",

      receiverId: receiverUser._id, // 🔥 ALWAYS REQUIRED
      receiverEmail: receiverUser.email,

      url: "/developer_dashboard/joined_team",

      created_by: project.created_by,
      created_time: new Date(),
      read: false,
    };

    // 🔥 5. save notification
    await notificationsCollection.insertOne(notification);

    // 🔥 6. realtime
    io.to(receiverUser._id.toString()).emit(
      "newNotification",
      notification
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
          },
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

    // 👉 project data (created_by দরকার)
    const project = await projectsCollection.findOne({
      _id: new ObjectId(projectId),
    });

    if (!project) {
      return res.send({
        success: false,
        message: "Project not found",
      });
    }

    // 👉 user থেকে receiverId আনো
    const user = await usersCollection.findOne({ email: email });

    // 👉 task update
    const result = await projectsCollection.updateOne(
      { _id: new ObjectId(projectId) },
      {
        $set: {
          [`teammember.$[m].${type}.$[t].text`]: text.replace(
            /\n/g,
            "<br/>"
          ),
        },
      },
      {
        arrayFilters: [{ "m.email": email }, { "t.id": taskId }],
      }
    );

    // 👉 notification তৈরি
    const notification = {
      type: "updated_task",
      message: "Manager update your task",
      receiverId: user?._id,
      receiverEmail: email,
      url: `/developer_dashboard/joined_team_details/${projectId}`,
      created_by: project.created_by,
      created_time: new Date(),
      read: false,
    };

    await notificationsCollection.insertOne(notification);

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

    // 👉 project data আনো (created_by দরকার)
    const project = await projectsCollection.findOne({
      _id: new ObjectId(projectId),
    });

    if (!project) {
      return res.send({
        success: false,
        message: "Project not found",
      });
    }

    // 👉 user থেকে receiverId আনো
    const user = await usersCollection.findOne({ email: email });

    // 👉 task delete
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

    // 👉 notification তৈরি
    const notification = {
      type: "task_delete",
      message: "Manager delete your task",
      receiverId: user?._id,
      receiverEmail: email,
      url: `/developer_dashboard/joined_team_details/${projectId}`,
      created_by: project.created_by,
      created_time: new Date(),
      read: false,
    };

    await notificationsCollection.insertOne(notification);

    res.send({ success: true, message: "Deleted" });
  } catch (err) {
    res.send({ success: false, message: err.message });
  }
});
    // work assign
  app.patch("/add-task/:projectId", async (req, res) => {
  try {
    const { projectId } = req.params;
    const { email, text, deadline, priority } = req.body;

    if (!email || !text || !deadline || !priority) {
      return res.send({
        success: false,
        message: "Missing data",
      });
    }

    const newTask = {
      id: Date.now().toString(),
      text,
      deadline: new Date(deadline),
      priority,
      createdAt: new Date(),
    };

    // 👉 project data get (notification এর জন্য)
    const project = await projectsCollection.findOne({
      _id: new ObjectId(projectId),
    });

    if (!project) {
      return res.send({
        success: false,
        message: "Project not found",
      });
    }

    // 👉 assigned member find
    const assignedMember = project.teammember.find(
      (member) => member.email === email
    );

    if (!assignedMember) {
      return res.send({
        success: false,
        message: "Member not found",
      });
    }

    // 👉 user collection থেকে receiverId আনো
    const user = await usersCollection.findOne({ email: email });

    // 👉 task add
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

    // 👉 notification তৈরি
    const notification = {
      type: "work_assign",
      message: "Manager assigned a new task",
      receiverId: user?._id,
      receiverEmail: email,
      url: `/developer_dashboard/joined_team_details/${projectId}`,
      created_by: project.created_by,
      created_time: new Date(),
      read: false,
    };

    await notificationsCollection.insertOne(notification);

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
    const { email, status, name } = req.body;

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

    // 🔥 3. NOTIFICATION LOGIC ADD

    // project owner (receiver)
    const receiverUser = await usersCollection.findOne({
      email: project.created_by,
    });

    // message set
    let message = "";
    if (status === "approved") {
      message = "A new member join to our team";
    } else if (status === "rejected") {
      message = "User reject your invitation";
    }

    const notification = {
      type: "invitation_status_updated",
      message,

      receiverId: receiverUser?._id || null,
      receiverEmail: project.created_by,

      url: `/developer_dashboard/created_project_details/${projectId}`,

      created_by: email, // যিনি action নিলেন
      created_time: new Date(),
      read: false,
    };

    await notificationsCollection.insertOne(notification);

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

    // 1. project find
    const project = await projectsCollection.findOne({
      _id: new ObjectId(projectId),
    });

    // 2. check already invited কিনা
    const existingInvite = project.invite_email.find(
      (item) => item.email === email
    );

    if (existingInvite) {
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

    // 3. DB save (invite list)
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

    // 🔥 4. CHECK USER EXIST (for notification)
    const receiverUser = await usersCollection.findOne({ email });

    // 🔥 5. CREATE NOTIFICATION
    const notification = {
      type: "invitation_send",
      message: "A team manager invited you to their team",

      receiverId: receiverUser?._id || null, // user থাকলে id, না থাকলে null
      receiverEmail: email, // যাকে invite করা হচ্ছে

      url: "/developer_dashboard/invitations",

      created_by: project.created_by, // project owner email
      created_time: new Date(),
      read: false,
    };

    await notificationsCollection.insertOne(notification);

    // 🔥 6. email send (existing)
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
    // created project get only approved project
   app.get("/projects/:email", async (req, res) => {
  try {
    const email = req.params.email;

    const query = {
      created_by: email,
      status: "approved", // 👈 main fix
    };

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
// get notifications by user id
app.get("/notifications", async (req, res) => {
  try {
    const email = req.query.email; // login user email

    if (!email) {
      return res.send({
        success: false,
        message: "Email is required",
      });
    }

    // 👉 user collection থেকে user বের করো
    const user = await usersCollection.findOne({ email });

    if (!user) {
      return res.send({
        success: false,
        message: "User not found",
      });
    }

    // 👉 userId দিয়ে notification filter
    const notifications = await notificationsCollection
      .find({ receiverId: user._id })
      .sort({ created_time: -1 })
      .toArray();

    res.send({
      success: true,
      data: notifications,
    });
  } catch (error) {
    res.status(500).send({
      success: false,
      message: error.message,
    });
  }
});
// toggle nptification read /unread
app.patch("/notifications/:id/toggle-read", async (req, res) => {
  try {
    const id = req.params.id;

    const notification = await notificationsCollection.findOne({
      _id: new ObjectId(id),
    });

    if (!notification) {
      return res.send({
        success: false,
        message: "Notification not found",
      });
    }

    const result = await notificationsCollection.updateOne(
      { _id: new ObjectId(id) },
      {
        $set: {
          read: !notification.read,
        },
      }
    );

    res.send({
      success: true,
      message: notification.read
        ? "Marked as unread"
        : "Marked as read",
    });
  } catch (error) {
    res.status(500).send({
      success: false,
      message: error.message,
    });
  }
});
// DELETE NOTIFICATION
app.delete("/notifications/:id", async (req, res) => {
  try {
    const id = req.params.id;

    const result = await notificationsCollection.deleteOne({
      _id: new ObjectId(id),
    });

    if (result.deletedCount === 0) {
      return res.send({
        success: false,
        message: "Notification not found",
      });
    }

    res.send({
      success: true,
      message: "Notification deleted successfully",
    });
  } catch (error) {
    res.status(500).send({
      success: false,
      message: error.message,
    });
  }
});
    // project save with socket.io and notifiaction

app.post("/projects", async (req, res) => {
  try {
    const { teamName, projectTitle, description, email } = req.body;

    if (!teamName || !projectTitle || !description || !email) {
      return res.status(400).send({
        success: false,
        message: "All fields are required",
      });
    }

    // 🔥 1. CREATE PROJECT
    const project = {
      teamName,
      projectTitle,
      description,
      created_by: email,
      created_time: new Date(),
      status: "pending",
      teammember: [],
      invite_email: [],
    };

    const result = await projectsCollection.insertOne(project);

    const newProject = {
      _id: result.insertedId,
      ...project,
    };

    // 🔥 2. GET ALL ADMINS
    const admins = await usersCollection
      .find({ role: "admin" })
      .toArray();

    if (admins.length === 0) {
      return res.send({
        success: true,
        message: "Project created (no admin to notify)",
        data: result,
      });
    }

    // 🔥 3. CREATE NOTIFICATIONS FOR EACH ADMIN
    const notifications = admins.map((admin) => ({
      type: "project_created",
      message: "A project created, check for approval",

      receiverId: admin._id,
      receiverEmail: admin.email, // 🔥 NEW FIELD ADDED

      url: "/admin_dashboard_layout/project_monitoring",

      created_by: email,
      created_time: new Date(),
      read: false,
    }));

    // 🔥 4. SAVE ALL NOTIFICATIONS
    const saved = await notificationsCollection.insertMany(notifications);

    // 🔥 5. REALTIME SOCKET (TARGETED)
    admins.forEach((admin) => {
      io.to(admin._id.toString()).emit("newNotification", {
        type: "project_created",
        message: "A project created, check for approval",
        receiverId: admin._id,
        receiverEmail: admin.email, // 🔥 NEW FIELD ADDED
        url: "/admin_dashboard_layout/project_monitoring",
        created_by: email,
        created_time: new Date(),
        read: false,
      });
    });

    // 🔥 PROJECT SOCKET (optional)
    io.emit("newProject", newProject);

    // 🔥 RESPONSE
    res.send({
      success: true,
      message: "Project created & admins notified",
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
    const { name, email } = req.body;

    if (!email) {
      return res.status(400).send({
        success: false,
        message: "Email is required",
      });
    }

    const existingUser = await usersCollection.findOne({ email });

    let updateDoc;

    if (existingUser) {
      // 🔥 ONLY UPDATE NAME + updatedAt
      updateDoc = {
        $set: {
          name: name || existingUser.name || "No Name",
          updatedAt: new Date(),
        },
      };
    } else {
      // 🆕 NEW USER
      updateDoc = {
        $set: {
          name: name || "No Name",
          role: "developer",
          updatedAt: new Date(),
        },
        $setOnInsert: {
          email,
          createdAt: new Date(),
          isBlocked: false,
          lastActiveAt: new Date(),
        },
      };
    }

    const result = await usersCollection.updateOne(
      { email },
      updateDoc,
      { upsert: true }
    );

    res.send({
      success: true,
      message: "User synced successfully",
      data: result,
    });
  } catch (error) {
    res.status(500).send({
      success: false,
      message: error.message,
    });
  }
});
    // update user data as profile update

    app.patch("/users/:email", async (req, res) => {
      try {
        const email = req.params.email;
        const { name } = req.body; // ❌ photo removed

        const result = await usersCollection.updateOne(
          { email },
          {
            $set: {
              name,
              updatedAt: new Date(),
            },
          },
        );

        res.send({
          success: true,
          message: "Profile updated successfully",
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
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});