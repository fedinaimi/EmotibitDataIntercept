const express = require("express");
const http = require("http");
const WebSocket = require("ws");
const fs = require("fs");
const xml2js = require("xml2js");
const { createObjectCsvWriter } = require("csv-writer");
const dgram = require("dgram");

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const localAddress =  "10.54.234.137"; // Use the specific local address
const localPort = 12346; // Use the specific local port

const udpServer = dgram.createSocket("udp4");

const csvWriter = createObjectCsvWriter({
  path: "udp_data.csv",
  header: [
    { id: "timestamp", title: "Timestamp" },
    { id: "data", title: "Data" },
  ],
});

app.get("/emotibit-receiver", (req, res) => {
  res.status(200).json({ message: "WebSocket data processing started" });

  const inputXmlData = fs.readFileSync("inputSettings.xml", "utf-8");
  const outputXmlData = fs.readFileSync("oscOutputSettings.xml", "utf-8");

  const inputParser = new xml2js.Parser();
  inputParser.parseString(inputXmlData, (err, inputResult) => {
    if (err) {
      console.error("Error parsing input XML:", err);
      return;
    }

    const inputToOutputMap = {};

    const inputPatchcords = inputResult.patchboard.patchcords[0].patch;
    inputPatchcords.forEach((patch) => {
      const input = patch.input[0];
      const output = patch.output[0];
      inputToOutputMap[input] = output;
    });

    const outputParser = new xml2js.Parser();
    outputParser.parseString(outputXmlData, (outputErr, outputResult) => {
      if (outputErr) {
        console.error("Error parsing output XML:", outputErr);
        return;
      }

      const outputSettings = outputResult.patchboard.settings[0].output[0];

      if (outputSettings.type[0] !== "OSC") {
        console.error('Invalid output type. Expected "OSC".');
        return;
      }

      wss.on("connection", (ws) => {
        console.log("WebSocket connection established.");

        ws.on("message", (message) => {
          const timestamp = new Date().toISOString();
          const data = message;

          csvWriter
            .writeRecords([{ timestamp, data }])
            .then(() => console.log(`Saved data to CSV: ${timestamp}, ${data}`))
            .catch((writeError) =>
              console.error("Error writing to CSV:", writeError)
            );

          // Forward the received data to all connected WebSocket clients
          wss.clients.forEach((client) => {
            client.send(data);
            console.log(data);
          });
        });

        ws.on("close", () => {
          console.log("WebSocket connection closed.");
        });
      });
    });
  });
});

// UDP Server - Handle incoming UDP data
udpServer.on("message", (message, remoteInfo) => {
  const timestamp = new Date().toISOString();
  const data = message.toString("utf-8");

  csvWriter
    .writeRecords([{ timestamp, data }])
    .then(() => console.log(`Saved data to CSV: ${timestamp}, ${data}`))
    .catch((writeError) => console.error("Error writing to CSV:", writeError));

  if (data.includes("T1") || data.includes("HR") || data.includes("B%")) {
    wss.clients.forEach((client) => {
      client.send(data);
      console.log(data);
    });
  }
});

// Bind the UDP server to the specific local address and port
udpServer.bind(localPort, localAddress);

const port = 5050;
server.listen(port, localAddress, () => {
  console.log(`WebSocket server is listening on ${localAddress}:${port}`);
});