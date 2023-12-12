const Router = require("express").Router;
const { tokenGenerator, voiceResponse } = require("./handler");

const router = new Router();

router.get("/token/moderator", (req, res) => {
  res.send(tokenGenerator());
});

router.get("/token/moderator", (req, res) => {
  res.send(tokenGenerator(true));
});

router.post("/voice", (req, res) => {
  res.set("Content-Type", "text/xml");
  res.send(voiceResponse(req.body));
});

module.exports = router;
