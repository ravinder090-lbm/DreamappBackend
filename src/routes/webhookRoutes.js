import express from "express";

const router = express.Router();

// The verify token. In production, this should be in an environment variable.
const VERIFY_TOKEN = process.env.WEBHOOK_VERIFY_TOKEN || "my_webhook_verify_token";

// GET request to verify the webhook (Meta WhatsApp API requirement)
router.get("/", (req, res) => {
  console.log("webhoookkkkkkk workingggeedrrrrrrrg")
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];
  return res.status(200).send(challenge);
  // Check if a token and mode were sent
  if (mode && token) {
    // Check the mode and token sent are correct
    if (mode === "subscribe" && token === VERIFY_TOKEN) {
      // Respond with 200 OK and challenge token from the request
      console.log("WEBHOOK_VERIFIED");
      res.status(200).send(challenge);
    } else {
      // Responds with '403 Forbidden' if verify tokens do not match
      res.sendStatus(403);
    }
  } else {
    // Return 400 if mode or token is missing
    res.sendStatus(400);
  }
});

// POST request to receive incoming messages and status updates
router.post("/", (req, res) => {
  const body = req.body;
console.log("webhoookkkkkkk workingggg")
  // Check if this is an event from a WhatsApp API
  if (body.object) {
    // Parse the request body
    if (
      body.entry &&
      body.entry[0].changes &&
      body.entry[0].changes[0] &&
      body.entry[0].changes[0].value.messages &&
      body.entry[0].changes[0].value.messages[0]
    ) {
      const phoneNumberId = body.entry[0].changes[0].value.metadata.phone_number_id;
      const from = body.entry[0].changes[0].value.messages[0].from; // Extract the phone number from the webhook payload
      const msgBody = body.entry[0].changes[0].value.messages[0].text.body; // Extract the message text from the webhook payload

      console.log(`Received message from ${from} to ${phoneNumberId}: ${msgBody}`);
      
      // Here you would typically process the incoming message, e.g., save it to the database,
      // trigger a workflow, or send a reply.
    } else if (
      body.entry &&
      body.entry[0].changes &&
      body.entry[0].changes[0] &&
      body.entry[0].changes[0].value.statuses &&
      body.entry[0].changes[0].value.statuses[0]
    ) {
      const status = body.entry[0].changes[0].value.statuses[0].status;
      const recipientId = body.entry[0].changes[0].value.statuses[0].recipient_id;
      console.log(`Received status update for message to ${recipientId}: ${status}`);
    } else {
       console.log("Received a webhook event, but it didn't contain a typical message or status update payload.", JSON.stringify(body, null, 2));
    }

    // Return a '200 OK' response to all requests
    res.status(200).send("EVENT_RECEIVED");
  } else {
    // Return a '404 Not Found' if event is not from a WhatsApp API
    res.sendStatus(404);
  }
});

export default router;
