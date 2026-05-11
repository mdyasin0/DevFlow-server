require("dotenv").config();

const express = require("express");
const cors = require("cors");
const jwt = require("jsonwebtoken");
const cookieParser = require("cookie-parser");

const app = express();
app.use(cookieParser());
app.use(
  cors({
    origin: "http://localhost:5173",
    credentials: true,
  })
);

const http = require("http");
const server = http.createServer(app);
const { Server } = require("socket.io");
const PORT = process.env.PORT || 5000;
const io = new Server(server, {
  cors: {
    origin: "http://localhost:5173", // production এ specific domain দিবা
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
  socket.on("joinProject", (projectId) => {
    socket.join(projectId.toString());
    console.log("Joined project room:", projectId);
  });
  socket.on("disconnect", () => {
    console.log("User disconnected:", socket.id);
  });
});

// middleware

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
// jwt token create
app.post("/jwt", async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).send({
        success: false,
        message: "Email is required",
      });
    }

    const user = await usersCollection.findOne({ email });

    if (!user) {
      return res.status(404).send({
        success: false,
        message: "User not found",
      });
    }

    const token = jwt.sign(
      { email: user.email, id: user._id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    // 🔥 COOKIE SET (IMPORTANT CHANGE)
    res.cookie("token", token, {
      httpOnly: true,        // JS access করতে পারবে না (secure)
      secure: false,         // production এ true করবে (HTTPS)
      sameSite: "strict",
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    });

    res.send({
      success: true,
      message: "Token set in cookie",
    });

  } catch (error) {
    res.status(500).send({
      success: false,
      message: error.message,
    });
  }
});
// useractive time  update in every api call
const updateLastActive = async (req, res, next) => {
  try {
    const token = req.cookies?.token;

    if (!token) {
      return res.status(401).send({
        success: false,
        message: "Unauthorized: No token found",
      });
    }

    jwt.verify(token, process.env.JWT_SECRET, async (err, decoded) => {
      if (err) {
        return res.status(403).send({
          success: false,
          message: "Forbidden: Invalid token",
        });
      }

      req.user = decoded; // store user info

      // 🔥 UPDATE lastActiveAt
      await usersCollection.updateOne(
        { email: decoded.email },
        {
          $set: {
            lastActiveAt: new Date(),
          },
        }
      );

      next();
    });
  } catch (error) {
    res.status(500).send({
      success: false,
      message: error.message,
    });
  }
};
// check token ,is it verifide !
const verifyToken = (req, res, next) => {
  const token = req.cookies?.token;

  if (!token) {
    return res.status(401).send({
      success: false,
      message: "Unauthorized: No token found",
    });
  }

  jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
    if (err) {
      return res.status(403).send({
        success: false,
        message: "Forbidden: Invalid token",
      });
    }

    req.user = decoded; // user info store
    next();
  });
};
// token remove if logout
app.post("/logout", (req, res) => {
  res.clearCookie("token", {
    httpOnly: true,
    sameSite: "strict",
    secure: false,
  });

  res.send({ success: true });
});
    // user bloack
    app.patch("/users/block/:id",verifyToken,updateLastActive, async (req, res) => {
      try {
        const id = req.params.id;

        const result = await usersCollection.updateOne(
          { _id: new ObjectId(id) },
          {
            $set: {
              isBlocked: true,
              updatedAt: new Date(),
            },
          },
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
    app.patch("/users/unblock/:id",verifyToken,updateLastActive, async (req, res) => {
      try {
        const id = req.params.id;

        const result = await usersCollection.updateOne(
          { _id: new ObjectId(id) },
          {
            $set: {
              isBlocked: false,
              updatedAt: new Date(),
            },
          },
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
    app.patch("/users/role/:id",verifyToken,updateLastActive, async (req, res) => {
      try {
        const id = req.params.id;
        const { role } = req.body;

        const result = await usersCollection.updateOne(
          { _id: new ObjectId(id) },
          {
            $set: { role: role },
          },
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
    app.get("/approved_users",verifyToken,updateLastActive, async (req, res) => {
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

    app.post("/email/send-inactive",verifyToken,updateLastActive, async (req, res) => {
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
    app.get("/users",verifyToken,updateLastActive, async (req, res) => {
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
    app.patch("/projects/:id/status",verifyToken,updateLastActive, async (req, res) => {
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
          { $set: { status } },
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

          receiverId: receiverUser._id, // আগের মতোই থাকবে
          receiverEmail: receiverUser.email, // 🔥 NEW FIELD

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

        io.to(receiverUser._id.toString()).emit("project_status_updated", {
          projectId: id,
          status,
        });
        console.log("USER ROOM:", receiverUser._id.toString());
        console.log("EMITTING STATUS:", status);
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
    app.get("/projects",verifyToken,updateLastActive, async (req, res) => {
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

    app.post("/send-email",verifyToken,updateLastActive, async (req, res) => {
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
    app.put("/projects/:id", verifyToken,updateLastActive, async (req, res) => {
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
    app.patch("/reopen-task/:projectId", verifyToken,updateLastActive, async (req, res) => {
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
          { arrayFilters: [{ "m.email": email }] },
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
          { arrayFilters: [{ "m.email": email }] },
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
        // 🔥 REAL-TIME SOCKET ADDED (ONLY THIS PART NEW)
        io.to(user._id.toString()).emit("newNotification", {
          _id: notification._id,
          ...notification,
        });
        // 🔥 REAL-TIME PROJECT UPDATE (IMPORTANT FIX)
        io.to(projectId).emit("projectUpdated", {
          projectId,
        });
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

    app.delete("/projects/:id", verifyToken,updateLastActive,async (req, res) => {
      try {
        const id = req.params.id;

        const project = await projectsCollection.findOne({
          _id: new ObjectId(id),
        });

        if (!project) {
          return res.status(404).send({
            success: false,
            message: "Project not found",
          });
        }

        const result = await projectsCollection.deleteOne({
          _id: new ObjectId(id),
        });

        if (result.deletedCount === 1) {
          const members = project.teammember.filter(
            (m) => m.email !== project.created_by,
          );

          const emails = members.map((m) => m.email);

          const users = await usersCollection
            .find({ email: { $in: emails } })
            .toArray();

          const userMap = {};
          users.forEach((u) => {
            userMap[u.email] = u._id;
          });

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

          if (notifications.length > 0) {
            await notificationsCollection.insertMany(notifications);
          }

          // 🔥 SOCKET PART (NEW ADDED)
          members.forEach((member) => {
            const receiverId = userMap[member.email];

            if (receiverId) {
              io.to(receiverId.toString()).emit("projectDeleted", {
                projectId: id,
                message: "A project has been deleted",
              });
            }
          });
          io.emit("projectDeleted", {
            projectId: id,
          });
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
    app.patch("/move-task/:projectId",verifyToken,updateLastActive, async (req, res) => {
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
        // 🔥 NEW PART START
        const updatedProject = await projectsCollection.findOne({
          _id: new ObjectId(projectId),
        });

        io.to(projectId).emit("projectUpdated", updatedProject);
        // 🔥 NEW PART END
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
    app.get("/my-projects/:email", verifyToken,updateLastActive,async (req, res) => {
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
    app.delete("/remove-member/:projectId/:email", verifyToken,updateLastActive,async (req, res) => {
      try {
        const { projectId, email } = req.params;
        const decodedEmail = decodeURIComponent(email);

        const project = await projectsCollection.findOne({
          _id: new ObjectId(projectId),
        });

        const result = await projectsCollection.updateOne(
          { _id: new ObjectId(projectId) },
          {
            $pull: {
              teammember: { email: decodedEmail },
              invite_email: { email: decodedEmail },
            },
          },
        );

        const receiverUser = await usersCollection.findOne({
          email: decodedEmail,
        });

        const notification = {
          type: "removemember",
          message: "Manager removed you from their team",
          receiverId: receiverUser._id,
          receiverEmail: receiverUser.email,
          url: "/developer_dashboard/joined_team",
          created_by: project.created_by,
          created_time: new Date(),
          read: false,
        };

        await notificationsCollection.insertOne(notification);

        io.to(receiverUser._id.toString()).emit(
          "newNotification",
          notification,
        );

        // 🔥 REALTIME PROJECT UPDATE (MAIN FIX)
        const updatedProject = await projectsCollection.findOne({
          _id: new ObjectId(projectId),
        });

        io.to(projectId.toString()).emit("projectUpdated", updatedProject);

        res.send({
          success: true,
          message: "Member removed",
        });
      } catch (error) {
        res.status(500).send({
          success: false,
          message: error.message,
        });
      }
    });
    // remove that invite email which status are inpending or reject

    app.delete("/remove-invite/:id/:email",verifyToken ,updateLastActive,async (req, res) => {
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
    app.patch("/update-task/:projectId",verifyToken,updateLastActive, async (req, res) => {
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
                "<br/>",
              ),
            },
          },
          {
            arrayFilters: [{ "m.email": email }, { "t.id": taskId }],
          },
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

        const savedNotification =
          await notificationsCollection.insertOne(notification);

        // 🚀 ONLY ADD (REALTIME SOCKET)
        io.to(user._id.toString()).emit("newNotification", {
          _id: savedNotification.insertedId,
          ...notification,
        });
        io.to(projectId).emit("projectUpdated", {
          projectId,
        });
        res.send({ success: true, message: "Updated" });
      } catch (err) {
        res.send({ success: false, message: err.message });
      }
    });
    // DELETE task
    app.delete("/delete-task/:projectId",verifyToken,updateLastActive, async (req, res) => {
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
          },
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

        const savedNotification =
          await notificationsCollection.insertOne(notification);

        // 🔥 ONLY ADD THIS (REALTIME SOCKET)
        io.to(user?._id?.toString()).emit("newNotification", {
          _id: savedNotification.insertedId,
          ...notification,
        });
        io.to(projectId).emit("projectUpdated", {
          type: "task_deleted",
          taskId,
          email,
        });
        res.send({ success: true, message: "Deleted" });
      } catch (err) {
        res.send({ success: false, message: err.message });
      }
    });
    // work assign
    app.patch("/add-task/:projectId", verifyToken,updateLastActive, async (req, res) => {
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

        const project = await projectsCollection.findOne({
          _id: new ObjectId(projectId),
        });

        if (!project) {
          return res.send({
            success: false,
            message: "Project not found",
          });
        }

        const assignedMember = project.teammember.find(
          (member) => member.email === email,
        );

        if (!assignedMember) {
          return res.send({
            success: false,
            message: "Member not found",
          });
        }

        const user = await usersCollection.findOne({ email: email });

        const result = await projectsCollection.updateOne(
          {
            _id: new ObjectId(projectId),
            "teammember.email": email,
          },
          {
            $push: {
              "teammember.$.todo": newTask,
            },
          },
        );

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

        // 🔥 1. SAVE (same as before)
        const saved = await notificationsCollection.insertOne(notification);

        // 🔥 2. REALTIME SOCKET ADD (ONLY NEW PART)
        const fullNotification = {
          _id: saved.insertedId,
          ...notification,
        };

        io.to(user?._id.toString()).emit("newNotification", fullNotification);
        io.to(projectId).emit("projectUpdated", {
          projectId,
        });
        // 🔥 response same
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
    app.get("/my-invitations/:email",verifyToken,updateLastActive, async (req, res) => {
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
    app.patch("/invite-status/:projectId",verifyToken,updateLastActive, async (req, res) => {
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
          (i) => i.email.toLowerCase() === email.toLowerCase(),
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
          },
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
            },
          );
        }

        // 🔥 3. NOTIFICATION LOGIC (UNCHANGED)

        const receiverUser = await usersCollection.findOne({
          email: project.created_by,
        });

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

          created_by: email,
          created_time: new Date(),
          read: false,
        };

        // 🔥 4. SAVE
        const result = await notificationsCollection.insertOne(notification);

        // 🔥 5. REALTIME SOCKET (ADDED ✅ ONLY THIS PART)
        if (receiverUser?._id) {
          const fullNotification = {
            _id: result.insertedId, // 🔥 important
            ...notification,
          };

          io.to(receiverUser._id.toString()).emit(
            "newNotification",
            fullNotification,
          );
        }
        // 🔥 6. REALTIME PROJECT UPDATE (NEW ADD)
        const updatedProject = await projectsCollection.findOne({
          _id: new ObjectId(projectId),
        });

        // যাদের project page open আছে সবাই update পাবে
        io.to(projectId.toString()).emit("projectUpdated", updatedProject);

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

    app.post("/invite/:id", verifyToken,updateLastActive,async (req, res) => {
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
          (item) => item.email === email,
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
          },
        );

        // 🔥 4. CHECK USER EXIST (for notification)
        const receiverUser = await usersCollection.findOne({ email });

        // 🔥 5. CREATE NOTIFICATION
        const notification = {
          type: "invitation_send",
          message: "A team manager invited you to their team",

          receiverId: receiverUser?._id || null,
          receiverEmail: email,

          url: "/developer_dashboard/invitations",

          created_by: project.created_by,
          created_time: new Date(),
          read: false,
        };

        const result = await notificationsCollection.insertOne(notification);

        // ✅🔥 6. REALTIME SOCKET ADD (ONLY THIS PART NEW)
        if (receiverUser?._id) {
          const fullNotification = {
            _id: result.insertedId, // 🔥 IMPORTANT
            ...notification,
          };

          io.to(receiverUser._id.toString()).emit(
            "newNotification",
            fullNotification,
          );
        }
        // 🔥 EXTRA (IMPORTANT FOR INVITATION PAGE REALTIME)
        io.to(receiverUser._id.toString()).emit("newInvitation", {
          projectId,
          email,
          status: "pending",
          created_time: new Date(),
        });
        // 🔥 7. email send (existing)
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
    app.get("/project/:id", verifyToken,updateLastActive,async (req, res) => {
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
    app.get("/projects/:email",verifyToken,updateLastActive, async (req, res) => {
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
    app.get("/notifications",verifyToken,updateLastActive, async (req, res) => {
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
    app.patch("/notifications/:id/toggle-read",verifyToken,updateLastActive, async (req, res) => {
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
          },
        );

        res.send({
          success: true,
          message: notification.read ? "Marked as unread" : "Marked as read",
        });
      } catch (error) {
        res.status(500).send({
          success: false,
          message: error.message,
        });
      }
    });
    // DELETE NOTIFICATION
    app.delete("/notifications/:id",verifyToken,updateLastActive, async (req, res) => {
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

    app.post("/projects",verifyToken,updateLastActive, async (req, res) => {
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
        const admins = await usersCollection.find({ role: "admin" }).toArray();

        if (admins.length === 0) {
          return res.send({
            success: true,
            message: "Project created (no admin to notify)",
            data: result,
          });
        }

        // 🔥 3. CREATE NOTIFICATIONS
        const notifications = admins.map((admin) => ({
          type: "project_created",
          message: "A project created, check for approval",

          receiverId: admin._id,
          receiverEmail: admin.email,

          url: "/admin_dashboard_layout/project_monitoring",

          created_by: email,
          created_time: new Date(),
          read: false,
        }));

        // 🔥 4. SAVE ALL NOTIFICATIONS
        const saved = await notificationsCollection.insertMany(notifications);

        // 🔥 5. REALTIME SOCKET (FIXED ✅)
        saved.insertedIds &&
          Object.values(saved.insertedIds).forEach((id, index) => {
            const admin = admins[index];

            const fullNotification = {
              _id: id, // 🔥 IMPORTANT (DB ID)
              ...notifications[index],
            };

            // 👉 targeted user room এ send
            io.to(admin._id.toString()).emit(
              "newNotification",
              fullNotification,
            );
          });

        // 🔥 OPTIONAL: project realtime
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
    app.get("/user/:email", verifyToken,updateLastActive,async (req, res) => {
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

    app.post("/users",verifyToken,updateLastActive, async (req, res) => {
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

        const result = await usersCollection.updateOne({ email }, updateDoc, {
          upsert: true,
        });

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
