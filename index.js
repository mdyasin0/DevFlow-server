require("dotenv").config();

const express = require("express");
const cors = require("cors");
const jwt = require("jsonwebtoken");
const cookieParser = require("cookie-parser");
const Stripe = require("stripe");
const app = express();
app.use(cookieParser());
app.use(
  cors({
    origin:"https://devflow-32d85.web.app",
      // "http://localhost:5173",
    credentials: true,
  }),
);

const http = require("http");
const server = http.createServer(app);
const { Server } = require("socket.io");
const PORT = process.env.PORT || 5000;
const io = new Server(server, {
  cors: {
    origin:
      // "https://devflow-32d85.web.app",
      "http://localhost:5173", // production এ specific domain দিবা
    methods: ["GET", "POST", "PATCH", "DELETE"],
  },
});

io.on("connection", (socket) => {
  // console.log("User connected:", socket.id);

  // user join room (IMPORTANT for notification)
  socket.on("join", (userId) => {
    socket.join(userId.toString());
    // console.log("User joined room:", userId);
  });
  socket.on("joinProject", (projectId) => {
    socket.join(projectId.toString());
    // console.log("Joined project room:", projectId);
  });
  socket.on("disconnect", () => {
    // console.log("User disconnected:", socket.id);
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
    // await client.connect();

    // database collections
    const database = client.db("DevFlow");
    usersCollection = database.collection("users");
    const projectsCollection = database.collection("projects");
    const notificationsCollection = database.collection("notifications");
    const projectMessagesCollection = database.collection("projectMessages");
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
            message: "User not found  /jwt",
          });
        }

        const token = jwt.sign(
          { email: user.email, id: user._id, role: user.role },
          process.env.JWT_SECRET,
          { expiresIn: "7d" },
        );

        //  COOKIE SET (IMPORTANT CHANGE)
        res.cookie("token", token, {
          httpOnly: true, // JS access করতে পারবে না (secure)
          secure: true, // Render HTTPS
          sameSite: "none",
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

          //  UPDATE lastActiveAt
          await usersCollection.updateOne(
            { email: decoded.email },
            {
              $set: {
                lastActiveAt: new Date(),
              },
            },
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

      // console.log(" Incoming Cookies:", req.cookies);
      // console.log(" Token Found:", token);

      if (!token) {
        // console.log(" AUTH FAIL: No token in cookies");

        return res.status(401).send({
          success: false,
          message: "Unauthorized: No token found",
        });
      }

      jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
        if (err) {
          // console.log(" TOKEN ERROR:", err.message);

          return res.status(403).send({
            success: false,
            message: "Forbidden: Invalid token",
            error: err.message,
          });
        }

        // console.log(" TOKEN VERIFIED USER:", decoded);

        req.user = decoded;
        next();
      });
    };
    // check is user bloack in every api call
    const checkBlockedUser = async (req, res, next) => {
      try {
        const email = req.user?.email;

        if (!email) {
          return res.status(401).send({
            success: false,
            message: "Unauthorized",
          });
        }

        const user = await usersCollection.findOne({ email });

        if (!user) {
          return res.status(404).send({
            success: false,
            message: "User not found bloceduser",
          });
        }

        //  BLOCK CHECK + AUTO LOGOUT STYLE
        if (user.isBlocked) {
          //  cookie clear (same as logout API)
          res.clearCookie("token", {
            httpOnly: true,
            secure: true, // Render HTTPS
            sameSite: "none",
          });

          return res.status(403).send({
            success: false,
            message: "You are blocked",
            isBlocked: true,
          });
        }

        next();
      } catch (error) {
        res.status(500).send({
          success: false,
          message: error.message,
        });
      }
    };

    const cron = require("node-cron");

    // ======================= MAIN CRON =======================
    cron.schedule("*/5 * * * *", async () => {
      // console.log(" Checking deadlines...");
      await checkDeadlines();
    });

    // ======================= CHECK DEADLINES =======================
    const checkDeadlines = async () => {
      const projects = await projectsCollection.find().toArray();
      const now = new Date();

      for (const project of projects) {
        for (const member of project.teammember || []) {
          const allTasks = [...(member.todo || []), ...(member.running || [])];

          for (const task of allTasks) {
            //  ignore done task
            if (task.submittedAt) continue;

            if (!task.deadline) continue;

            const deadline = new Date(task.deadline);
            const diffMs = deadline - now;
            const diffHours = diffMs / (1000 * 60 * 60);

            //  expired skip
            if (diffHours < 0) continue;

            await handleReminder({
              diffHours,
              task,
              member,
              project,
            });
          }
        }
      }
    };

    // ======================= REMINDER LOGIC =======================
    const handleReminder = async ({ diffHours, task, member, project }) => {
      const manager = await usersCollection.findOne({
        email: project.created_by,
      });

      if (!manager || manager.plan?.type !== "premium") {
        return; //  skip reminder পুরো project এর জন্য
      }
      //  reminder flags init
      if (!task.reminders) {
        task.reminders = {
          h24: false,
          h12: false,
          h6: false,
          h1: false,
        };
      }

      const send = async (hour) => {
        await createNotification(member, project, hour);
        await sendEmail(member.email, hour, project._id);

        // realtime notification
        io.to(member.email).emit("newNotification");
      };

      // ===== CONDITIONS =====
      if (diffHours <= 24 && diffHours > 12 && !task.reminders.h24) {
        await send(24);
        task.reminders.h24 = true;
      }

      if (diffHours <= 12 && diffHours > 6 && !task.reminders.h12) {
        await send(12);
        task.reminders.h12 = true;
      }

      if (diffHours <= 6 && diffHours > 1 && !task.reminders.h6) {
        await send(6);
        task.reminders.h6 = true;
      }

      if (diffHours <= 1 && diffHours > 0 && !task.reminders.h1) {
        await send(1);
        task.reminders.h1 = true;
      }

      // ================= SAVE UPDATED TASK =================
      await projectsCollection.updateOne(
        {
          _id: project._id,
          "teammember.email": member.email,
        },
        {
          $set: {
            "teammember.$[m].todo": project.teammember.find(
              (m) => m.email === member.email,
            ).todo,
            "teammember.$[m].running": project.teammember.find(
              (m) => m.email === member.email,
            ).running,
          },
        },
        {
          arrayFilters: [{ "m.email": member.email }],
        },
      );
    };

    // ======================= CREATE NOTIFICATION =======================
    const createNotification = async (member, project, hour) => {
      const user = await usersCollection.findOne({
        email: member.email,
      });

      const notification = {
        type: "deadline_reminder",
        message: `Your task deadline is in ${hour} hours`,
        receiverId: user?._id,
        receiverEmail: member.email,
        url: `/developer_dashboard/joined_team_details/${project._id}`,
        created_by: "devflow",
        created_time: new Date(),
        read: false,
      };

      await notificationsCollection.insertOne(notification);
    };

    // ======================= SEND EMAIL =======================
    const sendEmail = async (email, hour, projectId) => {
      const transporter = nodemailer.createTransport({
        service: "gmail",
        auth: {
          user: "mdyasin01928364@gmail.com",
          pass: process.env.EMAIL_PASS,
        },
      });

      await transporter.sendMail({
        from: "mdyasin01928364@gmail.com",
        to: email,
        subject: " Deadline Reminder",
        html: `
      <h3>Your task deadline is in ${hour} hours</h3>
      <p>Don't forget to complete your task on time.</p>
      <a href="http://localhost:5173/developer_dashboard/joined_team_details/${projectId}">
        View Project
      </a>
    `,
      });
    };

    // ======================= SOCKET =======================
    io.on("connection", (socket) => {
      socket.on("joinUser", (email) => {
        socket.join(email);
      });
    });

    // massage save
    app.post("/project-message", verifyToken, async (req, res) => {
      try {
        const { projectId, message, senderEmail, senderName } = req.body;
        //  project find
        const project = await projectsCollection.findOne({
          _id: new ObjectId(projectId),
        });

        if (!project) {
          return res.status(404).send({
            success: false,
            message: "Project not found",
          });
        }

        //  manager find
        const manager = await usersCollection.findOne({
          email: project.created_by,
        });

        //  PLAN CHECK (CORRECT)
        if (!manager?.plan || manager?.plan?.type === "free") {
          return res.status(403).send({
            success: false,
            code: "PLAN_RESTRICTED",
            message: "Discussion disabled for this project (manager free plan)",
          });
        }
        const newMessage = {
          projectId,
          senderEmail,
          senderName,
          message,
          createdAt: new Date(),
        };

        const result = await projectMessagesCollection.insertOne(newMessage);

        const fullMessage = {
          _id: result.insertedId,
          ...newMessage,
        };

        //  realtime
        io.to(projectId).emit("newMessage", fullMessage);

        res.send({ success: true, data: fullMessage });
      } catch (err) {
        res.status(500).send({ success: false });
      }
    });
    app.get("/project-message/:projectId", verifyToken, async (req, res) => {
      try {
        const { projectId } = req.params;

        const messages = await projectMessagesCollection
          .find({ projectId })
          .sort({ createdAt: 1 })
          .toArray();

        res.send({ success: true, data: messages });
      } catch (err) {
        res.status(500).send({ success: false });
      }
    });
    // edite massge
    app.patch("/project-message/:id", verifyToken, async (req, res) => {
      try {
        const { id } = req.params;
        const { message } = req.body;
        const userEmail = req.user.email;

        const existing = await projectMessagesCollection.findOne({
          _id: new ObjectId(id),
        });

        if (!existing) {
          return res.status(404).send({ success: false });
        }

        if (existing.senderEmail !== userEmail) {
          return res.status(403).send({ success: false });
        }

        await projectMessagesCollection.updateOne(
          { _id: new ObjectId(id) },
          {
            $set: {
              message,
              edited: true,
            },
          },
        );

        const updated = await projectMessagesCollection.findOne({
          _id: new ObjectId(id),
        });

        // realtime
        io.to(existing.projectId).emit("updateMessage", updated);

        res.send({ success: true, data: updated });
      } catch (err) {
        res.status(500).send({ success: false });
      }
    });
    // delete massage
    app.delete("/project-message/:id", verifyToken, async (req, res) => {
      try {
        const { id } = req.params;
        const userEmail = req.user.email;

        const message = await projectMessagesCollection.findOne({
          _id: new ObjectId(id),
        });

        if (!message) {
          return res.status(404).send({ success: false });
        }

        // ❌ অন্য কেউ delete করতে পারবে না
        if (message.senderEmail !== userEmail) {
          return res
            .status(403)
            .send({ success: false, message: "Not allowed" });
        }

        await projectMessagesCollection.deleteOne({ _id: new ObjectId(id) });

        // 🔥 realtime
        io.to(message.projectId).emit("deleteMessage", id);

        res.send({ success: true });
      } catch (err) {
        res.status(500).send({ success: false });
      }
    });
    // token remove if logout
    app.post("/logout", (req, res) => {
      res.clearCookie("token", {
        httpOnly: true,
        secure: true, // Render HTTPS
        sameSite: "none",
      });

      res.send({ success: true });
    });
    // user bloack
    app.patch("/users/block/:id", verifyToken, async (req, res) => {
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
    app.patch("/users/unblock/:id", verifyToken, async (req, res) => {
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
    app.patch(
      "/users/role/:id",
      verifyToken,
      updateLastActive,
      async (req, res) => {
        try {
          const id = req.params.id;
          const { role } = req.body;

          //  Step 1: get user
          const user = await usersCollection.findOne({
            _id: new ObjectId(id),
          });

          if (!user) {
            return res.send({
              success: false,
              message: "User not found",
            });
          }

          const userEmail = user.email;

          //  Step 2: check in projects
          const managerProject = await projectsCollection.findOne({
            created_by: userEmail,
          });

          const teamMemberProject = await projectsCollection.findOne({
            "teammember.email": userEmail,
          });

          // Step 3: condition check
          if (managerProject && teamMemberProject) {
            return res.send({
              success: false,
              message:
                "This user is a manager and also a team member of a project",
            });
          }

          if (managerProject) {
            return res.send({
              success: false,
              message: "This user is a manager of a project",
            });
          }

          if (teamMemberProject) {
            return res.send({
              success: false,
              message: "This user is already a team member of a project",
            });
          }

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
      },
    );
    function getRemainingDays(expiresAt) {
      const now = new Date();
      const exp = new Date(expiresAt);
      const diff = exp - now;

      return Math.ceil(diff / (1000 * 60 * 60 * 24));
    }
    // START FREE API
    app.post("/plan/start-free/:email", async (req, res) => {
      try {
        const email = req.params.email;

        const user = await usersCollection.findOne({ email });

        if (!user) {
          return res.send({
            success: false,
            message: "User not found",
          });
        }

        const now = new Date();

        //  CASE 1: Already free
        if (user.plan?.type === "free") {
          return res.send({
            success: false,
            message: "You are already in Free plan",
          });
        }

        //  CASE 2: Premium active → BLOCK downgrade
        if (
          user.plan?.type === "premium" &&
          user.plan.expiresAt &&
          new Date(user.plan.expiresAt) > now
        ) {
          return res.send({
            success: false,
            message:
              "You cannot downgrade while Premium is active. Wait until it expires.",
          });
        }

        // CASE 3: expired → auto free (ONLY allowed case)
        if (
          user.plan?.type === "premium" &&
          user.plan.expiresAt &&
          new Date(user.plan.expiresAt) <= now
        ) {
          await usersCollection.updateOne(
            { email },
            {
              $set: {
                plan: {
                  type: "free",
                  startedAt: new Date(),
                  expiresAt: null,
                },
                updatedAt: new Date(),
              },
            },
          );

          return res.send({
            success: true,
            message: "Premium expired. Auto converted to Free plan.",
          });
        }

        return res.send({
          success: false,
          message: "Invalid request",
        });
      } catch (error) {
        return res.send({
          success: false,
          message: error.message,
        });
      }
    });
    // user data get by email
    app.get(
      "/users/:email",
      verifyToken,
      checkBlockedUser,
      updateLastActive,
      async (req, res) => {
        try {
          const email = req.params.email;

          const user = await usersCollection.findOne({ email });

          if (!user) {
            return res.status(404).send({
              success: false,
              message: "User not found  /users/:email",
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
      },
    );
    // all not block user get
    app.get(
      "/approved_users",
      verifyToken,
      checkBlockedUser,
      updateLastActive,
      async (req, res) => {
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
      },
    );
    // send email all inactive users

    app.post(
      "/email/send-inactive",
      verifyToken,
      checkBlockedUser,
      updateLastActive,
      async (req, res) => {
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
      },
    );
    // all users
    app.get(
      "/users",
      verifyToken,
      checkBlockedUser,
      updateLastActive,
      async (req, res) => {
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
      },
    );
    // project status update notification save socket .io added
    app.patch(
      "/projects/:id/status",
      verifyToken,
      checkBlockedUser,
      updateLastActive,
      async (req, res) => {
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

          //  1. project find
          const project = await projectsCollection.findOne({
            _id: new ObjectId(id),
          });

          if (!project) {
            return res.status(404).send({
              success: false,
              message: "Project not found",
            });
          }

          //  2. update status
          await projectsCollection.updateOne(
            { _id: new ObjectId(id) },
            { $set: { status } },
          );
          const projectInfo = `project name : ${project.projectTitle}  Team name : ${project.teamName}`;
          //  3. message set
          let message = "";
          if (status === "approved") {
            message = `Your project has been approved ${projectInfo}`;
          } else if (status === "rejected") {
            message = `Your project rejected. Please create project based on rules and regulations ${projectInfo}`;
          } else {
            message = "Project status updated";
          }

          //  4. receiver user find
          const receiverUser = await usersCollection.findOne({
            email: project.created_by,
          });

          if (!receiverUser?._id) {
            return res.status(404).send({
              success: false,
              message: "Receiver user not found",
            });
          }

          //  5. notification object (UPDATED )
          const notification = {
            type: "project_status_updated",
            message,

            receiverId: receiverUser._id,
            receiverEmail: receiverUser.email, // NEW FIELD

            url: "/developer_dashboard/created_project",

            created_by: updatedBy,
            created_time: new Date(),
            read: false,
          };

          //  6. save
          const result = await notificationsCollection.insertOne(notification);

          const fullNotification = {
            _id: result.insertedId,
            ...notification,
          };
          io.to(receiverUser._id.toString()).emit(
            "newNotification",
            fullNotification,
          );
          io.to(receiverUser._id.toString()).emit("project_status_updated", {
            projectId: id,
            status,
          });
          // console.log("USER ROOM:", receiverUser._id.toString());
          // console.log("EMITTING STATUS:", status);
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
      },
    );
    // all projects
    app.get(
      "/projects",
      verifyToken,
      checkBlockedUser,
      updateLastActive,
      async (req, res) => {
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
      },
    );
    // Send Email API (Nodemailer)

    app.post(
      "/send-email",
      verifyToken,
      checkBlockedUser,
      updateLastActive,
      async (req, res) => {
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
      },
    );
    // created project update
    app.put(
      "/projects/:id",
      verifyToken,
      checkBlockedUser,
      updateLastActive,
      async (req, res) => {
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

         
          const memberEmails = project.teammember.map((m) => m.email);

      
          const users = await usersCollection
            .find({ email: { $in: memberEmails } })
            .toArray();

          // email → userId map
          const userMap = {};
          users.forEach((u) => {
            userMap[u.email] = u._id;
          });

          // bulk notification 
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

          // insertMany
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
      },
    );
    // reopen , move done to running
    app.patch(
      "/reopen-task/:projectId",
      verifyToken,
      checkBlockedUser,
      async (req, res) => {
        try {
          const { projectId } = req.params;
          const { taskId, email } = req.body;
          // ================================
          //  PREMIUM CHECK START
          // ================================
          const loginUser = await usersCollection.findOne({
            email: req.user.email,
          });

          if (!loginUser) {
            return res.send({
              success: false,
              message: "User not found",
            });
          }

          if (!loginUser.plan || loginUser.plan.type !== "premium") {
            return res.send({
              success: false,
              message: "Upgrade to premium to reopen task 🚀",
              code: "PLAN_RESTRICTED_REOPEN",
            });
          }
          // 1. project find
          const project = await projectsCollection.findOne({
            _id: new ObjectId(projectId),
          });

          if (!project) {
            return res.send({
              success: false,
              message: "Project not found",
            });
          }

          // 2. member find
          const member = project.teammember.find((m) => m.email === email);

          if (!member) {
            return res.send({
              success: false,
              message: "Member not found",
            });
          }

          // 3. check task in DONE
          const taskIndex = member.done.findIndex((t) => t.id === taskId);

          if (taskIndex === -1) {
            return res.send({
              success: false,
              message: "No task found in done",
            });
          }

          // 4. task remove from done
          const [task] = member.done.splice(taskIndex, 1);

          delete task.submittedAt;

          // 5. push into running
          member.running.push(task);

          // 6. update DB
          await projectsCollection.updateOne(
            { _id: new ObjectId(projectId) },
            {
              $set: {
                teammember: project.teammember,
              },
            },
          );

          // ================================
          //  NOTIFICATION START
          // ================================

          //  receiver user 
          const receiverUser = await usersCollection.findOne({
            email: email,
          });

          if (receiverUser) {
            //  task first 3 words
            const first3Words = task.text
              ?.replace(/<br\/>/g, " ")
              .split(" ")
              .slice(0, 3)
              .join(" ");

            await notificationsCollection.insertOne({
              type: "task_reopen",
              message: `Manager reopen your task "${first3Words}..."`,
              receiverId: receiverUser._id,
              receiverEmail: receiverUser.email,
              url: `/developer_dashboard/joined_team_details/${projectId}`,
              created_by: req.user.email, // login user
              created_time: new Date(),
              read: false,
            });
          }

          // ================================
          //  NOTIFICATION END
          // ================================

          // 7. socket emit
          io.to(projectId).emit("projectUpdated", project);

          res.send({
            success: true,
            message: "Task moved to running",
            data: project,
          });
        } catch (error) {
          res.send({
            success: false,
            message: error.message,
          });
        }
      },
    );

    app.delete(
      "/projects/:id",
      verifyToken,
      checkBlockedUser,
      updateLastActive,
      async (req, res) => {
        try {
          const id = req.params.id;
          //  USER GET
          const user = await usersCollection.findOne({
            email: req.user.email,
          });

          
          if (user?.plan?.type === "free") {
            return res.status(403).send({
              success: false,
              code: "Project only premium user can delete",
              message: "Only premium users can delete projects",
            });
          }

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

            //  SOCKET PART (NEW ADDED)
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
      },
    );
    // tasks status change
    app.patch(
      "/move-task/:projectId",
      verifyToken,
      checkBlockedUser,
      updateLastActive,
      async (req, res) => {
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
          // NEW PART START
          const updatedProject = await projectsCollection.findOne({
            _id: new ObjectId(projectId),
          });

          io.to(projectId).emit("projectUpdated", updatedProject);
          //  NEW PART END
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
      },
    );
    // joined team data get by user email
    app.get(
      "/my-projects/:email",
      verifyToken,
      checkBlockedUser,
      updateLastActive,
      async (req, res) => {
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
      },
    );
    // member remove with invite email
    app.delete(
      "/remove-member/:projectId/:email",
      verifyToken,
      checkBlockedUser,
      updateLastActive,
      async (req, res) => {
        try {
          const { projectId, email } = req.params;
          const decodedEmail = decodeURIComponent(email);
          // manager (logged in user) 
          const currentUser = await usersCollection.findOne({
            email: req.user.email,
          });

          //  PLAN CHECK (IMPORTANT)
          if (!currentUser?.plan || currentUser?.plan?.type === "free") {
            return res.status(403).send({
              success: false,
              message: "Upgrade your plan to remove members",
              code: "PLAN_RESTRICTED for remove member",
            });
          }
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

          //  REALTIME PROJECT UPDATE (MAIN FIX)
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
      },
    );
    // remove that invite email which status are in pending or reject

    app.delete(
      "/remove-invite/:id/:email",
      verifyToken,
      checkBlockedUser,
      updateLastActive,
      async (req, res) => {
        const { id } = req.params;
        const email = decodeURIComponent(req.params.email); //  important

        try {
         
          const user = await usersCollection.findOne({
            email: req.user.email,
          });

          if (!user) {
            return res.status(404).send({
              success: false,
              message: "User not found",
            });
          }

          //  2. FREE plan block
          if (user.plan?.type === "free") {
            return res.status(403).send({
              success: false,
              code: "NO permission to delete invaitations",
              message: "Free users cannot remove invites. Upgrade your plan.",
            });
          }

          const result = await projectsCollection.updateOne(
            { _id: new ObjectId(id) },
            {
              $pull: {
                invite_email: { email: email },
              },
            },
          );
          // updated project 
          const updatedProject = await projectsCollection.findOne({
            _id: new ObjectId(id),
          });

          // socket emit  (IMPORTANT)
          io.to(id.toString()).emit("projectUpdated", updatedProject);
          // console.log("DELETE RESULT:", result);

          res.send({ success: true, result });
        } catch (err) {
          res.status(500).send({ success: false, error: err.message });
        }
      },
    );
    // UPDATE task
    app.patch(
      "/update-task/:projectId",
      verifyToken,
      checkBlockedUser,
      updateLastActive,
      async (req, res) => {
        try {
          const { projectId } = req.params;
          const { email, type, taskId, text, newAttachments } = req.body;

          //  project data (created_by )
          const project = await projectsCollection.findOne({
            _id: new ObjectId(projectId),
          });

          if (!project) {
            return res.send({
              success: false,
              message: "Project not found",
            });
          }

        
          const user = await usersCollection.findOne({ email: email });
          const isFreeUser = !user?.plan || user?.plan?.type === "free";

          if (isFreeUser && newAttachments?.length > 0) {
            return res.status(403).send({
              success: false,
              code: "FILE_UPLOAD_RESTRICTED for update",
              message: "File upload is only for Pro users",
            });
          }
          //  task update
          const result = await projectsCollection.updateOne(
            { _id: new ObjectId(projectId) },
            {
              $set: {
                [`teammember.$[m].${type}.$[t].text`]: text.replace(
                  /\n/g,
                  "<br/>",
                ),
                [`teammember.$[m].${type}.$[t].attachments`]:
                  newAttachments || [],
              },
            },
            {
              arrayFilters: [{ "m.email": email }, { "t.id": taskId }],
            },
          );

          //  notification 
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

          //  ONLY ADD (REALTIME SOCKET)
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
      },
    );
    // DELETE task
    app.delete(
      "/delete-task/:projectId",
      verifyToken,
      checkBlockedUser,
      updateLastActive,
      async (req, res) => {
        try {
          const { projectId } = req.params;
          const { email, type, taskId, manager } = req.body;

          const project = await projectsCollection.findOne({
            _id: new ObjectId(projectId),
          });

          if (!project) {
            return res.send({
              success: false,
              message: "Project not found",
            });
          }

          // // user থেকে receiverId আনো
          const user = await usersCollection.findOne({ email: manager });
          // console.log(user)
          //  PLAN CHECK
          if (!user?.plan || user?.plan?.type === "free") {
            return res.status(403).send({
              success: false,
              message: "Upgrade your plan to delete tasks",
              code: "PLAN_RESTRICTED for delete",
            });
          }
          //  task delete
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

          //  notification 
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

          //  ONLY ADD THIS (REALTIME SOCKET)
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
      },
    );
    // work assign
    app.patch(
      "/add-task/:projectId",
      verifyToken,
      checkBlockedUser,
      updateLastActive,
      async (req, res) => {
        try {
          const { projectId } = req.params;
          const { email, text, deadline, priority, attachments } = req.body;

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
            attachments: attachments || [],
            //  ADD THIS
            reminders: {
              h24: false,
              h12: false,
              h6: false,
              h1: false,
            },
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
          //  PLAN + TASK LIMIT CHECK
          const isFreeUser = !user?.plan || user?.plan?.type === "free";
          if (isFreeUser && attachments?.length > 0) {
            return res.status(403).send({
              success: false,
              code: "FILE_UPLOAD_RESTRICTED",
              message: "File upload is only for Pro users",
            });
          }
          //  CHARACTER LIMIT
          if (isFreeUser && text.length > 500) {
            return res.status(403).send({
              success: false,
              code: "CHAR_LIMIT_EXCEEDED",
              message: "Max 500 characters allowed in free plan",
            });
          }
          if (isFreeUser) {
           
            let totalTasks = 0;

            project.teammember.forEach((member) => {
              totalTasks += member.todo?.length || 0;
              totalTasks += member.running?.length || 0;
              totalTasks += member.done?.length || 0;
            });

            if (totalTasks >= 50) {
              return res.status(403).send({
                success: false,
                code: "TASK_LIMIT_EXCEEDED",
                message: "Free plan limit reached. Upgrade for more tasks 🚀",
              });
            }
          }
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
          const words = text.split(" ");
          const shortText =
            words.length > 5 ? words.slice(0, 5).join(" ") + "..." : text;

          const notification = {
            type: "work_assign",
            message: `Manager assigned a new task " ${shortText} "`,
            receiverId: user?._id,
            receiverEmail: email,
            url: `/developer_dashboard/joined_team_details/${projectId}`,
            created_by: project.created_by,
            created_time: new Date(),
            read: false,
          };

          //  1. SAVE (same as before)
          const saved = await notificationsCollection.insertOne(notification);

          //  2. REALTIME SOCKET ADD (ONLY NEW PART)
          const fullNotification = {
            _id: saved.insertedId,
            ...notification,
          };

          io.to(user?._id.toString()).emit("newNotification", fullNotification);
          io.to(projectId).emit("projectUpdated", {
            projectId,
          });
          //  response same
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
      },
    );

    // GET invited projects by user email
    app.get(
      "/my-invitations/:email",
      verifyToken,
      checkBlockedUser,
      updateLastActive,
      async (req, res) => {
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
      },
    );

    // Update invitation status (approved/rejected) with add team member if approved
    app.patch(
      "/invite-status/:projectId",
      verifyToken,
      checkBlockedUser,
      updateLastActive,
      async (req, res) => {
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

          // 2. if approved  → teammember এ add
          if (status === "approved") {
            const user = await usersCollection.findOne({
              email: project.created_by,
            });

            const currentMembers = project.teammember?.length || 0;

            //  FREE PLAN LIMIT CHECK
            if (user?.plan?.type === "free" && currentMembers >= 5) {
              return res.status(403).send({
                success: false,
                message:
                  "Team member reached maximum limit. Please ask your manager to upgrade their plan ",
                code: "TEAM_LIMIT_REACHED",
              });
            }

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

          //  3. NOTIFICATION LOGIC (UNCHANGED)

          const receiverUser = await usersCollection.findOne({
            email: project.created_by,
          });

          let message = "";
          if (status === "approved") {
            message = `${name} (${email}) accepted your invitation and joined the team`;
          } else if (status === "rejected") {
            message = `${name} (${email}) rejected your invitation`;
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

          //  4. SAVE
          const result = await notificationsCollection.insertOne(notification);

          //  5. REALTIME SOCKET (ADDED  ONLY THIS PART)
          if (receiverUser?._id) {
            const fullNotification = {
              _id: result.insertedId, //  important
              ...notification,
            };

            io.to(receiverUser._id.toString()).emit(
              "newNotification",
              fullNotification,
            );
          }
          //  6. REALTIME PROJECT UPDATE (NEW ADD)
          const updatedProject = await projectsCollection.findOne({
            _id: new ObjectId(projectId),
          });

          
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
      },
    );
    //  CHECK USER PLAN
    app.get("/plan/check/:email", async (req, res) => {
      try {
        const { email } = req.params;

        const user = await usersCollection.findOne({ email });

        if (!user || !user.plan) {
          return res.json({ isPremium: false });
        }

        const now = new Date();
        const expiresAt = new Date(user.plan.expiresAt);

        if (user.plan.type === "premium" && expiresAt > now) {
          const remainingDays = Math.ceil(
            (expiresAt - now) / (1000 * 60 * 60 * 24),
          );

          return res.json({
            isPremium: true,
            remainingDays,
          });
        }

        res.json({ isPremium: false });
      } catch (err) {
        res.status(500).json({ message: err.message });
      }
    });
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

    // Stripe Checkout Session Create
    app.post("/plan/upgrade-premium/:email", async (req, res) => {
      try {
        const { email } = req.params;

        const session = await stripe.checkout.sessions.create({
          payment_method_types: ["card"],
          mode: "subscription",

          customer_email: email,

          line_items: [
            {
              price: "price_1TavbOQWZJvyLAEr8euikwCN",
              quantity: 1,
            },
          ],

          success_url: `http://localhost:5000/payment-success?session_id={CHECKOUT_SESSION_ID}&email=${email}`,
          cancel_url: `http://localhost:5173/cancel`,
        });

        res.json({ url: session.url });
      } catch (error) {
        res.status(500).json({ message: error.message });
      }
    });
    // PAYMENT SUCCESS HANDLER
    app.get("/payment-success", async (req, res) => {
      try {
        const { session_id, email } = req.query;

        if (!session_id) {
          return res.status(400).send("Missing session_id");
        }

        const session = await stripe.checkout.sessions.retrieve(session_id);

        //  Security check 1
        if (session.status !== "complete") {
          return res.send("Payment not completed");
        }

        //  Security check 2 (VERY IMPORTANT)
        if (session.customer_email !== email) {
          return res.send("Invalid user");
        }

        const now = new Date();
        const expires = new Date();
        expires.setDate(now.getDate() + 30);

        await usersCollection.updateOne(
          { email },
          {
            $set: {
              plan: {
                type: "premium",
                startedAt: now,
                expiresAt: expires,
              },
              updatedAt: new Date(),
            },
          },
        );

        res.redirect("http://localhost:5173/success");
      } catch (error) {
        res.status(500).send(error.message);
      }
    });

    // check corn for plane deadline and auto update

    cron.schedule("0 0 * * *", async () => {
      const now = new Date();

      const premiumUsers = await usersCollection
        .find({ "plan.type": "premium" })
        .toArray();

      for (const user of premiumUsers) {
        if (!user.plan?.expiresAt) continue;

        const expiresAt = new Date(user.plan.expiresAt);

        const diffDays = Math.ceil((expiresAt - now) / (1000 * 60 * 60 * 24));

        // ================================
        //  CASE 1: EXPIRED → FREE
        // ================================
        if (diffDays <= 0) {
          await usersCollection.updateOne(
            { _id: user._id },
            {
              $set: {
                plan: {
                  type: "free",
                  startedAt: new Date(),
                  expiresAt: null,
                },
              },
            },
          );

          // DB NOTIFICATION
          const notification = {
            type: "plan_expired",
            message: "Your premium plan has expired and converted to free plan",
            receiverId: user._id,
            receiverEmail: user.email,
            url: "/pricingpage",
            created_by: "devflow",
            created_time: new Date(),
            read: false,
          };

          await notificationsCollection.insertOne(notification);

          // SOCKET EMIT 
          io.to(user._id.toString()).emit("notification", notification);

          // EMAIL (direct nodemailer)
          const transporter = nodemailer.createTransport({
            service: "gmail",
            auth: {
              user: process.env.EMAIL,
              pass: process.env.EMAIL_PASS,
            },
          });

          await transporter.sendMail({
            from: process.env.EMAIL,
            to: user.email,
            subject: "Plan Expired",
            html: `<p>Your premium plan has expired and converted to free plan.</p>`,
          });
        }

        // ================================
        // CASE 2: REMINDER (1–7 days)
        // ================================
        if (diffDays > 0 && diffDays <= 7) {
          const message = `Your plan will expire soon. Remaining ${diffDays} days`;

          const notification = {
            type: "plan_reminder",
            message,
            receiverId: user._id,
            receiverEmail: user.email,
            url: "/pricingpage",
            created_by: "devflow",
            created_time: new Date(),
            read: false,
          };

          // DB SAVE
          await notificationsCollection.insertOne(notification);

          // SOCKET REALTIME 
          io.to(user._id.toString()).emit("notification", notification);

          // EMAIL SEND
          const transporter = nodemailer.createTransport({
            service: "gmail",
            auth: {
              user: process.env.EMAIL,
              pass: process.env.EMAIL_PASS,
            },
          });

          await transporter.sendMail({
            from: process.env.EMAIL,
            to: user.email,
            subject: "Plan Expiring Soon",
            html: `<p>${message}</p>`,
          });
        }
      }
    });
    // invite email send and save email and status

    const nodemailer = require("nodemailer");

    app.post(
      "/invite/:id",
      verifyToken,
      checkBlockedUser,
      updateLastActive,
      async (req, res) => {
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

          if (!project) {
            return res.status(404).send({
              success: false,
              message: "Project not found",
            });
          }

          // 2. manager user (created_by)
          const manager = await usersCollection.findOne({
            email: project.created_by,
          });

          // 3. plan check
          const planType = manager?.plan?.type;

          // 4. current counts
          const teamMemberCount = project.teammember?.length || 0;
          const inviteCount = project.invite_email?.length || 0;

          //  RULE 1: TEAM LIMIT
          if (planType === "free" && teamMemberCount >= 5) {
            return res.status(403).send({
              success: false,
              code: "TEAM_LIMIT",
              message:
                "You have max team members. Please upgrade for more members",
            });
          }

          //  RULE 2: INVITE LIMIT
          if (planType === "free" && inviteCount >= 20) {
            return res.status(403).send({
              success: false,
              code: "INVITE_LIMIT",
              message:
                "You have reached max invitation limit. Please upgrade for more invitations",
            });
          }

          // 2. check already invited 
          const existingInvite = project.invite_email.find(
            (item) => item.email === email,
          );

          if (existingInvite) {
            if (existingInvite.status === "pending") {
              return res.send({
                success: false,
                message:
                  "Already invitation sent. Please tell your team member to accept the invitation.If you want to send again by this email, delete the email from invitation list first.",
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

          // 4. CHECK USER EXIST (for notification)
          const receiverUser = await usersCollection.findOne({ email });

          // 5. CREATE NOTIFICATION
          const notification = {
            type: "invitation_send",
            message: `You are invited to join "${project.projectTitle || "a project"}" team  ${project.teamName}`,

            receiverId: receiverUser?._id || null,
            receiverEmail: email,

            url: "/developer_dashboard/invitations",

            created_by: project.created_by,
            created_time: new Date(),
            read: false,
          };

          const result = await notificationsCollection.insertOne(notification);

          //  6. REALTIME SOCKET ADD (ONLY THIS PART NEW)
          if (receiverUser?._id) {
            const fullNotification = {
              _id: result.insertedId, // IMPORTANT
              ...notification,
            };

            io.to(receiverUser._id.toString()).emit(
              "newNotification",
              fullNotification,
            );
          }
          //  EXTRA (IMPORTANT FOR INVITATION PAGE REALTIME)
          io.to(receiverUser._id.toString()).emit("newInvitation", {
            projectId,
            email,
            status: "pending",
            created_time: new Date(),
          });
          //  7. email send (existing)
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
            subject: ` Project Invitation: ${project.name || "Your Project"}`,

            html: `
  <div style="font-family: Arial, sans-serif; background:#f4f6f8; padding:20px;">
    
    <div style="max-width:600px; margin:auto; background:white; padding:25px; border-radius:10px;">

      <h2 style="color:#2d6cdf;">You are invited to a project</h2>

      <p>Hello</p>

      <p>
        You have been invited to join a project by 
        <b>${project.created_by}</b>.
      </p>

      <hr />

      <h3> Project Details</h3>
      <p><b>Project Name:</b> ${project.projectTitle || "N/A"}</p>
      <p><b>Team Members:</b> ${project.teammember?.length || 0}</p>
   

      <div style="margin:20px 0;">
        <a href="http://localhost:5173/developer_dashboard/invitations" 
           style="background:#2d6cdf; color:white; padding:12px 20px; text-decoration:none; border-radius:6px; display:inline-block;">
          Join Project
        </a>
      </div>

      <p style="font-size:12px; color:gray;">
        If you did not expect this invitation, you can ignore this email.
      </p>

    </div>
  </div>
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
      },
    );

    // get single project by id
    app.get(
      "/project/:id",
      verifyToken,
      checkBlockedUser,
      updateLastActive,
      async (req, res) => {
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

          //  manager info আনো
          const manager = await usersCollection.findOne({
            email: project.created_by,
          });

          const result = {
            ...project,
            manager: {
              email: manager?.email,
              name: manager?.name,
              role: manager?.role,
              plan: manager?.plan || {
                type: "free",
                startedAt: null,
                expiresAt: null,
              },
            },
          };

          return res.send({
            success: true,
            data: result,
          });
        } catch (error) {
          return res.status(500).send({
            success: false,
            message: error.message,
          });
        }
      },
    );
    // created project get only approved project
    app.get(
      "/projects/:email",
      verifyToken,
      checkBlockedUser,
      updateLastActive,
      async (req, res) => {
        try {
          const email = req.params.email;

          const query = {
            created_by: email,
            status: "approved", //  main fix
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
      },
    );
    // get notifications by user id
    app.get(
      "/notifications",
      verifyToken,
      checkBlockedUser,
      updateLastActive,
      async (req, res) => {
        try {
          const email = req.query.email; // login user email

          if (!email) {
            return res.send({
              success: false,
              message: "Email is required",
            });
          }

          const user = await usersCollection.findOne({ email });

          if (!user) {
            return res.send({
              success: false,
              message: "User not found /notifications",
            });
          }

          //  userId notification filter
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
      },
    );
    // toggle nptification read /unread
    app.patch(
      "/notifications/:id/toggle-read",
      verifyToken,
      checkBlockedUser,
      updateLastActive,
      async (req, res) => {
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
      },
    );
    // DELETE NOTIFICATION
    app.delete(
      "/notifications/:id",
      verifyToken,
      checkBlockedUser,
      updateLastActive,
      async (req, res) => {
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
      },
    );
    // project save with socket.io and notifiaction

    app.post(
      "/projects",
      verifyToken,
      checkBlockedUser,
      updateLastActive,
      async (req, res) => {
        try {
          const { teamName, projectTitle, description, email } = req.body;

          if (!teamName || !projectTitle || !description || !email) {
            return res.status(400).send({
              success: false,
              message: "All fields are required",
            });
          }
          //  1. USER GET
          const user = await usersCollection.findOne({ email });

          //  2. COUNT USER PROJECT
          const projectCount = await projectsCollection.countDocuments({
            created_by: email,
          });

          //  3. FREE PLAN LIMIT CHECK
          if (user?.plan?.type === "free" && projectCount >= 1) {
            return res.status(403).send({
              success: false,
              message: "You hit the limit. Please upgrade your plan ",
              code: "LIMIT_REACHED",
            });
          }

          //  1. CREATE PROJECT
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

          //  2. GET ALL ADMINS
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

          //  3. CREATE NOTIFICATIONS
          const notifications = admins.map((admin) => ({
            type: "project_created",
            message: `New project created , project name "${projectTitle}" team name "${teamName}". Please check for approval.`,

            receiverId: admin._id,
            receiverEmail: admin.email,

            url: "/admin_dashboard_layout/project_monitoring",

            created_by: email,
            created_time: new Date(),
            read: false,
          }));

          //  4. SAVE ALL NOTIFICATIONS
          const saved = await notificationsCollection.insertMany(notifications);

          //  5. REALTIME SOCKET (FIXED )
          saved.insertedIds &&
            Object.values(saved.insertedIds).forEach((id, index) => {
              const admin = admins[index];

              const fullNotification = {
                _id: id, //  IMPORTANT (DB ID)
                ...notifications[index],
              };

              //  targeted user room এ send
              io.to(admin._id.toString()).emit(
                "newNotification",
                fullNotification,
              );
            });

          //  OPTIONAL: project realtime
          io.emit("newProject", newProject);

          //  RESPONSE
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
      },
    );
    // porject manager plane
    app.get("/manager-plan/:email", async (req, res) => {
      try {
        const email = req.params.email;

        // 1. find user
        const user = await usersCollection.findOne({ email });

        if (!user) {
          return res.status(404).send({
            success: false,
            message: "Manager not found",
          });
        }

        // 2. return only plan (optimized)
        return res.send({
          success: true,
          data: {
            email: user.email,
            plan: user?.plan || {
              type: "free",
              startedAt: null,
              expiresAt: null,
            },
          },
        });
      } catch (error) {
        return res.status(500).send({
          success: false,
          message: error.message,
        });
      }
    });
    // user data get by email
    app.get("/user/:email", verifyToken, async (req, res) => {
      try {
        const email = req.params.email;

        const user = await usersCollection.findOne({
          email: email,
        });

        if (!user) {
          return res.send({
            success: false,
            message: "User not found /user/:email",
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
          //  ONLY UPDATE NAME + updatedAt
          updateDoc = {
            $set: {
              name: name || existingUser.name || "No Name",
              updatedAt: new Date(),
            },
          };
        } else {
          //  NEW USER
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
              plan: {
                type: "free",
                startedAt: new Date(),
                expiresAt: null,
              },
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

    app.patch(
      "/users/:email",
      verifyToken,
      checkBlockedUser,
      updateLastActive,
      async (req, res) => {
        try {
          const email = req.params.email;
          const { name } = req.body; //  photo removed

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
      },
    );
    // Send a ping to confirm a successful connection
    // await client.db("admin").command({ ping: 1 });
    // console.log(
    //   "Pinged your deployment. You successfully connected to MongoDB!",
    // );
  } catch (err) {
    // console.log(err);
  }
}
run();

// server start
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
