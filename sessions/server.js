require("dotenv").config();
const express = require("express");
const redis = require("redis");
const session = require("express-session");

const csurf = require("csurf");
const RedisStore = require("connect-redis")(session);
const authMiddleware = require("./middlewares/auth");
const db = require("./db");

const app = express();
const redisClient = redis.createClient();
const sessionDuration = 1 * 1000 * 60; // 1 minute
const csrfProtection = csurf();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(
  session({
    cookie: {
      httpOnly: true,
      // secure: true You should set this to true in production
      maxAge: sessionDuration,
    },
    resave: false,
    saveUninitialized: false,
    secret: "yourverysecretsecret", // please use a better secret than this
    store: new RedisStore({ client: redisClient, ttl: 60 }), // redis will delete the session after 60 seconds
  })
);

app.get("/", (req, res, next) => {
  if (req.session && req.session.user) {
    return res.redirect("/dashboard");
  }

  return res.send(`
		<h1>Hi! Login to access content! </h1>
		<form action="http://localhost:3000/login" method="post">
			<input type="text" name="email" placeholder="Your email"/>
			<input type ="password" name="password" placeholder="Your password"/>
			<button type="submit">Login</button>
		</form>
	`);
});

app.get(
  "/changeEmail",
  csrfProtection,
  authMiddleware,
  async (req, res, next) => {
    console.log(req.csrfToken());
    res.send(
      `<h1>change email</h1>
    <form action="http://localhost:3000/changeEmail" method="post">
      <input name="newEmail" />
      <input name="_csrf" value="${req.csrfToken()}" type="hidden"/>
      <button type="submit">Change email</h1>
    </form>`
    );
  }
);

app.post(
  "/changeEmail",
  csrfProtection,
  authMiddleware,
  async (req, res, next) => {
    const {
      body: { newEmail },
      session,
    } = req;
    console.log(session, newEmail);
    await db.query("UPDATE users SET email=$1 WHERE id=$2", [
      newEmail,
      session.user.id,
    ]);
    session.destroy((err) => {
      if (err) {
        console.log(err);
      }
      return res.redirect("/");
    });
  }
);

app.post("/login", async (req, res, next) => {
  const {
    body: { email, password },
  } = req;
  // checking login data in the database
  const result = await db.query(
    // in the real world, your password would be encrypted
    "SELECT id, email FROM users WHERE email=$1 AND password=$2",
    [email, password]
  );
  if (result.rowCount === 0) {
    return res
      .status(401)
      .send("<h1>Invalid credentials!</h1><a href='/'>Go back</a>");
  }
  // storing the user in the session for future information
  req.session.user = result.rows[0];
  return res.redirect("/dashboard");
});

app.post("/logout", authMiddleware, async (req, res, next) => {
  req.session.destroy((err) => {
    if (err) {
      console.log(err);
    }
    return res.redirect("/");
  });
});

app.get("/dashboard", authMiddleware, async (req, res, next) => {
  res.send(
    `<h1>welcome to the dashboard</h1> 
      <form action="http://localhost:3000/logout" method="post">
        <button type="submit">Logout</button>
      </form>
    <a href="/changeEmail">Change your email</a>
      `
  );
});

app.listen(3000, () => console.log("Listening in port 3000!"));
